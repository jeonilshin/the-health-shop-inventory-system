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

    const { sheetName } = req.body;

    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    
    // Use specified sheet or first sheet
    const targetSheet = sheetName || workbook.SheetNames[0];
    
    if (!workbook.SheetNames.includes(targetSheet)) {
      return res.status(400).json({ error: `Sheet "${targetSheet}" not found in file` });
    }
    
    const sheet = workbook.Sheets[targetSheet];
    
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
      defval: '',
      raw: false // This ensures values are read as strings, not formatted
    });

    // Transform data according to mapping
    let currentMainCategory = null;
    let currentSubCategory = null;
    
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
      const number = getColumnValue(['NUMBER', 'Number', 'No', 'NO']).toString().trim();
      const description = getColumnValue([
        'THE HEALTHSHOP PRODUCTS',
        'PRODUCT DESCRIPTION',
        'DESCRIPTION',
        'Product'
      ]).toString().trim();

      const unit = getColumnValue(['UOM', 'UoM', 'UNIT', 'Unit']).toString().trim();
      
      // Remove commas from numeric values before parsing
      const unitCostStr = getColumnValue([
        'AVE UNIT COST',
        'Ave Unit Cost',
        'UNIT COST',
        'Unit Cost',
        'COST',
        'Cost'
      ]).toString().replace(/,/g, '');
      const unitCost = parseFloat(unitCostStr) || 0;

      const sellingPriceStr = getColumnValue([
        'SELLING PRICE',
        'Selling Price',
        'SP',
        'Price'
      ]).toString().replace(/,/g, '');
      const sellingPrice = parseFloat(sellingPriceStr) || 0;

      const quantityStr = getColumnValue([
        'QTY',
        'Qty',
        'QUANTITY',
        'Quantity',
        'END'
      ]).toString().replace(/,/g, '');
      const quantity = parseFloat(quantityStr) || 0;

      const expiryDateStr = getColumnValue([
        'EXPIRY DATE',
        'Expiry Date',
        'EXPIRATION DATE',
        'Expiration'
      ]).toString().trim();

      // Parse expiry date if present
      let expiryDate = null;
      if (expiryDateStr) {
        try {
          // Handle Excel date serial numbers
          if (!isNaN(expiryDateStr) && expiryDateStr.length <= 5) {
            // Excel serial date
            const excelEpoch = new Date(1899, 11, 30);
            const days = parseInt(expiryDateStr);
            const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
            expiryDate = date.toISOString().split('T')[0];
          } else {
            // Try parsing as regular date
            const date = new Date(expiryDateStr);
            if (!isNaN(date.getTime())) {
              expiryDate = date.toISOString().split('T')[0];
            }
          }
        } catch (e) {
          // Invalid date, leave as null
        }
      }

      // Check if this is a category row (has description but no brand, unit, or cost)
      const isCategory = description && !brand && !unit && unitCost === 0;
      
      // Check if it's GRAND TOTAL (exclude from categories)
      const isGrandTotal = description.toUpperCase().includes('GRAND TOTAL');
      
      let categoryType = null;
      let mainCategory = null;
      let subCategory = null;
      
      if (isCategory && !isGrandTotal) {
        // If previous row was also a category, use THIS row as the main category (more specific)
        // and discard the previous one
        if (currentMainCategory && !currentSubCategory) {
          // Previous was a main category, this is more specific - replace it
          currentMainCategory = description;
          currentSubCategory = null;
        } else {
          // This is a new main category
          currentMainCategory = description;
          currentSubCategory = null;
        }
        categoryType = 'main';
        mainCategory = description;
      } else if (!isCategory && !isGrandTotal) {
        // This is a product, assign current category
        mainCategory = currentMainCategory;
        subCategory = currentSubCategory;
      }

      // Generate batch number: use existing Number if available, otherwise mark for auto-generation
      const batchNumber = brand && number ? `${brand}-${number.padStart(3, '0')}` : (brand ? `${brand}-AUTO` : null);
      
      return {
        rowNumber: headerRowIndex + index + 2,
        brand: brand,
        number: number,
        batch_number: batchNumber,
        description: description,
        unit: unit,
        unit_cost: unitCost,
        suggested_selling_price: sellingPrice,
        quantity: quantity,
        expiry_date: expiryDate,
        is_category: isCategory && !isGrandTotal,
        is_grand_total: isGrandTotal,
        category_type: categoryType,
        main_category: mainCategory,
        sub_category: subCategory,
        original: {
          brand,
          number,
          content: getColumnValue(['CONTENT', 'Content'])
        }
      };
    }).filter(item => {
      // Filter out completely empty rows and GRAND TOTAL
      return !item.is_grand_total && (item.description || item.brand || item.unit || item.quantity > 0);
    });

    // Validate data
    const errors = [];
    const categories = [];
    
    previewData.forEach(item => {
      if (item.is_category) {
        categories.push({ row: item.rowNumber, name: item.description });
      } else {
        if (!item.brand) {
          errors.push(`Row ${item.rowNumber}: Missing Brand`);
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
      }
    });

    // Check for duplicates in database with detailed comparison
    const itemsToCheck = previewData.filter(item => !item.is_category && item.description && item.unit);
    
    let duplicates = [];
    let duplicateDetails = [];
    
    if (itemsToCheck.length > 0) {
      // Check for duplicates based on description + unit (the actual unique constraint)
      for (const item of itemsToCheck) {
        const duplicateQuery = await pool.query(
          `SELECT id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price 
           FROM inventory 
           WHERE description = $1 AND unit = $2 
           LIMIT 1`,
          [item.description, item.unit]
        );
        
        if (duplicateQuery.rows.length > 0) {
          const existing = duplicateQuery.rows[0];
          const priceChanged = 
            parseFloat(existing.unit_cost) !== parseFloat(item.unit_cost) ||
            parseFloat(existing.suggested_selling_price) !== parseFloat(item.suggested_selling_price);
          
          duplicateDetails.push({
            description: item.description,
            unit: item.unit,
            batch_number: existing.batch_number,
            existing: {
              quantity: existing.quantity,
              unit_cost: existing.unit_cost,
              selling_price: existing.suggested_selling_price
            },
            new: {
              quantity: item.quantity,
              unit_cost: item.unit_cost,
              selling_price: item.suggested_selling_price
            },
            priceChanged: priceChanged
          });
        }
      }
      duplicates = duplicateDetails.length;
    }

    res.json({
      success: true,
      preview: previewData,
      categories: categories,
      totalRows: previewData.length,
      duplicates: duplicates,
      duplicateDetails: duplicateDetails,
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
    const { data, locationId, branchId, duplicateAction, selectedDuplicates } = req.body;

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
    
    // Default to 'update' if not specified
    const handleDuplicates = duplicateAction || 'update';
    
    // Create a Set of selected duplicates for quick lookup
    const selectedDuplicatesSet = new Set(
      (selectedDuplicates || []).map(item => `${item.description}|||${item.unit}`)
    );
    
    // Track batch numbers by brand for auto-increment
    const brandCounters = {};
    
    console.log(`📦 Starting import of ${data.length} items...`);

    for (const item of data) {
      try {
        // Skip category rows
        if (item.is_category) {
          continue;
        }
        
        console.log(`Processing: ${item.description} (Brand: ${item.brand})`);
        
        // Generate batch number
        let batchNumber = item.batch_number;
        
        // If batch number is AUTO or missing, generate it
        if (!batchNumber || batchNumber.endsWith('-AUTO')) {
          if (!item.brand) {
            errors.push(`${item.description}: Missing brand for batch number generation`);
            skipped++;
            continue;
          }
          
          // Get existing max number for this brand
          if (!brandCounters[item.brand]) {
            try {
              const result = await client.query(
                `SELECT batch_number FROM inventory 
                 WHERE batch_number LIKE $1 
                 ORDER BY batch_number DESC LIMIT 1`,
                [`${item.brand}-%`]
              );
              
              if (result.rows.length > 0) {
                const lastBatch = result.rows[0].batch_number;
                const match = lastBatch.match(/-(\d+)$/);
                brandCounters[item.brand] = match ? parseInt(match[1]) : 0;
              } else {
                brandCounters[item.brand] = 0;
              }
            } catch (queryError) {
              console.error(`Error querying batch numbers for brand ${item.brand}:`, queryError);
              // Fallback: start from 0
              brandCounters[item.brand] = 0;
            }
          }
          
          // Increment and create batch number
          brandCounters[item.brand]++;
          batchNumber = `${item.brand}-${String(brandCounters[item.brand]).padStart(3, '0')}`;
        }
        
        if (!batchNumber) {
          errors.push(`${item.description}: Could not generate batch number`);
          skipped++;
          continue;
        }

        // Check if item already exists in warehouse
        const existingItem = await client.query(
          `SELECT id, quantity FROM inventory 
           WHERE location_id = $1 AND description = $2 AND unit = $3`,
          [locationId, item.description, item.unit]
        );

        let inventoryId;

        if (existingItem.rows.length > 0) {
          // Item already exists - check if it's in the selected list
          const itemKey = `${item.description}|||${item.unit}`;
          const isSelected = selectedDuplicatesSet.has(itemKey);
          
          if (!isSelected) {
            // Not selected for update, skip it
            skipped++;
            continue;
          }
          
          // Selected for update
          if (handleDuplicates === 'skip') {
            // Skip this item
            skipped++;
            continue;
          } else if (handleDuplicates === 'update') {
            // Update existing item (add quantities, update prices)
            await client.query(
              `UPDATE inventory 
               SET quantity = quantity + $1,
                   unit_cost = $2,
                   suggested_selling_price = $3,
                   expiry_date = COALESCE($4, expiry_date),
                   main_category = COALESCE($5, main_category),
                   sub_category = COALESCE($6, sub_category),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $7`,
              [item.quantity, item.unit_cost, item.suggested_selling_price, item.expiry_date, item.main_category, item.sub_category, existingItem.rows[0].id]
            );
            inventoryId = existingItem.rows[0].id;
            updated++;
          }
        } else {
          // Insert new item
          const result = await client.query(
            `INSERT INTO inventory 
             (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, main_category, sub_category)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [locationId, batchNumber, item.description, item.unit, item.quantity, item.unit_cost, item.suggested_selling_price, item.expiry_date, item.main_category, item.sub_category]
          );
          inventoryId = result.rows[0].id;
          imported++;
        }

        // If branch is selected, create transfer
        if (branchId) {
          // Check if item exists in branch
          const branchItem = await client.query(
            `SELECT id FROM inventory 
             WHERE location_id = $1 AND description = $2 AND unit = $3`,
            [branchId, item.description, item.unit]
          );

          // If doesn't exist in branch, create it
          if (branchItem.rows.length === 0) {
            await client.query(
              `INSERT INTO inventory 
               (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price, expiry_date, main_category, sub_category)
               VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)
               ON CONFLICT (location_id, description, unit) DO NOTHING`,
              [branchId, batchNumber, item.description, item.unit, item.unit_cost, item.suggested_selling_price, item.expiry_date, item.main_category, item.sub_category]
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
        const errorMsg = `${item.description}: ${itemError.message}`;
        console.error(`❌ Error processing item at row ${item.rowNumber}:`, {
          description: item.description,
          brand: item.brand,
          batch_number: item.batch_number || 'not generated',
          error: itemError.message,
          stack: itemError.stack
        });
        errors.push(errorMsg);
        skipped++;
      }
    }

    await client.query('COMMIT');
    
    console.log(`✅ Import complete: ${imported} imported, ${updated} updated, ${skipped} skipped, ${transferred} transferred`);
    if (errors.length > 0) {
      console.log(`⚠️ Errors: ${errors.length}`);
      errors.forEach(err => console.log(`  - ${err}`));
    }

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
