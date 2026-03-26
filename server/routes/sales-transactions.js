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
      quantity_sold, unit_price, payment_method, customer_name, notes,
      discount_type, custom_discount_percent, discount_reason
    } = req.body;
    
    // Validate location access
    if (req.user.role !== 'admin' && req.user.location_id != location_id) {
      return res.status(403).json({ error: 'You can only record sales for your assigned location' });
    }
    
    await client.query('BEGIN');
    
    // Calculate discount using proper Philippine formula
    let discount_percent = 0;
    let final_discount_reason = '';
    let discount_amount = 0;
    let total_amount = 0;
    
    const grossAmount = parseFloat(quantity_sold) * parseFloat(unit_price);
    
    if (discount_type === 'pwd') {
      discount_percent = 20;
      final_discount_reason = discount_reason || 'PWD Discount';
      
      // Philippine PWD Formula:
      // 1. Remove VAT: Price / 1.12
      const netOfVat = grossAmount / 1.12;
      // 2. Calculate 20% discount on net of VAT
      discount_amount = netOfVat * 0.20;
      // 3. Subtract discount from original price and round off
      total_amount = Math.round(grossAmount - discount_amount);
      
    } else if (discount_type === 'senior') {
      discount_percent = 20;
      final_discount_reason = discount_reason || 'Senior Citizen Discount';
      
      // Philippine Senior Citizen Formula:
      // 1. Remove VAT: Price / 1.12
      const netOfVat = grossAmount / 1.12;
      // 2. Calculate 20% discount on net of VAT
      discount_amount = netOfVat * 0.20;
      // 3. Subtract discount from original price and round off
      total_amount = Math.round(grossAmount - discount_amount);
      
    } else if (discount_type === 'custom' && custom_discount_percent) {
      discount_percent = parseFloat(custom_discount_percent);
      final_discount_reason = discount_reason || 'Custom Discount';
      
      // Custom discount: simple percentage off and round off
      discount_amount = grossAmount * (discount_percent / 100);
      total_amount = Math.round(grossAmount - discount_amount);
      
    } else {
      // No discount
      total_amount = grossAmount;
    }
    
    // Insert sales transaction
    const saleResult = await client.query(
      `INSERT INTO sales_transactions (
        transaction_date, location_id, item_description, item_unit,
        quantity_sold, unit_price, discount_percent, discount_amount,
        discount_reason, total_amount, payment_method,
        sold_by, sold_by_name, customer_name, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        transaction_date || new Date().toISOString().split('T')[0],
        location_id, item_description, item_unit, quantity_sold, unit_price,
        discount_percent, discount_amount, final_discount_reason || null,
        total_amount, payment_method, req.user.id,
        req.user.full_name || req.user.username, customer_name, notes
      ]
    );
    
    // Deduct from inventory using FIFO (First In First Out)
    // Get all batches for this item ordered by creation date (oldest first)
    const batchesResult = await client.query(
      `SELECT * FROM inventory 
       WHERE location_id = $1 AND description = $2 AND unit = $3 AND quantity > 0
       ORDER BY created_at ASC`,
      [location_id, item_description, item_unit]
    );
    
    if (batchesResult.rows.length === 0) {
      throw new Error('Item not found in inventory or out of stock');
    }
    
    // Calculate total available quantity across all batches
    const totalAvailable = batchesResult.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
    
    if (totalAvailable < parseFloat(quantity_sold)) {
      throw new Error(`Insufficient inventory. Available: ${totalAvailable}, Requested: ${quantity_sold}`);
    }
    
    // Deduct from batches using FIFO (oldest batches first)
    let remainingToDeduct = parseFloat(quantity_sold);
    const updatedBatches = [];
    
    console.log(`📦 FIFO Sale: Deducting ${quantity_sold} ${item_unit} of ${item_description}`);
    
    for (const batch of batchesResult.rows) {
      if (remainingToDeduct <= 0) break;
      
      const batchQty = parseFloat(batch.quantity);
      const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
      
      console.log(`  - Batch ${batch.batch_number}: Deducting ${deductFromThisBatch} (had ${batchQty}, will have ${batchQty - deductFromThisBatch})`);
      
      const updateResult = await client.query(
        `UPDATE inventory 
         SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [deductFromThisBatch, batch.id]
      );
      
      updatedBatches.push({
        batch_number: batch.batch_number,
        deducted: deductFromThisBatch,
        remaining: updateResult.rows[0].quantity
      });
      
      remainingToDeduct -= deductFromThisBatch;
    }
    
    console.log(`✅ FIFO Sale Complete: Deducted from ${updatedBatches.length} batch(es)`);
    
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
      description: `Sold ${quantity_sold} ${item_unit} of ${item_description}${discount_percent > 0 ? ` with ${discount_percent}% discount` : ''} (FIFO: ${updatedBatches.length} batches)`
    });
    
    res.status(201).json({
      sale: saleResult.rows[0],
      batches_used: updatedBatches
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

// Update a sale transaction (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const {
      transaction_date, quantity_sold, unit_price,
      payment_method, customer_name, notes
    } = req.body;
    
    await client.query('BEGIN');
    
    // Get old sale details
    const oldSaleResult = await client.query('SELECT * FROM sales_transactions WHERE id = $1', [id]);
    
    if (oldSaleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const oldSale = oldSaleResult.rows[0];
    
    // Calculate quantity difference
    const oldQty = parseFloat(oldSale.quantity_sold);
    const newQty = parseFloat(quantity_sold);
    const qtyDifference = newQty - oldQty;
    
    // Update inventory if quantity changed
    if (qtyDifference !== 0) {
      const inventoryResult = await client.query(
        `UPDATE inventory 
         SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE location_id = $2 AND description = $3 AND unit = $4
         RETURNING *`,
        [qtyDifference, oldSale.location_id, oldSale.item_description, oldSale.item_unit]
      );
      
      if (inventoryResult.rows.length === 0) {
        throw new Error('Item not found in inventory');
      }
      
      if (parseFloat(inventoryResult.rows[0].quantity) < 0) {
        throw new Error('Insufficient inventory. Cannot increase sale quantity beyond available stock.');
      }
    }
    
    // Calculate new total
    const total_amount = parseFloat(quantity_sold) * parseFloat(unit_price);
    
    // Update sale transaction
    const updatedSaleResult = await client.query(
      `UPDATE sales_transactions 
       SET transaction_date = $1, quantity_sold = $2, unit_price = $3,
           total_amount = $4, payment_method = $5, customer_name = $6,
           notes = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [transaction_date, quantity_sold, unit_price, total_amount, payment_method, customer_name, notes, id]
    );
    
    await client.query('COMMIT');
    
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'SALE_UPDATED',
      tableName: 'sales_transactions',
      recordId: id,
      oldValues: oldSale,
      newValues: updatedSaleResult.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated sale: ${oldSale.item_description} (qty: ${oldQty} → ${newQty})`
    });
    
    res.json(updatedSaleResult.rows[0]);
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
