const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

// Get all unit conversions
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM unit_conversions 
      ORDER BY product_description, base_unit, converted_unit
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversions for a specific product
router.get('/product/:description', auth, async (req, res) => {
  try {
    const { description } = req.params;
    const result = await pool.query(
      'SELECT * FROM unit_conversions WHERE product_description = $1 ORDER BY base_unit, converted_unit',
      [description]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create unit conversion (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { product_description, base_unit, converted_unit, conversion_factor } = req.body;

    if (!product_description || !base_unit || !converted_unit || !conversion_factor) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (conversion_factor <= 0) {
      return res.status(400).json({ error: 'Conversion factor must be greater than 0' });
    }

    const result = await pool.query(
      `INSERT INTO unit_conversions (product_description, base_unit, converted_unit, conversion_factor)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_description, base_unit, converted_unit)
       DO UPDATE SET conversion_factor = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [product_description, base_unit, converted_unit, conversion_factor]
    );

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNIT_CONVERSION_CREATE',
      tableName: 'unit_conversions',
      recordId: result.rows[0].id,
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Created conversion: 1 ${base_unit} = ${conversion_factor} ${converted_unit} for ${product_description}`
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update unit conversion (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { conversion_factor } = req.body;

    if (!conversion_factor || conversion_factor <= 0) {
      return res.status(400).json({ error: 'Valid conversion factor is required' });
    }

    const oldData = await pool.query('SELECT * FROM unit_conversions WHERE id = $1', [id]);

    const result = await pool.query(
      'UPDATE unit_conversions SET conversion_factor = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [conversion_factor, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit conversion not found' });
    }

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNIT_CONVERSION_UPDATE',
      tableName: 'unit_conversions',
      recordId: id,
      oldValues: oldData.rows[0],
      newValues: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Updated conversion factor from ${oldData.rows[0]?.conversion_factor} to ${conversion_factor}`
    });

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete unit conversion (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const oldData = await pool.query('SELECT * FROM unit_conversions WHERE id = $1', [id]);
    
    if (oldData.rows.length === 0) {
      return res.status(404).json({ error: 'Unit conversion not found' });
    }

    await pool.query('DELETE FROM unit_conversions WHERE id = $1', [id]);

    // Log audit
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNIT_CONVERSION_DELETE',
      tableName: 'unit_conversions',
      recordId: id,
      oldValues: oldData.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Deleted conversion: ${oldData.rows[0].product_description} (${oldData.rows[0].base_unit} to ${oldData.rows[0].converted_unit})`
    });

    res.json({ message: 'Unit conversion deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert units (helper endpoint)
router.post('/convert', auth, async (req, res) => {
  try {
    const { product_description, from_unit, to_unit, quantity } = req.body;

    if (!product_description || !from_unit || !to_unit || !quantity) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // If same unit, no conversion needed
    if (from_unit === to_unit) {
      return res.json({ converted_quantity: quantity, conversion_factor: 1 });
    }

    // Try direct conversion
    let conversion = await pool.query(
      'SELECT conversion_factor FROM unit_conversions WHERE product_description = $1 AND base_unit = $2 AND converted_unit = $3',
      [product_description, from_unit, to_unit]
    );

    if (conversion.rows.length > 0) {
      const converted_quantity = quantity * conversion.rows[0].conversion_factor;
      return res.json({ 
        converted_quantity, 
        conversion_factor: conversion.rows[0].conversion_factor,
        direction: 'forward'
      });
    }

    // Try reverse conversion
    conversion = await pool.query(
      'SELECT conversion_factor FROM unit_conversions WHERE product_description = $1 AND base_unit = $2 AND converted_unit = $3',
      [product_description, to_unit, from_unit]
    );

    if (conversion.rows.length > 0) {
      const converted_quantity = quantity / conversion.rows[0].conversion_factor;
      return res.json({ 
        converted_quantity, 
        conversion_factor: 1 / conversion.rows[0].conversion_factor,
        direction: 'reverse'
      });
    }

    res.status(404).json({ error: 'No conversion found for these units' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
