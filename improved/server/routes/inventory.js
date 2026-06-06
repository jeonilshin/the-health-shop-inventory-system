const router = require('express').Router();
const pool = require('../config/db');
const { auth, authorize, getManagerLocationIds } = require('../middleware/auth');

const logActivity = async (client, data) => {
  try {
    await client.query(
      `INSERT INTO activity_log (action_type, performed_by, performer_name, performer_role,
        location_id, location_name, product_id, product_name, reference_type, reference_id,
        quantity_before, quantity_after, quantity_change, unit_cost, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [data.action_type, data.performed_by, data.performer_name, data.performer_role,
       data.location_id||null, data.location_name||null, data.product_id||null, data.product_name||null,
       data.reference_type||null, data.reference_id||null,
       data.quantity_before||null, data.quantity_after||null, data.quantity_change||null,
       data.unit_cost||null, JSON.stringify(data.details||{})]
    );
  } catch(e){ console.error('Activity log error:', e.message); }
};

router.get('/summary', auth, async (req, res) => {
  try {
    let locationFilter = '';
    let params = [];

    if (req.user.role === 'staff') {
      locationFilter = 'AND i.location_id = $1';
      params = [req.user.location_id];
    } else if (req.user.role === 'warehouse') {
      locationFilter = 'AND i.location_id = $1';
      params = [req.user.location_id];
    } else if (req.user.role === 'manager') {
      const locIds = await getManagerLocationIds(req.user.id);
      if (locIds.length === 0) return res.json([]);
      locationFilter = `AND i.location_id = ANY($1)`;
      params = [locIds];
    }

    if (req.query.location_id && ['admin','audit'].includes(req.user.role)) {
      locationFilter = `AND i.location_id = $1`;
      params = [req.query.location_id];
    }

    const result = await pool.query(
      `SELECT p.name as product_name, p.unit, l.name as location_name, l.type as location_type,
              SUM(i.quantity) as total_quantity, COUNT(i.id) as batches_count,
              MIN(i.expiry_date) as oldest_expiry
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN locations l ON i.location_id = l.id
       WHERE i.quantity > 0 ${locationFilter}
       GROUP BY p.id, p.name, p.unit, l.id, l.name, l.type
       ORDER BY l.name, p.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/location-stats', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         i.location_id,
         COUNT(DISTINCT i.product_id)  AS products,
         SUM(i.quantity)               AS total_qty,
         COUNT(*) FILTER (WHERE i.quantity < 10 AND i.quantity > 0) AS low_stock,
         COUNT(*) FILTER (
           WHERE i.expiry_date IS NOT NULL
             AND i.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         ) AS expiring
       FROM inventory i
       WHERE i.quantity > 0
       GROUP BY i.location_id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { product_id, low_stock, expiring_days } = req.query;
    let locationIds = null;

    if (req.user.role === 'staff') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'warehouse') {
      locationIds = [req.user.location_id];
    } else if (req.user.role === 'manager') {
      locationIds = await getManagerLocationIds(req.user.id);
    } else if (req.query.location_id) {
      locationIds = [parseInt(req.query.location_id)];
    }

    let conditions = ['i.quantity > 0'];
    let params = [];
    let paramIdx = 1;

    if (locationIds) {
      conditions.push(`i.location_id = ANY($${paramIdx})`);
      params.push(locationIds);
      paramIdx++;
    }
    if (product_id) {
      conditions.push(`i.product_id = $${paramIdx}`);
      params.push(product_id);
      paramIdx++;
    }
    if (low_stock === 'true') {
      conditions.push(`i.quantity < 10`);
    }
    if (expiring_days) {
      conditions.push(`i.expiry_date IS NOT NULL AND i.expiry_date <= CURRENT_DATE + ($${paramIdx} || ' days')::INTERVAL`);
      params.push(expiring_days);
      paramIdx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT i.id, i.product_id, p.name as product_name, p.unit, i.location_id,
              l.name as location_name, l.type as location_type,
              i.quantity, i.unit_cost, i.suggested_selling_price, i.batch_number, i.expiry_date, i.received_date, i.created_at,
              CASE
                WHEN i.expiry_date IS NULL THEN 'no_expiry'
                WHEN i.expiry_date < CURRENT_DATE THEN 'expired'
                WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                ELSE 'good'
              END as expiry_status
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN locations l ON i.location_id = l.id
       ${where}
       ORDER BY l.name, p.name, i.expiry_date ASC NULLS LAST`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, location_id, quantity, unit_cost, suggested_selling_price, batch_number, expiry_date } = req.body;
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and quantity > 0 required' });

    const loc_id = req.user.role === 'warehouse' ? req.user.location_id : (location_id || req.user.location_id);

    await client.query('BEGIN');

    const prod = await client.query('SELECT name FROM products WHERE id = $1', [product_id]);
    const loc = await client.query('SELECT name FROM locations WHERE id = $1', [loc_id]);
    if (prod.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product not found' }); }
    if (loc.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Location not found' }); }

    const result = await client.query(
      `INSERT INTO inventory (product_id, location_id, quantity, unit_cost, suggested_selling_price, batch_number, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [product_id, loc_id, quantity, unit_cost || null, suggested_selling_price || null, batch_number || null, expiry_date || null]
    );

    await logActivity(client, {
      action_type: 'inventory_added',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      location_id: loc_id, location_name: loc.rows[0].name,
      product_id, product_name: prod.rows[0].name,
      reference_type: 'inventory', reference_id: result.rows[0].id,
      quantity_before: 0, quantity_after: quantity, quantity_change: quantity,
      unit_cost: unit_cost || null,
      details: { batch_number, expiry_date }
    });

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.put('/:id', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { quantity, unit_cost, suggested_selling_price, batch_number, expiry_date } = req.body;

    await client.query('BEGIN');
    const old = await client.query(
      `SELECT i.*, p.name as product_name, l.name as location_name
       FROM inventory i JOIN products p ON i.product_id = p.id JOIN locations l ON i.location_id = l.id
       WHERE i.id = $1`, [req.params.id]
    );
    if (old.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    const item = old.rows[0];
    const newQty = quantity !== undefined ? quantity : item.quantity;
    if (newQty < 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Quantity cannot be negative' }); }

    const result = await client.query(
      `UPDATE inventory SET quantity = $1, unit_cost = COALESCE($2, unit_cost),
       batch_number = COALESCE($3, batch_number), expiry_date = COALESCE($4, expiry_date),
       suggested_selling_price = COALESCE($5, suggested_selling_price), updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [newQty, unit_cost, batch_number, expiry_date, suggested_selling_price, req.params.id]
    );

    await logActivity(client, {
      action_type: 'inventory_adjusted',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      location_id: item.location_id, location_name: item.location_name,
      product_id: item.product_id, product_name: item.product_name,
      reference_type: 'inventory', reference_id: item.id,
      quantity_before: item.quantity, quantity_after: newQty, quantity_change: newQty - item.quantity,
      unit_cost: unit_cost || item.unit_cost,
    });

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const item = await client.query(
      `SELECT i.*, p.name as product_name, l.name as location_name
       FROM inventory i JOIN products p ON i.product_id = p.id JOIN locations l ON i.location_id = l.id
       WHERE i.id = $1`, [req.params.id]
    );
    if (item.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    await client.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);

    await logActivity(client, {
      action_type: 'inventory_removed',
      performed_by: req.user.id, performer_name: req.user.full_name, performer_role: req.user.role,
      location_id: item.rows[0].location_id, location_name: item.rows[0].location_name,
      product_id: item.rows[0].product_id, product_name: item.rows[0].product_name,
      reference_type: 'inventory', reference_id: item.rows[0].id,
      quantity_before: item.rows[0].quantity, quantity_after: 0, quantity_change: -item.rows[0].quantity,
    });

    await client.query('COMMIT');
    res.json({ message: 'Inventory item deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.post('/convert-units', auth, authorize('admin', 'manager', 'staff', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { from_inventory_id, to_inventory_id, units_per_pack, packs_to_convert } = req.body;
    if (!from_inventory_id || !to_inventory_id || !units_per_pack || !packs_to_convert)
      return res.status(400).json({ error: 'All fields required' });

    const packsQty = parseFloat(packs_to_convert);
    const unitsQty = parseFloat(units_per_pack);
    if (packsQty <= 0 || unitsQty <= 0)
      return res.status(400).json({ error: 'Quantities must be positive' });

    await client.query('BEGIN');

    const fromRes = await client.query(
      `SELECT i.*, p.name as product_name, l.name as location_name FROM inventory i
       JOIN products p ON i.product_id = p.id JOIN locations l ON i.location_id = l.id WHERE i.id = $1`,
      [from_inventory_id]
    );
    const toRes = await client.query(
      `SELECT i.*, p.name as product_name FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.id = $1`,
      [to_inventory_id]
    );
    if (fromRes.rows.length === 0 || toRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory batch not found' });
    }

    const from = fromRes.rows[0];
    const to = toRes.rows[0];

    if (from.location_id !== to.location_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Both batches must be in the same location' });
    }
    if (parseFloat(from.quantity) < packsQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient quantity. Available: ${from.quantity}` });
    }

    const piecesToAdd = packsQty * unitsQty;

    await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [packsQty, from_inventory_id]);
    await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [piecesToAdd, to_inventory_id]);
    await client.query('DELETE FROM inventory WHERE id = $1 AND quantity <= 0', [from_inventory_id]);

    // Log to activity_log as unit_conversion
    await client.query(
      `INSERT INTO activity_log (action_type, performed_by, performer_name, performer_role,
        location_id, location_name, product_id, product_name, reference_type,
        quantity_change, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unit_conversion',$9,$10)`,
      ['unit_conversion', req.user.id, req.user.full_name, req.user.role,
       from.location_id, from.location_name, from.product_id, from.product_name,
       piecesToAdd,
       JSON.stringify({
         from_unit: from.unit, to_unit: to.unit,
         packs_converted: packsQty, units_per_pack: unitsQty, pieces_added: piecesToAdd,
         from_batch: from.batch_number, to_batch: to.batch_number
       })]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `Converted ${packsQty} ${from.unit} → ${piecesToAdd} ${to.unit}` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
