require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('Schema applied.');

    // Locations
    const locResult = await client.query(`
      INSERT INTO locations (name, type, address) VALUES
        ('Warehouse A', 'warehouse', 'Main Warehouse, Manila'),
        ('Warehouse B', 'warehouse', 'Secondary Warehouse, Cebu'),
        ('Branch 1 - Makati', 'branch', 'Makati City'),
        ('Branch 2 - BGC', 'branch', 'BGC, Taguig'),
        ('Branch 3 - Quezon City', 'branch', 'Quezon City'),
        ('Branch 4 - Pasig', 'branch', 'Pasig City'),
        ('Branch 5 - Mandaluyong', 'branch', 'Mandaluyong City')
      ON CONFLICT DO NOTHING
      RETURNING id, name, type
    `);
    console.log('Locations:', locResult.rows.map(r => r.name).join(', '));

    // Get location IDs
    const locs = await client.query('SELECT id, name, type FROM locations ORDER BY id');
    const warehouseA = locs.rows.find(l => l.name === 'Warehouse A');
    const warehouseB = locs.rows.find(l => l.name === 'Warehouse B');
    const branch1 = locs.rows.find(l => l.name === 'Branch 1 - Makati');
    const branch2 = locs.rows.find(l => l.name === 'Branch 2 - BGC');

    // Products
    await client.query(`
      INSERT INTO products (name, unit, category) VALUES
        ('Vitamin C 500mg', 'bottle', 'Vitamins'),
        ('Fish Oil 1000mg', 'capsule', 'Supplements'),
        ('Multivitamin Complete', 'tablet', 'Vitamins'),
        ('Collagen Powder', 'sachet', 'Beauty'),
        ('Protein Shake Vanilla', 'pack', 'Sports'),
        ('Zinc Tablets 50mg', 'tablet', 'Minerals'),
        ('Vitamin D3 1000IU', 'softgel', 'Vitamins'),
        ('Omega 3 Fish Oil', 'capsule', 'Supplements'),
        ('Probiotics 10B CFU', 'capsule', 'Digestive'),
        ('Magnesium Glycinate', 'tablet', 'Minerals')
      ON CONFLICT DO NOTHING
    `);
    console.log('Products created.');

    const prods = await client.query('SELECT id, name FROM products ORDER BY id');

    // Users
    const adminPass = await bcrypt.hash('admin123', 10);
    const pass123 = await bcrypt.hash('pass123', 10);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, role, location_id) VALUES
        ('admin', $1, 'System Admin', 'admin', NULL),
        ('warehouse1', $2, 'Juan Santos', 'warehouse', $3),
        ('warehouse2', $2, 'Maria Cruz', 'warehouse', $4),
        ('manager1', $2, 'Robert Reyes', 'manager', $5),
        ('staff1', $2, 'Ana Dela Cruz', 'staff', $5),
        ('staff2', $2, 'Mark Garcia', 'staff', $6),
        ('audit1', $2, 'Liza Ramos', 'audit', NULL)
      ON CONFLICT (username) DO NOTHING
    `, [adminPass, pass123, warehouseA.id, warehouseB.id, branch1.id, branch2.id]);
    console.log('Users created.');

    // Manager branch assignments
    const manager = await client.query("SELECT id FROM users WHERE username = 'manager1'");
    if (manager.rows.length > 0) {
      await client.query(`
        INSERT INTO manager_branches (manager_id, location_id) VALUES
          ($1, $2), ($1, $3)
        ON CONFLICT DO NOTHING
      `, [manager.rows[0].id, branch1.id, branch2.id]);
    }

    // Inventory at warehouses
    const warehouseUser = await client.query("SELECT id FROM users WHERE username = 'warehouse1'");
    for (const prod of prods.rows) {
      await client.query(`
        INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [prod.id, warehouseA.id, 100, 50.00, 'BATCH-2025-01', '2026-12-31']);
      await client.query(`
        INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [prod.id, warehouseB.id, 80, 50.00, 'BATCH-2025-02', '2026-06-30']);
    }
    console.log('Inventory seeded.');

    console.log('\n=== SEED COMPLETE ===');
    console.log('Login credentials:');
    console.log('  admin / admin123 (Admin)');
    console.log('  warehouse1 / pass123 (Warehouse Staff - Warehouse A)');
    console.log('  manager1 / pass123 (Branch Manager - Branch 1 & 2)');
    console.log('  staff1 / pass123 (Branch Staff - Branch 1)');
    console.log('  audit1 / pass123 (Audit - Read Only)');
  } catch (err) {
    console.error('Seed error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
