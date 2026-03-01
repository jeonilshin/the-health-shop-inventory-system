const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all sales transactions
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    
    let query = `
      SELECT st.*, l.name as location_name, l.type as location_type
      FROM sales_transactions st
      JOIN locations l ON st.location_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by location for non-admin users
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (locationId) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(locationId);
      paramCount++;
    }
    
    // Filter by date range
    if (startDate) {
      query += ` AND st.transaction_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND st.transaction_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ' ORDER BY st.transaction_date DESC, st.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record a new sale
router.post('/', auth, authorize('admin', 'warehouse', 'branch_manager', 'branch_staff'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      transaction_date, location_id, item_description, item_unit,
      quantity_sold, unit_price, payment_method, customer_name, notes
    } = req.body;
    
    // Validate location access
    if (req.user.role !== 'admin' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'You can only record sales for your assigned location' });
    }
    
    await client.query('BEGIN');
    
    const total_amount = parseFloat(quantity_sold) * parseFloat(unit_price);
    
    // Insert sales transaction
    const saleResult = await client.query(
      `INSERT INTO sales_transactions (
        transaction_date, location_id, item_description, item_unit,
        quantity_sold, unit_price, total_amount, payment_method,
        sold_by, sold_by_name, customer_name, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        transaction_date || new Date().toISOString().split('T')[0],
        location_id, item_description, item_unit, quantity_sold, unit_price,
        total_amount, payment_method, req.user.id,
        req.user.full_name || req.user.username, customer_name, notes
      ]
    );
    
    // Deduct from inventory
    const inventoryResult = await client.query(
      `UPDATE inventory 
       SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
       WHERE location_id = $2 AND description = $3 AND unit = $4
       RETURNING *`,
      [quantity_sold, location_id, item_description, item_unit]
    );
    
    if (inventoryResult.rows.length === 0) {
      throw new Error('Item not found in inventory or insufficient stock');
    }
    
    if (parseFloat(inventoryResult.rows[0].quantity) < 0) {
      throw new Error('Insufficient inventory. Cannot sell more than available stock.');
    }
    
    await client.query('COMMIT');
    
    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_RECORDED',
      tableName: 'sales_transactions',
      recordId: saleResult.rows[0].id,
      newValues: saleResult.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Sold ${quantity_sold} ${item_unit} of ${item_description}`
    });
    
    res.status(201).json({
      sale: saleResult.rows[0],
      inventory: inventoryResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Delete a sale transaction (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Get sale details
    const saleResult = await client.query('SELECT * FROM sales_transactions WHERE id = $1', [id]);
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const sale = saleResult.rows[0];
    
    // Restore inventory
    await client.query(
      `UPDATE inventory 
       SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
       WHERE location_id = $2 AND description = $3 AND unit = $4`,
      [sale.quantity_sold, sale.location_id, sale.item_description, sale.item_unit]
    );
    
    // Delete sale
    await client.query('DELETE FROM sales_transactions WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_DELETED',
      tableName: 'sales_transactions',
      recordId: id,
      oldValues: sale,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted sale and restored ${sale.quantity_sold} ${sale.item_unit} of ${sale.item_description} to inventory`
    });
    
    res.json({ message: 'Sale deleted and inventory restored' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get sales summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    
    let query = `
      SELECT 
        location_id,
        l.name as location_name,
        COUNT(*) as total_transactions,
        SUM(quantity_sold) as total_items_sold,
        SUM(total_amount) as total_revenue
      FROM sales_transactions st
      JOIN locations l ON st.location_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (req.user.role !== 'admin' && req.user.location_id) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(req.user.location_id);
      paramCount++;
    } else if (locationId) {
      query += ` AND st.location_id = $${paramCount}`;
      params.push(locationId);
      paramCount++;
    }
    
    if (startDate) {
      query += ` AND st.transaction_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND st.transaction_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ' GROUP BY location_id, l.name ORDER BY l.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
