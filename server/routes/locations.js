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

// Delete location (admin only) - Force delete with cascade
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { force } = req.query; // Allow ?force=true query parameter
    
    await client.query('BEGIN');
    
    // Check if location exists
    const locationCheck = await client.query('SELECT * FROM locations WHERE id = $1', [id]);
    if (locationCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    
    // Check if location has any dependencies
    const dependencies = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM users WHERE location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM inventory WHERE location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM transfers WHERE from_location_id = $1 OR to_location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM sales_transactions WHERE location_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM deliveries WHERE from_location_id = $1 OR to_location_id = $1', [id])
    ]);
    
    const [userCount, inventoryCount, transferCount, salesCount, deliveryCount] = dependencies.map(result => parseInt(result.rows[0].count));
    const hasData = userCount > 0 || inventoryCount > 0 || transferCount > 0 || salesCount > 0 || deliveryCount > 0;
    
    // Admin can force delete - cascade or set NULL
    if (hasData) {
      console.log(`⚠️ Admin force deleting location ${id} with existing data:`, {
        users: userCount,
        inventory: inventoryCount,
        transfers: transferCount,
        sales: salesCount,
        deliveries: deliveryCount
      });
      
      // Delete or nullify related data
      // 1. Delete inventory items at this location
      if (inventoryCount > 0) {
        await client.query('DELETE FROM inventory WHERE location_id = $1', [id]);
        console.log(`  ✓ Deleted ${inventoryCount} inventory items`);
      }
      
      // 2. Set user locations to NULL (users can be reassigned later)
      if (userCount > 0) {
        await client.query('UPDATE users SET location_id = NULL WHERE location_id = $1', [id]);
        console.log(`  ✓ Unassigned ${userCount} users from location`);
      }
      
      // 3. Keep transfers but set location references to NULL (for history)
      if (transferCount > 0) {
        await client.query(
          'UPDATE transfers SET from_location_id = NULL WHERE from_location_id = $1',
          [id]
        );
        await client.query(
          'UPDATE transfers SET to_location_id = NULL WHERE to_location_id = $1',
          [id]
        );
        console.log(`  ✓ Updated ${transferCount} transfer records`);
      }
      
      // 4. Keep sales but set location to NULL (for history)
      if (salesCount > 0) {
        await client.query('UPDATE sales_transactions SET location_id = NULL WHERE location_id = $1', [id]);
        console.log(`  ✓ Updated ${salesCount} sales records`);
      }
      
      // 5. Keep deliveries but set location references to NULL (for history)
      if (deliveryCount > 0) {
        await client.query(
          'UPDATE deliveries SET from_location_id = NULL WHERE from_location_id = $1',
          [id]
        );
        await client.query(
          'UPDATE deliveries SET to_location_id = NULL WHERE to_location_id = $1',
          [id]
        );
        console.log(`  ✓ Updated ${deliveryCount} delivery records`);
      }
    }
    
    // Now delete the location
    const result = await client.query('DELETE FROM locations WHERE id = $1 RETURNING *', [id]);
    
    await client.query('COMMIT');
    
    console.log(`✅ Location deleted successfully: ${result.rows[0].name}`);
    
    res.json({ 
      message: 'Location deleted successfully',
      deleted_location: result.rows[0],
      cascade_info: hasData ? {
        inventory_deleted: inventoryCount,
        users_unassigned: userCount,
        transfers_updated: transferCount,
        sales_updated: salesCount,
        deliveries_updated: deliveryCount
      } : null
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting location:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
