/**
 * Replaces improved schema tables with views that read live from thehealthshop.
 * Run once: node database/setup_views.js
 *
 * After this runs, the improved UI shows real live thehealthshop data.
 * improved.products and activity_log stay as real tables.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Ensure audit user exists in thehealthshop ─────────────────────────
    console.log('[1] Ensuring audit user in thehealthshop...');
    const bcrypt = require('bcryptjs');
    const { rows: auditCheck } = await client.query(
      "SELECT id FROM thehealthshop.users WHERE username = 'audit' LIMIT 1"
    );
    if (auditCheck.length === 0) {
      const hash = await bcrypt.hash('audit2025!', 10);
      const { rows: newAudit } = await client.query(
        `INSERT INTO thehealthshop.users (username, password, full_name, role)
         VALUES ('audit', $1, 'Audit Account', 'audit') RETURNING id`,
        [hash]
      );
      console.log('    Created audit user id:', newAudit[0].id);
    } else {
      console.log('    Already exists (id:', auditCheck[0].id, ')');
    }

    // ── 2. Drop existing improved tables (order matters for FK constraints) ──
    console.log('[2] Dropping old improved tables...');
    const drops = [
      'stock_withdrawal_items', 'stock_withdrawals',
      'sale_items', 'sales',
      'transfer_items', 'transfers',
      'unit_conversions',
      'manager_branches',
      'inventory',
      'users',
      'locations',
    ];
    for (const t of drops) {
      await client.query(`DROP TABLE IF EXISTS improved.${t} CASCADE`);
      console.log('    dropped improved.' + t);
    }

    // ── 3. Create views ───────────────────────────────────────────────────────
    console.log('[3] Creating views...');

    // locations
    await client.query(`
      CREATE VIEW improved.locations AS
      SELECT id, name, type, address, true AS is_active, created_at
      FROM thehealthshop.locations
    `);
    console.log('    ✓ locations');

    // users — map branch_manager → manager, branch_staff → staff
    await client.query(`
      CREATE VIEW improved.users AS
      SELECT
        id, username, password AS password_hash, full_name,
        CASE role
          WHEN 'branch_manager' THEN 'manager'
          WHEN 'branch_staff'   THEN 'staff'
          ELSE role
        END AS role,
        location_id,
        true AS is_active,
        NULL::timestamp AS last_login,
        created_at
      FROM thehealthshop.users
    `);
    console.log('    ✓ users');

    // manager_branches — old schema uses user_id, new uses manager_id
    await client.query(`
      CREATE VIEW improved.manager_branches AS
      SELECT user_id AS manager_id, location_id
      FROM thehealthshop.manager_branches
    `);
    console.log('    ✓ manager_branches');

    // inventory — JOIN with improved.products on name+unit to get stable product_id
    await client.query(`
      CREATE VIEW improved.inventory AS
      SELECT
        i.id,
        p.id AS product_id,
        i.location_id,
        i.quantity,
        i.unit_cost,
        i.suggested_selling_price,
        i.batch_number,
        i.expiry_date,
        i.created_at AS received_date,
        i.created_at,
        COALESCE(i.updated_at, i.created_at) AS updated_at
      FROM thehealthshop.inventory i
      JOIN improved.products p
        ON lower(trim(i.description)) = lower(p.name)
        AND lower(trim(i.unit)) = lower(p.unit)
    `);
    console.log('    ✓ inventory');

    // sales — each sales_transaction row = one receipt
    await client.query(`
      CREATE VIEW improved.sales AS
      SELECT
        id,
        location_id,
        sold_by,
        customer_name,
        COALESCE(total_amount, 0) AS total_amount,
        COALESCE(discount_amount, 0) AS discount_amount,
        notes,
        CASE
          WHEN cancellation_status IN ('cancelled','approved') THEN 'cancelled'
          ELSE 'completed'
        END AS status,
        cancelled_by,
        cancelled_at,
        cancellation_reason AS cancel_reason,
        NULL::int AS cancel_requested_by,
        NULL::text AS cancel_request_reason,
        NULL::timestamp AS cancel_requested_at,
        payment_method,
        COALESCE(transaction_date, created_at) AS created_at
      FROM thehealthshop.sales_transactions
    `);
    console.log('    ✓ sales');

    // sale_items — each row is also its own sale item
    await client.query(`
      CREATE VIEW improved.sale_items AS
      SELECT
        st.id,
        st.id AS sale_id,
        p.id AS product_id,
        NULL::int AS inventory_id,
        st.quantity_sold AS quantity,
        st.unit_price,
        NULL::numeric AS unit_cost,
        COALESCE(st.total_amount, 0) AS subtotal
      FROM thehealthshop.sales_transactions st
      LEFT JOIN improved.products p
        ON lower(trim(st.item_description)) = lower(p.name)
        AND lower(trim(st.item_unit)) = lower(p.unit)
    `);
    console.log('    ✓ sale_items');

    // transfers
    await client.query(`
      CREATE VIEW improved.transfers AS
      SELECT
        id,
        from_location_id,
        to_location_id,
        CASE status
          WHEN 'delivered' THEN 'received'
          ELSE COALESCE(status, 'pending')
        END AS status,
        transferred_by AS requested_by,
        NULL::int AS approved_by,
        NULL::int AS received_by,
        notes,
        NULL::text AS rejection_reason,
        NULL::timestamp AS approved_at,
        NULL::timestamp AS shipped_at,
        NULL::timestamp AS received_at,
        COALESCE(transfer_date, created_at) AS created_at
      FROM thehealthshop.transfers
    `);
    console.log('    ✓ transfers');

    // transfer_items — from thehealthshop.transfer_items + inline items from old transfers
    await client.query(`
      CREATE VIEW improved.transfer_items AS
      SELECT
        ti.id,
        ti.transfer_id,
        p.id AS product_id,
        ti.quantity AS quantity_sent,
        ti.quantity AS quantity_received,
        ti.unit_cost,
        ti.batch_number,
        ti.expiry_date
      FROM thehealthshop.transfer_items ti
      LEFT JOIN improved.products p
        ON lower(trim(ti.description)) = lower(p.name)
        AND lower(trim(ti.unit)) = lower(p.unit)
      UNION ALL
      SELECT
        t.id + 1000000 AS id,
        t.id AS transfer_id,
        p.id AS product_id,
        t.quantity AS quantity_sent,
        t.quantity AS quantity_received,
        t.unit_cost,
        NULL AS batch_number,
        NULL AS expiry_date
      FROM thehealthshop.transfers t
      LEFT JOIN improved.products p
        ON lower(trim(t.description)) = lower(p.name)
        AND lower(trim(t.unit)) = lower(p.unit)
      WHERE NOT EXISTS (
        SELECT 1 FROM thehealthshop.transfer_items ti2
        WHERE ti2.transfer_id = t.id
      )
        AND t.description IS NOT NULL
    `);
    console.log('    ✓ transfer_items');

    // unit_conversions
    await client.query(`
      CREATE VIEW improved.unit_conversions AS
      SELECT
        uc.id,
        p.id AS product_id,
        uc.base_unit AS from_unit,
        uc.converted_unit AS to_unit,
        uc.conversion_factor AS factor
      FROM thehealthshop.unit_conversions uc
      LEFT JOIN improved.products p
        ON lower(trim(uc.product_description)) = lower(p.name)
    `);
    console.log('    ✓ unit_conversions');

    // stock_withdrawals — each old row becomes a withdrawal header
    await client.query(`
      CREATE VIEW improved.stock_withdrawals AS
      SELECT
        id,
        location_id,
        withdrawn_by,
        COALESCE(withdrawal_type, 'other') AS withdrawal_type,
        COALESCE(notes, '') AS reason,
        quantity * COALESCE(unit_cost, 0) AS total_value,
        notes,
        COALESCE(withdrawn_at, created_at) AS created_at
      FROM thehealthshop.stock_withdrawals
    `);
    console.log('    ✓ stock_withdrawals');

    // stock_withdrawal_items — one item per old withdrawal row
    await client.query(`
      CREATE VIEW improved.stock_withdrawal_items AS
      SELECT
        sw.id,
        sw.id AS withdrawal_id,
        p.id AS product_id,
        sw.quantity,
        sw.unit_cost,
        NULL::text AS batch_number,
        NULL::date AS expiry_date,
        sw.quantity * COALESCE(sw.unit_cost, 0) AS subtotal
      FROM thehealthshop.stock_withdrawals sw
      LEFT JOIN improved.products p
        ON lower(trim(sw.item_description)) = lower(p.name)
        AND lower(trim(sw.unit)) = lower(p.unit)
    `);
    console.log('    ✓ stock_withdrawal_items');

    // ── 4. Quick sanity check ─────────────────────────────────────────────────
    console.log('[4] Sanity check...');
    const checks = await Promise.all([
      client.query('SELECT COUNT(*) FROM improved.locations'),
      client.query('SELECT COUNT(*) FROM improved.users'),
      client.query('SELECT COUNT(*) FROM improved.inventory'),
      client.query('SELECT COUNT(*) FROM improved.sales'),
    ]);
    console.log('    locations:', checks[0].rows[0].count);
    console.log('    users:    ', checks[1].rows[0].count);
    console.log('    inventory:', checks[2].rows[0].count);
    console.log('    sales:    ', checks[3].rows[0].count);

    await client.query('COMMIT');
    console.log('\n✓ Views created. The improved UI now reads live from thehealthshop schema.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Failed, rolled back:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
