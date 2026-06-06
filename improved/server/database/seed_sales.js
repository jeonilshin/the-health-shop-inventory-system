require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  const client = await pool.connect();
  try {
    // Fetch staff/manager users (sold_by must be a valid user)
    const usersRes = await client.query(
      `SELECT id, full_name, role, location_id FROM users WHERE role IN ('staff','manager','admin') AND location_id IS NOT NULL LIMIT 10`
    );
    if (usersRes.rows.length === 0) throw new Error('No staff/manager users found');

    // Fetch products with inventory
    const invRes = await client.query(
      `SELECT i.id as inv_id, i.product_id, i.location_id, i.quantity, i.unit_cost,
              p.name as product_name, l.name as location_name
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN locations l ON i.location_id = l.id
       WHERE i.quantity > 5
       ORDER BY i.location_id, i.quantity DESC`
    );
    if (invRes.rows.length === 0) throw new Error('No inventory found');

    // Group inventory by location
    const byLocation = {};
    for (const row of invRes.rows) {
      if (!byLocation[row.location_id]) byLocation[row.location_id] = [];
      byLocation[row.location_id].push(row);
    }

    const locations = Object.keys(byLocation);
    const customers = ['Walk-in Customer', 'Maria Santos', 'Juan Dela Cruz', 'Ana Reyes', 'Pedro Bautista', null, null, null];

    const sampleSales = [
      { daysAgo: 30, qty: 2, priceMultiplier: 1.3 },
      { daysAgo: 25, qty: 1, priceMultiplier: 1.25 },
      { daysAgo: 20, qty: 3, priceMultiplier: 1.2 },
      { daysAgo: 18, qty: 2, priceMultiplier: 1.35 },
      { daysAgo: 15, qty: 1, priceMultiplier: 1.3 },
      { daysAgo: 12, qty: 4, priceMultiplier: 1.2 },
      { daysAgo: 10, qty: 2, priceMultiplier: 1.25 },
      { daysAgo: 7,  qty: 1, priceMultiplier: 1.3 },
      { daysAgo: 5,  qty: 3, priceMultiplier: 1.2 },
      { daysAgo: 3,  qty: 2, priceMultiplier: 1.35 },
      { daysAgo: 2,  qty: 1, priceMultiplier: 1.3 },
      { daysAgo: 1,  qty: 2, priceMultiplier: 1.25 },
    ];

    let inserted = 0;

    for (const template of sampleSales) {
      const locId = locations[inserted % locations.length];
      const invAtLoc = byLocation[locId];
      if (!invAtLoc || invAtLoc.length === 0) continue;

      // Pick a random product from this location
      const inv = invAtLoc[inserted % invAtLoc.length];
      const user = usersRes.rows.find((u) => String(u.location_id) === String(locId)) || usersRes.rows[0];
      const customer = customers[inserted % customers.length];
      const qty = Math.min(template.qty, Math.floor(parseFloat(inv.quantity) / 2));
      if (qty <= 0) continue;

      const unitCost = parseFloat(inv.unit_cost) || 50;
      const unitPrice = parseFloat((unitCost * template.priceMultiplier).toFixed(2));
      const subtotal = qty * unitPrice;
      const createdAt = new Date(Date.now() - template.daysAgo * 24 * 60 * 60 * 1000).toISOString();

      await client.query('BEGIN');
      try {
        // Deduct inventory (FIFO)
        const fifoRows = await client.query(
          `SELECT * FROM inventory WHERE product_id = $1 AND location_id = $2 AND quantity > 0 ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
          [inv.product_id, locId]
        );
        let remaining = qty;
        for (const row of fifoRows.rows) {
          if (remaining <= 0) break;
          const deduct = Math.min(parseFloat(row.quantity), remaining);
          await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [deduct, row.id]);
          await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [row.id]);
          remaining -= deduct;
        }

        // Insert sale with backdated timestamp
        const saleRes = await client.query(
          `INSERT INTO sales (location_id, sold_by, customer_name, total_amount, discount_amount, notes, created_at)
           VALUES ($1, $2, $3, $4, 0, $5, $6) RETURNING id`,
          [locId, user.id, customer, subtotal, 'Sample sale data', createdAt]
        );
        const saleId = saleRes.rows[0].id;

        // Insert sale item
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, inventory_id, quantity, unit_price, unit_cost, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [saleId, inv.product_id, inv.inv_id, qty, unitPrice, unitCost, subtotal]
        );

        // Activity log
        await client.query(
          `INSERT INTO activity_log (action_type, performed_by, performer_name, performer_role,
            location_id, location_name, product_id, product_name, reference_type, reference_id,
            quantity_change, unit_cost, details, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sale',$9,$10,$11,$12,$13)`,
          ['sale', user.id, user.full_name, user.role,
           locId, inv.location_name, inv.product_id, inv.product_name,
           saleId, -qty, unitCost, JSON.stringify({ unit_price: unitPrice, subtotal, customer }), createdAt]
        );

        await client.query('COMMIT');
        console.log(`✓ Sale #${saleId}: ${inv.product_name} x${qty} @ ₱${unitPrice} = ₱${subtotal} (${inv.location_name}) [${template.daysAgo} days ago]`);
        inserted++;
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`✗ Failed sale for ${inv.product_name}:`, e.message);
      }
    }

    console.log(`\nDone. Inserted ${inserted} sample sales.`);
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
