const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { auth, authorize } = require('../middleware/auth');
const pool = require('../config/database');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Preview Excel data before import
router.post('/preview', auth, authorize('admin', 'warehouse'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    // Transform data according to mapping
    const previewData = rawData.map((row, index) => {
      const brand = (row.Brand || '').toString().trim();
      const number = (row.Number || '').toString().trim();
      const batchNumber = brand && number ? `${brand}-${number}` : '';

      return {
        rowNumber: index + 2, // Excel row number (accounting for header)
        batch_number: batchNumber,
        description: (row['THE HEALTHSHOP PRODUCTS'] || '').toString().trim(),
        unit: (row.UoM || '').toString().trim(),
        unit_cost: parseFloat(row.Cost) || 0,
        suggested_selling_price: parseFloat(row.SP) || 0,
        quantity: parseFloat(row.END) || 0,
        // Keep original values for reference
        original: {
          brand,
          number,
          content: row.Content
        }
      };
    });

    // Validate data
    const errors = [];
    previewData.forEach(item => {
      if (!item.batch_number) {
        errors.push(`Row ${item.rowNumber}: Missing Brand or Number`);
      }
      if (!item.description) {
        errors.push(`Row ${item.rowNumber}: Missing product description`);
      }
      if (!item.unit) {
        errors.push(`Row ${item.rowNumber}: Missing UoM`);
      }
      if (item.unit_cost <= 0) {
        errors.push(`Row ${item.rowNumber}: Invalid Cost`);
      }
    });

    res.json({
      success: true,
      preview: previewData,
      totalRows: previewData.length,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to preview file: ' + error.message });
  }
});

// Import Excel data to inventory
router.post('/import', auth, authorize('admin', 'warehouse'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { data, locationId } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    await client.query('BEGIN');

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const item of data) {
      try {
        // Check if item already exists
        const existingItem = await client.query(
          `SELECT id, quantity FROM inventory 
           WHERE location_id = $1 AND batch_number = $2`,
          [locationId, item.batch_number]
        );

        if (existingItem.rows.length > 0) {
          // Update existing item
          await client.query(
            `UPDATE inventory 
             SET quantity = quantity + $1,
                 unit_cost = $2,
                 suggested_selling_price = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [item.quantity, item.unit_cost, item.suggested_selling_price, existingItem.rows[0].id]
          );
          updated++;
        } else {
          // Insert new item
          await client.query(
            `INSERT INTO inventory 
             (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [locationId, item.batch_number, item.description, item.unit, item.quantity, item.unit_cost, item.suggested_selling_price]
          );
          imported++;
        }
      } catch (itemError) {
        console.error(`Error processing item ${item.batch_number}:`, itemError);
        errors.push(`${item.batch_number}: ${itemError.message}`);
        skipped++;
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      imported,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import data: ' + error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
