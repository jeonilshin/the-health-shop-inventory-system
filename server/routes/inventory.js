const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Get inventory by location
router.get('/location/:locationId', auth, async (req, res) => {
  try {
    const { locationId } = req.params;
    
    // Check if user has access to this location
    if (req.user.role !== 'admin' && req.user.location_id != locationId) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const result = await pool.query(
      'SELECT * FROM inventory WHERE location_id = $1 ORDER BY description',
      [locationId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add inventory item (admin and warehouse only)
router.post('/', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    const { location_id, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number } = req.body;
    
    // Check if user has access to this location
    if (req.user.role === 'warehouse' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'Warehouse staff can only add inventory to their own location' });
    }

    const result = await pool.query(
      `INSERT INTO inventory (location_id, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       ON CONFLICT (location_id, description, unit) 
       DO UPDATE SET 
         quantity = inventory.quantity + $4, 
         unit_cost = $5, 
         suggested_selling_price = $6,
         expiry_date = COALESCE($7, inventory.expiry_date),
         batch_number = COALESCE($8, inventory.batch_number),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [location_id, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update inventory item (admin only - for manual adjustments)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number } = req.body;
    
    const result = await pool.query(
      `UPDATE inventory 
       SET description = $1, unit = $2, quantity = $3, unit_cost = $4, suggested_selling_price = $5, 
           expiry_date = $6, batch_number = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, batch_number, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete inventory item
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM inventory WHERE id = $1', [id]);
    res.json({ message: 'Inventory item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


// Get expiring items (items expiring within specified days)
router.get('/expiring/:days', auth, async (req, res) => {
  try {
    const { days } = req.params;
    const daysInt = parseInt(days) || 30;
    
    let query = `
      SELECT i.*, l.name as location_name, l.type as location_type
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE i.expiry_date IS NOT NULL 
        AND i.expiry_date <= CURRENT_DATE + INTERVAL '${daysInt} days'
        AND i.quantity > 0
    `;
    
    // Filter by location for non-admin users
    const params = [];
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ' AND i.location_id = $1';
      params.push(req.user.location_id);
    }
    
    query += ' ORDER BY i.expiry_date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get expired items
router.get('/expired', auth, async (req, res) => {
  try {
    let query = `
      SELECT i.*, l.name as location_name, l.type as location_type
      FROM inventory i
      JOIN locations l ON i.location_id = l.id
      WHERE i.expiry_date IS NOT NULL 
        AND i.expiry_date < CURRENT_DATE
        AND i.quantity > 0
    `;
    
    // Filter by location for non-admin users
    const params = [];
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ' AND i.location_id = $1';
      params.push(req.user.location_id);
    }
    
    query += ' ORDER BY i.expiry_date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
