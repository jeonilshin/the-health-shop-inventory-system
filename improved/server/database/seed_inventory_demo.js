require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Branch 1 - Makati (location_id = 3)
const BRANCH = 3;

// Simulates the exact scenario the user described + more realistic cases
const batches = [

  // ─── Vitamin C 500mg (id=1) — 5 batches, different costs, mix of expiry/no-expiry ───
  // Shows the full FIFO scenario from the user's question
  { product_id: 1, qty: 50,  cost: 85.00, batch: null,           expiry: null,         label: 'VC no-expiry #1 (cost 85)' },
  { product_id: 1, qty: 80,  cost: 85.00, batch: null,           expiry: null,         label: 'VC no-expiry #2 (cost 85, diff delivery)' },
  { product_id: 1, qty: 100, cost: 90.00, batch: 'VC-2025-A',    expiry: '2027-10-11', label: 'VC expiry Oct 2027 (FIFO #1)' },
  { product_id: 1, qty: 60,  cost: 90.00, batch: null,           expiry: null,         label: 'VC no-expiry #3 (cost 90)' },
  { product_id: 1, qty: 75,  cost: 90.00, batch: 'VC-2025-B',    expiry: '2027-11-11', label: 'VC expiry Nov 2027 (FIFO #2)' },

  // ─── Protein Shake Vanilla (id=5) — batch numbers + one expiring soon ───
  { product_id: 5, qty: 18,  cost: 350.00, batch: 'PS-2025-001', expiry: '2026-07-03', label: 'PS expiring soon!' },
  { product_id: 5, qty: 45,  cost: 360.00, batch: 'PS-2025-002', expiry: '2027-03-20', label: 'PS good batch' },
  { product_id: 5, qty: 12,  cost: 365.00, batch: 'PS-2026-001', expiry: null,         label: 'PS no-expiry latest cost' },

  // ─── Zinc Tablets 50mg (id=6) — one EXPIRED + one good = shows worst-status on product row ───
  { product_id: 6, qty: 10,  cost: 55.00,  batch: 'ZN-2023-A',   expiry: '2025-12-31', label: 'ZN EXPIRED batch' },
  { product_id: 6, qty: 200, cost: 62.00,  batch: 'ZN-2025-A',   expiry: '2027-06-30', label: 'ZN good batch' },

  // ─── Fish Oil 1000mg (id=2) — low stock (total < 10) ───
  { product_id: 2, qty: 4,   cost: 120.00, batch: null,           expiry: null,         label: 'FO low stock batch A' },
  { product_id: 2, qty: 3,   cost: 125.00, batch: 'FO-2025-01',   expiry: '2026-08-20', label: 'FO low stock + expiring' },

  // ─── Multivitamin Complete (id=3) — single batch, simple case ───
  { product_id: 3, qty: 150, cost: 95.00,  batch: 'MV-2025-001', expiry: '2027-05-15', label: 'MV single batch' },

  // ─── Collagen Powder (id=4) — two batches same cost, different expiry ───
  { product_id: 4, qty: 30,  cost: 280.00, batch: 'CP-2025-A',   expiry: '2027-01-10', label: 'CP earlier expiry' },
  { product_id: 4, qty: 50,  cost: 280.00, batch: 'CP-2025-B',   expiry: '2027-08-20', label: 'CP later expiry' },
];

async function seed() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const b of batches) {
      const res = await client.query(
        `INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [b.product_id, BRANCH, b.qty, b.cost, b.batch || null, b.expiry || null]
      );
      console.log(`✓ [${res.rows[0].id}] ${b.label}`);
      inserted++;
    }
    console.log(`\nDone. Inserted ${inserted} inventory batches at Branch 1 (Makati).`);
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
