/**
 * Migration script: thehealthshop schema → public schema
 * Uses bulk/batch operations for speed.
 * Run: node migrate_from_old_schema.js
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

function mapRole(r) {
  return { branch_manager: 'manager', branch_staff: 'staff', audit: 'audit', warehouse: 'warehouse', admin: 'admin' }[r] || 'staff';
}
function mapTransferStatus(s) {
  return { pending: 'pending', approved: 'approved', delivered: 'received', rejected: 'rejected' }[s] || 'pending';
}

// ─── Step 1: clear public schema ─────────────────────────────────────────────
async function clearDestination(client) {
  console.log('[1] Clearing public schema data...');
  const tables = [
    'stock_withdrawals', 'unit_conversions', 'sale_items', 'sales',
    'delivery_items', 'deliveries', 'transfer_items', 'transfers',
    'manager_branches', 'inventory', 'users', 'products', 'locations',
  ];
  for (const t of tables) {
    await client.query('SAVEPOINT sp');
    try {
      await client.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
      await client.query('RELEASE SAVEPOINT sp');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp');
    }
  }
  console.log('    done');
}

// ─── Step 2: locations ────────────────────────────────────────────────────────
async function migrateLocations(client) {
  console.log('[2] Migrating locations...');
  const { rows } = await client.query(
    'SELECT id, name, type, address, created_at FROM thehealthshop.locations ORDER BY id'
  );
  for (const r of rows) {
    await client.query(
      `INSERT INTO locations (id, name, type, address, is_active, created_at)
       VALUES ($1,$2,$3,$4,true,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.type, r.address, r.created_at]
    );
  }
  await client.query(`SELECT setval('locations_id_seq', (SELECT MAX(id) FROM locations), true)`);
  console.log(`    ${rows.length} locations`);
}

// ─── Step 3: users ────────────────────────────────────────────────────────────
async function migrateUsers(client) {
  console.log('[3] Migrating users...');
  const { rows } = await client.query(
    'SELECT id, username, password, full_name, role, location_id, created_at FROM thehealthshop.users ORDER BY id'
  );
  for (const r of rows) {
    await client.query(
      `INSERT INTO users (id, username, password_hash, full_name, role, location_id, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.username, r.password, r.full_name, mapRole(r.role), r.location_id, r.created_at]
    );
  }
  await client.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users), true)`);
  console.log(`    ${rows.length} users`);
}

// ─── Step 4: products + inventory (bulk) ─────────────────────────────────────
async function migrateInventory(client) {
  console.log('[4] Building products from old inventory...');

  // Fetch all old inventory at once
  const { rows: invRows } = await client.query(
    `SELECT id, location_id, description, unit, quantity, unit_cost,
            suggested_selling_price, batch_number, expiry_date, created_at, main_category
     FROM thehealthshop.inventory ORDER BY id`
  );

  // Build unique product set: key = "name|||unit"
  const productMap = new Map(); // key → { name, unit, category }
  for (const r of invRows) {
    if (!r.description || !r.unit) continue;
    const key = `${r.description.trim().toLowerCase()}|||${r.unit.trim().toLowerCase()}`;
    if (!productMap.has(key)) {
      productMap.set(key, { name: r.description.trim(), unit: r.unit.trim(), category: r.main_category || null });
    }
  }

  console.log(`    ${productMap.size} unique products to insert...`);

  // Bulk insert products in chunks of 500
  const productList = [...productMap.entries()]; // [[key, {name,unit,category}]]
  const chunkSize = 500;
  for (let i = 0; i < productList.length; i += chunkSize) {
    const chunk = productList.slice(i, i + chunkSize);
    const vals = [];
    const placeholders = chunk.map((_, j) => {
      const base = j * 3;
      vals.push(chunk[j][1].name, chunk[j][1].unit, chunk[j][1].category);
      return `($${base + 1}, $${base + 2}, $${base + 3}, true)`;
    });
    await client.query(
      `INSERT INTO products (name, unit, category, is_active) VALUES ${placeholders.join(',')}
       ON CONFLICT DO NOTHING`,
      vals
    );
  }

  // Fetch all products to build name+unit → id map
  const { rows: prodRows } = await client.query('SELECT id, LOWER(name) as n, LOWER(unit) as u FROM products');
  const pidMap = new Map(); // "lower_name|||lower_unit" → id
  for (const p of prodRows) {
    pidMap.set(`${p.n}|||${p.u}`, p.id);
  }

  await client.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products), true)`);
  console.log(`    Total products in DB: ${prodRows.length}. Now inserting inventory...`);

  // Bulk insert inventory in chunks
  let skipped = 0;
  const invInserts = [];
  for (const r of invRows) {
    if (!r.description || !r.unit) { skipped++; continue; }
    const key = `${r.description.trim().toLowerCase()}|||${r.unit.trim().toLowerCase()}`;
    const pid = pidMap.get(key);
    if (!pid) { skipped++; continue; }
    invInserts.push([
      r.id, pid, r.location_id,
      Math.max(0, parseFloat(r.quantity) || 0),
      r.unit_cost, r.suggested_selling_price, r.batch_number, r.expiry_date, r.created_at,
    ]);
  }

  for (let i = 0; i < invInserts.length; i += chunkSize) {
    const chunk = invInserts.slice(i, i + chunkSize);
    const vals = [];
    const placeholders = chunk.map((row, j) => {
      const base = j * 9;
      vals.push(...row);
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`;
    });
    await client.query(
      `INSERT INTO inventory (id,product_id,location_id,quantity,unit_cost,suggested_selling_price,batch_number,expiry_date,created_at)
       VALUES ${placeholders.join(',')} ON CONFLICT (id) DO NOTHING`,
      vals
    );
    process.stdout.write(`    ${Math.min(i + chunkSize, invInserts.length)}/${invInserts.length}\r`);
  }

  await client.query(`SELECT setval('inventory_id_seq', (SELECT MAX(id) FROM inventory), true)`);
  console.log(`\n    ${invInserts.length} inventory rows, ${skipped} skipped`);

  return pidMap;
}

// ─── Step 5: manager_branches ─────────────────────────────────────────────────
async function migrateManagerBranches(client) {
  console.log('[5] Migrating manager_branches...');
  await client.query('SAVEPOINT sp_mb');
  let rows;
  try {
    const r = await client.query('SELECT user_id, location_id FROM thehealthshop.manager_branches');
    rows = r.rows;
    await client.query('RELEASE SAVEPOINT sp_mb');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_mb');
    console.log('    skipped (table not found)');
    return;
  }
  for (const r of rows) {
    await client.query('SAVEPOINT sp_mb_row');
    try {
      await client.query(
        `INSERT INTO manager_branches (manager_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [r.user_id, r.location_id]
      );
      await client.query('RELEASE SAVEPOINT sp_mb_row');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_mb_row');
    }
  }
  console.log(`    ${rows.length} manager_branches`);
}

// ─── Step 6: transfers ────────────────────────────────────────────────────────
async function migrateTransfers(client) {
  console.log('[6] Migrating transfers...');
  const { rows: allRows } = await client.query(
    `SELECT id, from_location_id, to_location_id, status, transferred_by, notes, created_at
     FROM thehealthshop.transfers ORDER BY id`
  );
  const rows = allRows.filter(r => r.from_location_id && r.to_location_id);
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const vals = [];
    const placeholders = chunk.map((r, j) => {
      const base = j * 7;
      vals.push(
        r.id, r.from_location_id, r.to_location_id, mapTransferStatus(r.status),
        r.transferred_by, r.notes || null, r.created_at
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;
    });
    await client.query(
      `INSERT INTO transfers (id,from_location_id,to_location_id,status,requested_by,notes,created_at)
       VALUES ${placeholders.join(',')} ON CONFLICT (id) DO NOTHING`,
      vals
    );
  }
  await client.query(`SELECT setval('transfers_id_seq', (SELECT MAX(id) FROM transfers), true)`);
  console.log(`    ${rows.length} transfers`);
}

// ─── Step 7: transfer_items ───────────────────────────────────────────────────
async function migrateTransferItems(client, pidMap) {
  console.log('[7] Migrating transfer_items...');
  const { rows } = await client.query(
    `SELECT id, transfer_id, description, unit, quantity, unit_cost FROM thehealthshop.transfer_items ORDER BY id`
  );
  // Build set of valid transfer IDs in destination
  const { rows: validTransfers } = await client.query('SELECT id FROM transfers');
  const validTransferIds = new Set(validTransfers.map(r => r.id));

  let count = 0, skipped = 0;
  const chunkSize = 500;
  const inserts = [];
  for (const r of rows) {
    if (!r.description || !r.unit) { skipped++; continue; }
    if (!validTransferIds.has(r.transfer_id)) { skipped++; continue; }
    const key = `${r.description.trim().toLowerCase()}|||${r.unit.trim().toLowerCase()}`;
    const pid = pidMap.get(key);
    if (!pid) { skipped++; continue; }
    inserts.push([r.id, r.transfer_id, pid, Math.max(0, parseFloat(r.quantity) || 0), r.unit_cost]);
  }
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const vals = [];
    const placeholders = chunk.map((row, j) => {
      const base = j * 5;
      vals.push(...row);
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+4},$${base+5})`;
    });
    await client.query(
      `INSERT INTO transfer_items (id,transfer_id,product_id,quantity_sent,quantity_received,unit_cost)
       VALUES ${placeholders.join(',')} ON CONFLICT (id) DO NOTHING`,
      vals
    );
    count += chunk.length;
  }
  await client.query(`SELECT setval('transfer_items_id_seq', COALESCE((SELECT MAX(id) FROM transfer_items),1), true)`);
  console.log(`    ${count} transfer_items, ${skipped} skipped`);
}

// ─── Step 8: sales_transactions → sales + sale_items ─────────────────────────
async function migrateSales(client, pidMap) {
  console.log('[8] Migrating sales_transactions → sales + sale_items...');
  const { rows } = await client.query(
    `SELECT id, transaction_date, location_id, item_description, item_unit,
            quantity_sold, unit_price, total_amount, payment_method, sold_by, created_at
     FROM thehealthshop.sales_transactions ORDER BY id`
  );

  let salesCount = 0, skipped = 0;
  const chunkSize = 200;

  // Get a fallback user id (first admin or any user)
  const fallbackUser = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
  const fallbackUserId = fallbackUser.rows[0]?.id || 1;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).filter(r => r.location_id);

    if (chunk.length === 0) { salesCount += rows.slice(i, i + chunkSize).length; continue; }

    // Insert sale headers in bulk
    const saleVals = [];
    const salePlaceholders = chunk.map((r, j) => {
      const base = j * 5;
      saleVals.push(
        r.location_id, r.sold_by || fallbackUserId, r.total_amount || 0,
        r.payment_method || 'cash', r.transaction_date || r.created_at
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`;
    });

    const saleResult = await client.query(
      `INSERT INTO sales (location_id,sold_by,total_amount,payment_method,created_at)
       VALUES ${salePlaceholders.join(',')} RETURNING id`,
      saleVals
    );

    const saleIds = saleResult.rows.map(r => r.id);

    // Insert sale_items in bulk
    const itemVals = [];
    const itemPlaceholders = [];
    let itemIdx = 0;
    for (let k = 0; k < chunk.length; k++) {
      const r = chunk[k];
      if (!r.item_description || !r.item_unit) { skipped++; continue; }
      const key = `${r.item_description.trim().toLowerCase()}|||${r.item_unit.trim().toLowerCase()}`;
      const pid = pidMap.get(key);
      if (!pid) { skipped++; continue; }
      const base = itemIdx * 6;
      itemVals.push(saleIds[k], pid, r.quantity_sold, r.unit_price, null, r.total_amount);
      itemPlaceholders.push(`($${base+1},$${base+2},NULL,$${base+3},$${base+4},$${base+5},$${base+6})`);
      itemIdx++;
    }
    if (itemPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO sale_items (sale_id,product_id,inventory_id,quantity,unit_price,unit_cost,subtotal)
         VALUES ${itemPlaceholders.join(',')}`,
        itemVals
      );
    }

    salesCount += chunk.length;
    process.stdout.write(`    ${salesCount}/${rows.length}\r`);
  }

  console.log(`\n    ${salesCount} sales created, ${skipped} items skipped`);
}

// ─── Step 9: deliveries ───────────────────────────────────────────────────────
async function migrateDeliveries(client) {
  // Old deliveries = supplier purchase deliveries (supplier, invoice_number, received_by)
  // New deliveries = internal location-to-location delivery requests (from_location_id, to_location_id, created_by)
  // Schemas are incompatible — skip to avoid data corruption.
  console.log('[9] Deliveries: schema incompatible with new structure, skipping.');
}

// ─── Step 10: delivery_items ──────────────────────────────────────────────────
async function migrateDeliveryItems(client, pidMap) {
  // No delivery headers migrated, so items have no parent — skip.
  console.log('[10] Delivery items: skipped (no delivery headers to reference).');
  return;
  console.log('[10] Migrating delivery_items...');
  const { rows } = await client.query(
    `SELECT id, delivery_id, description, unit, quantity, unit_cost, batch_number, expiry_date
     FROM thehealthshop.delivery_items ORDER BY id`
  );
  let count = 0, skipped = 0;
  const chunkSize = 500;
  const inserts = [];
  for (const r of rows) {
    if (!r.description || !r.unit) { skipped++; continue; }
    const key = `${r.description.trim().toLowerCase()}|||${r.unit.trim().toLowerCase()}`;
    const pid = pidMap.get(key);
    inserts.push([r.id, r.delivery_id, r.description, r.unit, r.quantity, r.unit_cost, r.batch_number, r.expiry_date, pid || null]);
  }
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const vals = [];
    const placeholders = chunk.map((row, j) => {
      const base = j * 9;
      vals.push(...row);
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`;
    });
    await client.query(
      `INSERT INTO delivery_items (id,delivery_id,description,unit,quantity,unit_cost,batch_number,expiry_date,product_id)
       VALUES ${placeholders.join(',')} ON CONFLICT (id) DO NOTHING`,
      vals
    );
    count += chunk.length;
  }
  await client.query(`SELECT setval('delivery_items_id_seq', COALESCE((SELECT MAX(id) FROM delivery_items),1), true)`);
  console.log(`    ${count} delivery_items, ${skipped} skipped`);
}

// ─── Step 11: unit_conversions ────────────────────────────────────────────────
async function migrateUnitConversions(client, pidMap) {
  console.log('[11] Migrating unit_conversions...');
  await client.query('SAVEPOINT sp_uc');
  let rows;
  try {
    const r = await client.query(
      `SELECT id, product_description, base_unit, converted_unit, conversion_factor FROM thehealthshop.unit_conversions ORDER BY id`
    );
    rows = r.rows;
    await client.query('RELEASE SAVEPOINT sp_uc');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_uc');
    console.log('    skipped (table not found)');
    return;
  }
  let count = 0, skipped = 0;
  for (const r of rows) {
    if (!r.product_description || !r.base_unit) { skipped++; continue; }
    const key = `${r.product_description.trim().toLowerCase()}|||${r.base_unit.trim().toLowerCase()}`;
    const pid = pidMap.get(key);
    if (!pid) { skipped++; continue; }
    await client.query('SAVEPOINT sp_uc_row');
    try {
      await client.query(
        `INSERT INTO unit_conversions (id, product_id, from_unit, to_unit, factor)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [r.id, pid, r.base_unit, r.converted_unit, r.conversion_factor]
      );
      await client.query('RELEASE SAVEPOINT sp_uc_row');
      count++;
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_uc_row');
      skipped++;
    }
  }
  await client.query(`SELECT setval('unit_conversions_id_seq', COALESCE((SELECT MAX(id) FROM unit_conversions),1), true)`);
  console.log(`    ${count} unit_conversions, ${skipped} skipped`);
}

// ─── Step 12: stock_withdrawals ───────────────────────────────────────────────
async function migrateStockWithdrawals(client) {
  console.log('[12] Migrating stock_withdrawals...');
  await client.query('SAVEPOINT sp_sw');
  let rows;
  try {
    const r = await client.query(`SELECT * FROM thehealthshop.stock_withdrawals ORDER BY id`);
    rows = r.rows;
    await client.query('RELEASE SAVEPOINT sp_sw');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_sw');
    console.log('    skipped (table not found)');
    return;
  }
  if (rows.length === 0) { console.log('    0 rows'); return; }
  console.log(`    ${rows.length} rows found, columns: ${Object.keys(rows[0]).join(', ')}`);
  // Dynamic insert based on matching columns with destination
  const destColRes = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_withdrawals'`
  );
  const destCols = destColRes.rows.map(c => c.column_name);
  const srcCols = Object.keys(rows[0]);
  const commonCols = srcCols.filter(c => destCols.includes(c));
  let count = 0;
  const chunkSize = 200;
  const inserts = rows.map(r => commonCols.map(c => r[c]));
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const vals = [];
    const placeholders = chunk.map((row, j) => {
      const base = j * commonCols.length;
      vals.push(...row);
      return `(${commonCols.map((_, k) => `$${base + k + 1}`).join(',')})`;
    });
    await client.query('SAVEPOINT sp_sw_chunk');
    try {
      await client.query(
        `INSERT INTO stock_withdrawals (${commonCols.join(',')}) VALUES ${placeholders.join(',')} ON CONFLICT (id) DO NOTHING`,
        vals
      );
      await client.query('RELEASE SAVEPOINT sp_sw_chunk');
      count += chunk.length;
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT sp_sw_chunk');
      console.log(`    chunk error: ${e.message}`);
    }
  }
  await client.query(`SELECT setval('stock_withdrawals_id_seq', COALESCE((SELECT MAX(id) FROM stock_withdrawals),1), true)`);
  console.log(`    ${count} stock_withdrawals`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
async function printSummary(client) {
  console.log('\n========== MIGRATION SUMMARY ==========');
  const tables = [
    'locations', 'users', 'products', 'inventory',
    'manager_branches', 'transfers', 'transfer_items',
    'sales', 'sale_items',
    'unit_conversions', 'stock_withdrawals',
  ];
  for (const t of tables) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  ${t.padEnd(22)} ${rows[0].count}`);
    } catch {
      console.log(`  ${t.padEnd(22)} (not found)`);
    }
  }
  console.log('========================================');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Migration start: thehealthshop → public');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await clearDestination(client);
    await migrateLocations(client);
    await migrateUsers(client);
    const pidMap = await migrateInventory(client);
    await migrateManagerBranches(client);
    await migrateTransfers(client);
    await migrateTransferItems(client, pidMap);
    await migrateSales(client, pidMap);
    await migrateDeliveries(client);
    await migrateDeliveryItems(client, pidMap);
    await migrateUnitConversions(client, pidMap);
    await migrateStockWithdrawals(client);

    await client.query('COMMIT');
    console.log('\n✓ Migration committed!');
    await printSummary(client);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Migration FAILED, rolled back:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
