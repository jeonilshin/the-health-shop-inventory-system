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
    
    // Read all rows as arrays to find the header row
    const allRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    // Find the header row (look for row containing "BRAND" or "Brand")
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const row = allRows[i];
      if (row.some(cell => 
        typeof cell === 'string' && 
        (cell.toUpperCase().includes('BRAND') || cell.toUpperCase().includes('NUMBER'))
      )) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ error: 'Could not find header row. Please ensure the file has columns like Brand, Number, etc.' });
    }

    // Read data starting from header row
    const rawData = xlsx.utils.sheet_to_json(sheet, { 
      range: headerRowIndex,
      defval: ''
    });

    // Transform data according to mapping
    const previewData = rawData.map((row, index) => {
      // Handle different possible column names (case-insensitive)
      const getColumnValue = (possibleNames) => {
        for (const name of possibleNames) {
          const key = Object.keys(row).find(k => k.toUpperCase().trim() === name.toUpperCase());
          if (key && row[key]) return row[key];
        }
        return '';
      };

      const brand = getColumnValue(['BRAND', 'Brand']).toString().trim();
      const number = getColumnValue(['NUMBER', 'Number']).toString().trim();
      const batchNumber = brand && number ? `${brand}-${number}` : '';

      const description = getColumnValue([
        'PRODUCT DESCRIPTION',
        'THE HEALTHSHOP PRODUCTS',
        'DESCRIPTION',
        'Product'
      ]).toString().trim();

      const unit = getColumnValue(['UOM', 'UoM', 'UNIT', 'Unit']).toString().trim();
      
      const unitCost = parseFloat(getColumnValue([
        'AVE UNIT COST',
        'Ave Unit Cost',
        'UNIT COST',
        'Unit Cost',
        'COST',
        'Cost'
      ])) || 0;

      const sellingPrice = parseFloat(getColumnValue([
        'SELLING PRICE',
        'Selling Price',
        'SP',
        'Price'
      ])) || 0;

      const quantity = parseFloat(getColumnValue([
        'QTY',
        'Qty',
        'QUANTITY',
        'Quantity',
        'END'
      ])) || 0;

      return {
        rowNumber: headerRowIndex + index + 2, // Excel row number (accounting for header)
        batch_number: batchNumber,
        description: description,
        unit: unit,
        unit_cost: unitCost,
        suggested_selling_price: sellingPrice,
        quantity: quantity,
        // Keep original values for reference
        original: {
          brand,
          number,
          content: getColumnValue(['CONTENT', 'Content'])
        }
      };
    }).filter(item => {
      // Filter out completely empty rows
      return item.batch_number || item.description || item.unit || item.quantity > 0;
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
    const { data, locationId, branchId } = req.body;

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
    let transferred = 0;
    const errors = [];

    for (const item of data) {
      try {
        // Check if item already exists in warehouse
        const existingItem = await client.query(
          `SELECT id, quantity FROM inventory 
           WHERE location_id = $1 AND batch_number = $2`,
          [locationId, item.batch_number]
        );

        let inventoryId;

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
          inventoryId = existingItem.rows[0].id;
          updated++;
        } else {
          // Insert new item
          const result = await client.query(
            `INSERT INTO inventory 
             (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [locationId, item.batch_number, item.description, item.unit, item.quantity, item.unit_cost, item.suggested_selling_price]
          );
          inventoryId = result.rows[0].id;
          imported++;
        }

        // If branch is selected, create transfer
        if (branchId) {
          // Check if item exists in branch
          const branchItem = await client.query(
            `SELECT id FROM inventory 
             WHERE location_id = $1 AND batch_number = $2`,
            [branchId, item.batch_number]
          );

          // If doesn't exist in branch, create it
          if (branchItem.rows.length === 0) {
            await client.query(
              `INSERT INTO inventory 
               (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price)
               VALUES ($1, $2, $3, $4, 0, $5, $6)`,
              [branchId, item.batch_number, item.description, item.unit, item.unit_cost, item.suggested_selling_price]
            );
          }

          // Create transfer record
          await client.query(
            `INSERT INTO transfers 
             (from_location_id, to_location_id, inventory_id, description, unit, quantity, unit_cost, transferred_by, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'Auto-created from import')`,
            [locationId, branchId, inventoryId, item.description, item.unit, item.quantity, item.unit_cost, req.user.id]
          );
          transferred++;
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
      transferred,
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
