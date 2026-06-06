const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { auth, authorize } = require('../middleware/auth');
const pool = require('../config/db');

const upload = multer({ storage: multer.memoryStorage() });

// Parse Excel buffer into preview rows
function parseExcel(buffer, sheetName) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const targetSheet = sheetName || workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(targetSheet)) {
    throw new Error(`Sheet "${targetSheet}" not found`);
  }
  const sheet = workbook.Sheets[targetSheet];
  const allRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i];
    if (row.some(cell => typeof cell === 'string' &&
        (cell.toUpperCase().includes('BRAND') || cell.toUpperCase().includes('NUMBER')))) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    throw new Error('Could not find header row. File must have columns like Brand, Number, etc.');
  }

  const rawData = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '', raw: false });

  const getCol = (row, names) => {
    for (const name of names) {
      const key = Object.keys(row).find(k => k.toUpperCase().trim() === name.toUpperCase());
      if (key && row[key] !== undefined && row[key] !== '') return String(row[key]);
    }
    return '';
  };

  let currentCategory = null;
  return rawData.map((row, index) => {
    const brand       = getCol(row, ['BRAND', 'Brand']).trim();
    const number      = getCol(row, ['NUMBER', 'Number', 'No', 'NO']).trim();
    const description = getCol(row, ['THE HEALTHSHOP PRODUCTS', 'PRODUCT DESCRIPTION', 'ITEM DESCRIPTION', 'DESCRIPTION', 'Product']).trim();
    const unit        = getCol(row, ['UOM', 'UoM', 'UNIT', 'Unit']).trim();
    const unitCost    = parseFloat(getCol(row, ['AVE UNIT COST', 'Ave Unit Cost', 'UNIT COST', 'Unit Cost', 'COST', 'Cost']).replace(/,/g, '')) || 0;
    const quantity    = parseFloat(getCol(row, ['QTY', 'Qty', 'QUANTITY', 'Quantity', 'END']).replace(/,/g, '')) || 0;

    const expiryStr = getCol(row, ['EXPIRY DATE', 'Expiry Date', 'EXPIRATION DATE', 'Expiration']).trim();
    let expiryDate = null;
    if (expiryStr) {
      try {
        if (!isNaN(expiryStr) && expiryStr.length <= 5) {
          const d = new Date(new Date(1899, 11, 30).getTime() + parseInt(expiryStr) * 86400000);
          expiryDate = d.toISOString().split('T')[0];
        } else {
          const d = new Date(expiryStr);
          if (!isNaN(d.getTime())) expiryDate = d.toISOString().split('T')[0];
        }
      } catch (_) {}
    }

    const isCategory = description && !brand && !unit && unitCost === 0;
    const isGrandTotal = description.toUpperCase().includes('GRAND TOTAL');
    const batchNumber = brand && number ? `${brand}-${number.padStart(3, '0')}` : (brand ? `${brand}-${String(index + 1).padStart(3, '0')}` : null);

    if (isCategory && !isGrandTotal) currentCategory = description;

    return {
      rowNumber: headerRowIndex + index + 2,
      brand, number, batch_number: batchNumber, description, unit,
      unit_cost: unitCost, quantity, expiry_date: expiryDate,
      main_category: isCategory ? null : currentCategory,
      is_category: isCategory && !isGrandTotal,
      is_grand_total: isGrandTotal,
    };
  }).filter(item => !item.is_grand_total && (item.description || item.brand || item.unit || item.quantity > 0));
}

// Preview Excel file
router.post('/preview', auth, authorize('admin', 'warehouse'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { sheetName, locationId } = req.body;
    const previewData = parseExcel(req.file.buffer, sheetName);

    const errors = [];
    previewData.forEach(item => {
      if (!item.is_category) {
        if (!item.description) errors.push(`Row ${item.rowNumber}: Missing description`);
        if (!item.unit) errors.push(`Row ${item.rowNumber}: Missing unit`);
      }
    });

    // Check duplicates against new schema (products + inventory join)
    const itemsToCheck = previewData.filter(item => !item.is_category && item.description && item.unit);
    const duplicateDetails = [];

    if (itemsToCheck.length > 0 && locationId) {
      for (const item of itemsToCheck) {
        const dup = await pool.query(
          `SELECT i.id, p.name as description, p.unit, i.quantity, i.unit_cost
           FROM inventory i JOIN products p ON i.product_id = p.id
           WHERE i.location_id = $1 AND LOWER(p.name) = LOWER($2) AND LOWER(p.unit) = LOWER($3)
           LIMIT 1`,
          [locationId, item.description, item.unit]
        );
        if (dup.rows.length > 0) {
          const existing = dup.rows[0];
          duplicateDetails.push({
            description: item.description,
            unit: item.unit,
            existing: { quantity: existing.quantity, unit_cost: existing.unit_cost },
            new: { quantity: item.quantity, unit_cost: item.unit_cost },
            priceChanged: Math.abs(parseFloat(existing.unit_cost || 0) - item.unit_cost) > 0.01,
          });
        }
      }
    }

    res.json({
      success: true,
      preview: previewData,
      totalRows: previewData.length,
      duplicates: duplicateDetails.length,
      duplicateDetails,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});

// Import Excel data into inventory
router.post('/import', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    const { data, locationId, duplicateAction, selectedDuplicates } = req.body;

    if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Invalid data' });
    if (!locationId) return res.status(400).json({ error: 'locationId required' });

    const action = duplicateAction || 'update';
    const skipSet = new Set((selectedDuplicates || [])
      .filter(d => d.skip)
      .map(d => `${d.description}|||${d.unit}`));

    let imported = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const item of data) {
      if (!item || item.is_category) continue;
      if (!item.description || !item.unit) { skipped++; continue; }

      const qty = parseFloat(item.quantity) || 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Find or create product
        let productId;
        const existingProd = await client.query(
          'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND LOWER(unit) = LOWER($2) LIMIT 1',
          [item.description.trim(), item.unit.trim()]
        );
        if (existingProd.rows.length > 0) {
          productId = existingProd.rows[0].id;
        } else {
          const newProd = await client.query(
            'INSERT INTO products (name, unit, category) VALUES ($1, $2, $3) RETURNING id',
            [item.description.trim(), item.unit.trim(), item.main_category || null]
          );
          productId = newProd.rows[0].id;
        }

        // Check for existing inventory at this location with same cost
        const existingInv = await client.query(
          `SELECT id, quantity FROM inventory
           WHERE product_id = $1 AND location_id = $2 AND unit_cost IS NOT DISTINCT FROM $3
           LIMIT 1`,
          [productId, locationId, item.unit_cost || null]
        );

        const itemKey = `${item.description}|||${item.unit}`;
        const isDup = existingInv.rows.length > 0;

        if (isDup) {
          if (action === 'skip' || skipSet.has(itemKey)) {
            skipped++;
            await client.query('ROLLBACK');
            client.release();
            continue;
          }
          // Update: add quantity
          await client.query(
            'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
            [qty, existingInv.rows[0].id]
          );
          updated++;
        } else {
          // Check for any existing inventory with different cost (create separate batch)
          await client.query(
            `INSERT INTO inventory (product_id, location_id, quantity, unit_cost, batch_number, expiry_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [productId, locationId, qty, item.unit_cost || null, item.batch_number || null, item.expiry_date || null]
          );
          imported++;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        errors.push(`${item.description}: ${err.message}`);
        skipped++;
      } finally {
        client.release();
      }
    }

    res.json({
      success: true,
      message: `Import done: ${imported} new, ${updated} updated, ${skipped} skipped${errors.length > 0 ? `, ${errors.length} errors` : ''}`,
      imported, updated, skipped,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = router;
