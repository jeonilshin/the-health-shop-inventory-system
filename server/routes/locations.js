const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Get all locations
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY type, name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create location (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, type, address, contact_number } = req.body;
    const result = await pool.query(
      'INSERT INTO locations (name, type, address, contact_number) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, type, address, contact_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update location (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, address, contact_number } = req.body;
    const result = await pool.query(
      'UPDATE locations SET name = $1, type = $2, address = $3, contact_number = $4 WHERE id = $5 RETURNING *',
      [name, type, address, contact_number, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete location (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Check if location has any dependencies
    const dependencies = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM users WHERE location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM inventory WHERE location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM transfers WHERE from_location_id = $1 OR to_location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM sales_transactions WHERE location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM deliveries WHERE from_location_id = $1 OR to_location_id = $1', [id])
    ]);
    
    const [userCount, inventoryCount, transferCount, salesCount, deliveryCount] = dependencies.map(result => parseInt(result.rows[0].count));
    
    if (userCount > 0 || inventoryCount > 0 || transferCount > 0 || salesCount > 0 || deliveryCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Cannot delete location with existing data',
        details: {
          users: userCount,
          inventory: inventoryCount,
          transfers: transferCount,
          sales: salesCount,
          deliveries: deliveryCount
        },
        message: `This location has ${userCount} users, ${inventoryCount} inventory items, ${transferCount} transfers, ${salesCount} sales records, and ${deliveryCount} deliveries. Please move or delete this data first.`
      });
    }
    
    // If no dependencies, proceed with deletion
    const result = await client.query('DELETE FROM locations WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    
    await client.query('COMMIT');
    res.json({ 
      message: 'Location deleted successfully',
      deleted_location: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
