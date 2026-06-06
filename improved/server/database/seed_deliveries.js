require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seedDeliveries() {
  const client = await pool.connect();
  try {
    // Get location IDs
    const locs = await client.query('SELECT id, name, type FROM locations ORDER BY id');
    const warehouseA = locs.rows.find(l => l.name === 'Warehouse A');
    const warehouseB = locs.rows.find(l => l.name === 'Warehouse B');
    const branch1    = locs.rows.find(l => l.name === 'Branch 1 - Makati');
    const branch2    = locs.rows.find(l => l.name === 'Branch 2 - BGC');
    const branch3    = locs.rows.find(l => l.name === 'Branch 3 - Quezon City');
    const branch4    = locs.rows.find(l => l.name === 'Branch 4 - Pasig');
    const branch5    = locs.rows.find(l => l.name === 'Branch 5 - Mandaluyong');

    // Get user IDs
    const users = await client.query('SELECT id, full_name, role FROM users ORDER BY id');
    const admin      = users.rows.find(u => u.role === 'admin');
    const warehouse1 = users.rows.find(u => u.full_name === 'Juan Santos');
    const warehouse2 = users.rows.find(u => u.full_name === 'Maria Cruz');

    console.log('Inserting sample deliveries...');

    // Helper to insert a delivery + items, returns delivery id
    async function insertDelivery({ fromId, toId, status, deliveredDate, createdBy, adminConfirmedBy, notes, createdAt, items }) {
      const isDelivered = status === 'delivered';
      const isConfirmed = ['admin_confirmed', 'in_transit', 'delivered'].includes(status);

      const res = await client.query(`
        INSERT INTO deliveries
          (from_location_id, to_location_id, delivery_date, status, notes,
           created_by, admin_confirmed, admin_confirmed_by, admin_confirmed_at,
           delivered_date, created_at, updated_at)
        VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9,$10,$10)
        RETURNING id
      `, [
        fromId, toId, status, notes || null,
        createdBy,
        isConfirmed,
        isConfirmed ? adminConfirmedBy : null,
        isConfirmed ? (createdAt || new Date()) : null,
        isDelivered ? (deliveredDate || new Date()) : null,
        createdAt || new Date(),
      ]);

      const deliveryId = res.rows[0].id;

      for (const item of items) {
        await client.query(`
          INSERT INTO delivery_items (delivery_id, description, unit, quantity, unit_cost)
          VALUES ($1,$2,$3,$4,$5)
        `, [deliveryId, item.description, item.unit, item.qty, item.cost]);
      }

      return deliveryId;
    }

    const now = new Date();
    const daysAgo = (n) => new Date(now - n * 86400000);

    // 1. Delivered — Warehouse A → Branch 1 (30 days ago)
    await insertDelivery({
      fromId: warehouseA.id, toId: branch1.id,
      status: 'delivered',
      createdAt: daysAgo(30), deliveredDate: daysAgo(28),
      createdBy: warehouse1.id, adminConfirmedBy: admin.id,
      notes: 'Monthly stock replenishment for Makati branch.',
      items: [
        { description: 'Vitamin C 500mg', unit: 'bottle', qty: 50, cost: 52.00 },
        { description: 'Fish Oil 1000mg', unit: 'capsule', qty: 30, cost: 75.00 },
        { description: 'Multivitamin Complete', unit: 'tablet', qty: 40, cost: 48.00 },
      ],
    });

    // 2. Delivered — Warehouse B → Branch 2 (21 days ago)
    await insertDelivery({
      fromId: warehouseB.id, toId: branch2.id,
      status: 'delivered',
      createdAt: daysAgo(21), deliveredDate: daysAgo(19),
      createdBy: warehouse2.id, adminConfirmedBy: admin.id,
      notes: 'Supplement restock — BGC branch.',
      items: [
        { description: 'Collagen Powder', unit: 'sachet', qty: 60, cost: 35.00 },
        { description: 'Protein Shake Vanilla', unit: 'pack', qty: 25, cost: 180.00 },
        { description: 'Zinc Tablets 50mg', unit: 'tablet', qty: 80, cost: 12.00 },
      ],
    });

    // 3. Delivered — Warehouse A → Branch 3 (14 days ago)
    await insertDelivery({
      fromId: warehouseA.id, toId: branch3.id,
      status: 'delivered',
      createdAt: daysAgo(14), deliveredDate: daysAgo(12),
      createdBy: warehouse1.id, adminConfirmedBy: admin.id,
      notes: null,
      items: [
        { description: 'Vitamin D3 1000IU', unit: 'softgel', qty: 45, cost: 28.00 },
        { description: 'Omega 3 Fish Oil', unit: 'capsule', qty: 35, cost: 65.00 },
        { description: 'Probiotics 10B CFU', unit: 'capsule', qty: 20, cost: 95.00 },
      ],
    });

    // 4. Delivered — Warehouse A → Branch 4 (7 days ago)
    await insertDelivery({
      fromId: warehouseA.id, toId: branch4.id,
      status: 'delivered',
      createdAt: daysAgo(7), deliveredDate: daysAgo(6),
      createdBy: warehouse1.id, adminConfirmedBy: admin.id,
      notes: 'Urgent restock — running low on magnesium.',
      items: [
        { description: 'Magnesium Glycinate', unit: 'tablet', qty: 100, cost: 22.00 },
        { description: 'Vitamin C 500mg', unit: 'bottle', qty: 20, cost: 52.00 },
      ],
    });

    // 5. In Transit — Warehouse B → Branch 5 (2 days ago)
    await insertDelivery({
      fromId: warehouseB.id, toId: branch5.id,
      status: 'in_transit',
      createdAt: daysAgo(2),
      createdBy: warehouse2.id, adminConfirmedBy: admin.id,
      notes: 'Mandaluyong restock — handle with care (glass bottles).',
      items: [
        { description: 'Fish Oil 1000mg', unit: 'capsule', qty: 40, cost: 75.00 },
        { description: 'Vitamin D3 1000IU', unit: 'softgel', qty: 30, cost: 28.00 },
        { description: 'Collagen Powder', unit: 'sachet', qty: 50, cost: 35.00 },
      ],
    });

    // 6. Admin Confirmed — Warehouse A → Branch 2 (1 day ago)
    await insertDelivery({
      fromId: warehouseA.id, toId: branch2.id,
      status: 'admin_confirmed',
      createdAt: daysAgo(1),
      createdBy: warehouse1.id, adminConfirmedBy: admin.id,
      notes: null,
      items: [
        { description: 'Protein Shake Vanilla', unit: 'pack', qty: 15, cost: 180.00 },
        { description: 'Zinc Tablets 50mg', unit: 'tablet', qty: 60, cost: 12.00 },
      ],
    });

    // 7. Pending (awaiting admin) — Warehouse B → Branch 1 (today)
    await client.query(`
      INSERT INTO deliveries
        (from_location_id, to_location_id, delivery_date, status, notes, created_by, admin_confirmed, created_at, updated_at)
      VALUES ($1,$2,CURRENT_DATE,'pending','New order submitted by warehouse — awaiting admin review.',$3,false,NOW(),NOW())
      RETURNING id
    `, [warehouseB.id, branch1.id, warehouse2.id]).then(async res => {
      const dId = res.rows[0].id;
      await client.query(`INSERT INTO delivery_items (delivery_id,description,unit,quantity,unit_cost) VALUES ($1,'Multivitamin Complete','tablet',50,48.00)`, [dId]);
      await client.query(`INSERT INTO delivery_items (delivery_id,description,unit,quantity,unit_cost) VALUES ($1,'Omega 3 Fish Oil','capsule',25,65.00)`, [dId]);
    });

    // 8. Pending — Warehouse A → Branch 5 (today, branch request)
    await client.query(`
      INSERT INTO deliveries
        (from_location_id, to_location_id, delivery_date, status, notes, created_by, admin_confirmed, created_at, updated_at)
      VALUES ($1,$2,CURRENT_DATE,'pending','Branch request: low stock alert for vitamins.',$3,false,NOW(),NOW())
      RETURNING id
    `, [warehouseA.id, branch5.id, warehouse1.id]).then(async res => {
      const dId = res.rows[0].id;
      await client.query(`INSERT INTO delivery_items (delivery_id,description,unit,quantity,unit_cost) VALUES ($1,'Vitamin C 500mg','bottle',30,52.00)`, [dId]);
    });

    // 9. Rejected — Warehouse A → Branch 3 (10 days ago)
    await client.query(`
      INSERT INTO deliveries
        (from_location_id, to_location_id, delivery_date, status, notes, created_by, admin_confirmed,
         rejection_reason, rejected_by, rejected_at, created_at, updated_at)
      VALUES ($1,$2,CURRENT_DATE,'rejected',null,$3,false,
              'Items on hold — product recall notice pending clearance.',$4,NOW()-INTERVAL '10 days',
              NOW()-INTERVAL '10 days',NOW()-INTERVAL '10 days')
      RETURNING id
    `, [warehouseA.id, branch3.id, warehouse1.id, admin.id]).then(async res => {
      const dId = res.rows[0].id;
      await client.query(`INSERT INTO delivery_items (delivery_id,description,unit,quantity,unit_cost) VALUES ($1,'Probiotics 10B CFU','capsule',15,95.00)`, [dId]);
    });

    console.log('Sample deliveries inserted successfully!');
    console.log('Summary:');
    console.log('  4 x Delivered (various branches)');
    console.log('  1 x In Transit (Warehouse B → Branch 5)');
    console.log('  1 x Admin Confirmed (Warehouse A → Branch 2)');
    console.log('  2 x Pending (awaiting admin)');
    console.log('  1 x Rejected');
  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDeliveries().catch(console.error);
