const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { auth, authorize } = require('../middleware/auth');
const pool = require('../config/database');
const { logAudit } = require('../middleware/auditLog');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Preview Excel data before import
router.post('/preview', auth, authorize('admin', 'warehouse'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sheetName, locationId } = req.body;

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
        'ITEM DESCRIPTION',
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

      const contentStr = getColumnValue(['CONTENT', 'Content']).toString().trim();
      const content = contentStr ? parseFloat(contentStr.replace(/,/g, '')) || null : null;

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
        content: content,
        is_category: isCategory && !isGrandTotal,
        is_grand_total: isGrandTotal,
        category_type: categoryType,
        main_category: mainCategory,
        sub_category: subCategory
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
        // Note: unit_cost, selling_price, and quantity are all optional now
      }
    });

    // Check for duplicates in database with detailed comparison
    const itemsToCheck = previewData.filter(item => !item.is_category && item.description && item.unit);
    
    let duplicates = [];
    let duplicateDetails = [];
    
    if (itemsToCheck.length > 0 && locationId) {
      // Check for duplicates based on description + unit + location (the actual unique constraint)
      for (const item of itemsToCheck) {
        const duplicateQuery = await pool.query(
          `SELECT id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price 
           FROM inventory 
           WHERE location_id = $1 AND description = $2 AND unit = $3 
           LIMIT 1`,
          [locationId, item.description, item.unit]
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

// Import Excel data to inventory with individual transaction processing
router.post('/import', auth, authorize('admin', 'warehouse'), async (req, res) => {
  try {
    const { data, locationId, branchId, duplicateAction, selectedDuplicates } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let transferred = 0;
    const errors = [];
    const conversionsCreated = [];
    
    // Default to 'update' if not specified
    const handleDuplicates = duplicateAction || 'update';
    
    // Create a Map of selected duplicates with their update options for quick lookup
    const selectedDuplicatesMap = new Map(
      (selectedDuplicates || []).map(item => [
        `${item.description}|||${item.unit}`,
        { updateQty: item.updateQty, updatePrice: item.updatePrice }
      ])
    );
    
    // Track batch numbers by brand for auto-increment
    const brandCounters = {};
    
    console.log(`📦 Starting import of ${data.length} items...`);

    // First pass: Detect unit conversion pairs
    const conversionPairs = new Map(); // key: base_description, value: { baseUnit, convertedUnit, content }
    
    for (const item of data) {
      if (item.is_category || !item.description || !item.unit) continue;
      
      // Check if this item has content (conversion factor)
      if (item.content && item.content > 0) {
        // This is the smaller unit (e.g., PC with content 10)
        // Find the base unit (e.g., BOT) by looking for same description without content
        const baseDescription = item.description.replace(/\s*(PC|PACK|PIECE|PCS)$/i, '').trim();
        
        // Store this as a potential conversion
        if (!conversionPairs.has(baseDescription)) {
          conversionPairs.set(baseDescription, []);
        }
        
        conversionPairs.get(baseDescription).push({
          convertedUnit: item.unit,
          content: item.content,
          fullDescription: item.description
        });
      }
    }
    
    // Second pass: Match base units with converted units and create conversions
    for (const item of data) {
      if (item.is_category || !item.description || !item.unit) continue;
      
      // Check if this is a base unit (no content or content is 0)
      if (!item.content || item.content === 0) {
        const baseDescription = item.description.trim();
        
        // Look for matching converted units
        const matches = conversionPairs.get(baseDescription);
        if (matches && matches.length > 0) {
          for (const match of matches) {
            try {
              // Create or update unit conversion
              await pool.query(
                `INSERT INTO unit_conversions (product_description, base_unit, converted_unit, conversion_factor)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (product_description, base_unit, converted_unit)
                 DO UPDATE SET conversion_factor = $4, updated_at = CURRENT_TIMESTAMP`,
                [baseDescription, item.unit, match.convertedUnit, match.content]
              );
              const conversionMsg = `${baseDescription}: 1 ${item.unit} = ${match.content} ${match.convertedUnit}`;
              console.log(`🔗 Created conversion: ${conversionMsg}`);
              conversionsCreated.push(conversionMsg);
            } catch (convError) {
              console.error(`⚠️ Failed to create conversion for ${baseDescription}:`, convError.message);
            }
          }
        }
      }
    }

    // Process each item individually to avoid transaction rollback issues
    for (const item of data) {
      // Skip category rows
      if (item.is_category) {
        continue;
      }

      // Skip rows without required data (only brand, description, and unit are required)
      // Quantity, unit_cost, and selling_price can all be 0 or empty
      if (!item.description || !item.unit) {
        const missing = [];
        if (!item.description) missing.push('description');
        if (!item.unit) missing.push('unit');
        errors.push(`Row ${data.indexOf(item) + 1}: Missing required fields (${missing.join(', ')})`);
        skipped++;
        continue;
      }

      // Ensure quantity defaults to 0 if not provided
      if (!item.quantity || item.quantity === '' || isNaN(item.quantity)) {
        item.quantity = 0;
        console.log(`📝 Set quantity to 0 for ${item.description} (was empty or invalid)`);
      }

      // If unit_cost is 0 or empty, try to use previous batch's cost
      if (!item.unit_cost || item.unit_cost === '' || isNaN(item.unit_cost) || item.unit_cost < 0 || parseFloat(item.unit_cost) === 0) {
        // Check for existing items with this description and unit
        const previousBatch = await pool.query(
          `SELECT unit_cost, suggested_selling_price FROM inventory 
           WHERE location_id = $1 AND description = $2 AND unit = $3 
           ORDER BY created_at DESC LIMIT 1`,
          [locationId, item.description, item.unit]
        );
        
        if (previousBatch.rows.length > 0) {
          item.unit_cost = previousBatch.rows[0].unit_cost;
          if (!item.suggested_selling_price || parseFloat(item.suggested_selling_price) === 0) {
            item.suggested_selling_price = previousBatch.rows[0].suggested_selling_price;
          }
          console.log(`📝 Using previous batch cost for ${item.description}: ₱${item.unit_cost}`);
        } else {
          item.unit_cost = 0;
          console.log(`📝 Set unit cost to 0 for ${item.description} (no previous batch found)`);
        }
      }

      // Ensure selling_price defaults to 0 if not provided
      if (!item.suggested_selling_price || item.suggested_selling_price === '' || isNaN(item.suggested_selling_price) || item.suggested_selling_price < 0) {
        item.suggested_selling_price = 0;
        console.log(`📝 Set selling price to 0 for ${item.description} (was empty or invalid)`);
      }

      // Process each item in its own transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        console.log(`Processing: ${item.description} (Brand: ${item.brand})`);
        
        // Generate batch number
        let batchNumber = item.batch_number;
        
        // If batch number is AUTO or missing, generate it
        if (!batchNumber || batchNumber.endsWith('-AUTO')) {
          if (!item.brand) {
            errors.push(`${item.description}: Missing brand for batch number generation`);
            skipped++;
            await client.query('ROLLBACK');
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
          await client.query('ROLLBACK');
          continue;
        }

        // Check if item already exists in warehouse (check for exact same cost batch)
        const existingItem = await client.query(
          `SELECT id, quantity, unit_cost, suggested_selling_price, cost_batch_id FROM inventory 
           WHERE location_id = $1 AND description = $2 AND unit = $3
           ORDER BY created_at DESC
           LIMIT 1`,
          [locationId, item.description, item.unit]
        );

        let inventoryId;

        if (existingItem.rows.length > 0) {
          // Item already exists - check if it's in the selected list
          const itemKey = `${item.description}|||${item.unit}`;
          const updateOptions = selectedDuplicatesMap.get(itemKey);
          
          if (!updateOptions) {
            // Not selected for update, skip it
            skipped++;
            await client.query('ROLLBACK');
            continue;
          }
          
          // Selected for update - apply based on options
          if (handleDuplicates === 'skip') {
            // Skip this item
            skipped++;
            await client.query('ROLLBACK');
            continue;
          } else if (handleDuplicates === 'update') {
            // ===== NEW LOGIC: Check if cost is different =====
            const existingCost = parseFloat(existingItem.rows[0].unit_cost);
            const newCost = parseFloat(item.unit_cost);
            const existingPrice = parseFloat(existingItem.rows[0].suggested_selling_price || 0);
            let newPrice = parseFloat(item.suggested_selling_price || 0);
            
            // Auto-fill selling price from existing item if not provided in import
            if (!item.suggested_selling_price || newPrice === 0) {
              item.suggested_selling_price = existingItem.rows[0].suggested_selling_price;
              newPrice = existingPrice; // Update newPrice after auto-fill
              console.log(`📝 Auto-filled selling price for ${item.description}: ₱${existingPrice}`);
            }
            
            const isDifferentCost = Math.abs(existingCost - newCost) > 0.01 || 
                                   Math.abs(existingPrice - newPrice) > 0.01;
            
            // If user wants to update price AND the cost is different, create a NEW BATCH
            if (updateOptions.updatePrice && isDifferentCost) {
              // Create a new cost batch instead of updating existing
              const timestamp = Date.now();
              const costBatchId = `BATCH-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
              
              // Check if this exact cost already exists for this item
              const allExistingCosts = await client.query(
                `SELECT DISTINCT unit_cost FROM inventory 
                 WHERE location_id = $1 AND description = $2 AND unit = $3`,
                [locationId, item.description, item.unit]
              );
              
              const isNewCost = !allExistingCosts.rows.some(row => 
                Math.abs(parseFloat(row.unit_cost) - newCost) < 0.01
              );
              
              const result = await client.query(
                `INSERT INTO inventory 
                 (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price, 
                  expiry_date, main_category, sub_category, max_quantity, is_new_item, is_new_cost, cost_batch_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $5, false, $11, $12)
                 RETURNING id`,
                [locationId, batchNumber, item.description, item.unit, item.quantity, item.unit_cost, 
                 item.suggested_selling_price, item.expiry_date, item.main_category, item.sub_category,
                 isNewCost, costBatchId]
              );
              inventoryId = result.rows[0].id;
              imported++;
              console.log(`✨ Created new cost batch for ${item.description}: ₱${newCost} (was ₱${existingCost})`);
            } else {
              // Same cost or user doesn't want to update price - just update quantity
              const updates = [];
              const values = [];
              let paramCount = 1;
              
              if (updateOptions.updateQty) {
                updates.push(`quantity = quantity + $${paramCount}`);
                values.push(item.quantity);
                paramCount++;
                
                updates.push(`max_quantity = GREATEST(COALESCE(max_quantity, 0), quantity + $${paramCount})`);
                values.push(item.quantity);
                paramCount++;
              }
              
              // Only update price if user selected it AND cost is the same
              if (updateOptions.updatePrice && !isDifferentCost) {
                updates.push(`unit_cost = $${paramCount}`);
                values.push(item.unit_cost);
                paramCount++;
                
                updates.push(`suggested_selling_price = $${paramCount}`);
                values.push(item.suggested_selling_price);
                paramCount++;
              }
              
              // Always update these if provided
              if (item.expiry_date) {
                updates.push(`expiry_date = $${paramCount}`);
                values.push(item.expiry_date);
                paramCount++;
              }
              
              if (item.main_category) {
                updates.push(`main_category = $${paramCount}`);
                values.push(item.main_category);
                paramCount++;
              }
              
              if (item.sub_category) {
                updates.push(`sub_category = $${paramCount}`);
                values.push(item.sub_category);
                paramCount++;
              }
              
              updates.push('updated_at = CURRENT_TIMESTAMP');
              
              // Add WHERE clause parameter
              values.push(existingItem.rows[0].id);
              
              if (updates.length > 1) { // More than just updated_at
                await client.query(
                  `UPDATE inventory SET ${updates.join(', ')} WHERE id = $${paramCount}`,
                  values
                );
              }
              
              inventoryId = existingItem.rows[0].id;
              updated++;
            }
          }
        } else {
          // Insert new item with batch tracking
          const timestamp = Date.now();
          const costBatchId = `BATCH-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Check if this is a new item or new cost
          const existingItemsAnyLocation = await client.query(
            `SELECT id FROM inventory WHERE description = $1 AND unit = $2 LIMIT 1`,
            [item.description, item.unit]
          );
          
          const isNewItem = existingItemsAnyLocation.rows.length === 0;
          
          // Check if this is a new cost (different from existing costs for this item)
          let isNewCost = false;
          if (!isNewItem) {
            const existingCosts = await client.query(
              `SELECT DISTINCT unit_cost FROM inventory WHERE description = $1 AND unit = $2`,
              [item.description, item.unit]
            );
            
            const hasDifferentCost = !existingCosts.rows.some(row => 
              parseFloat(row.unit_cost) === parseFloat(item.unit_cost)
            );
            isNewCost = hasDifferentCost;
          }
          
          const result = await client.query(
            `INSERT INTO inventory 
             (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price, 
              expiry_date, main_category, sub_category, max_quantity, is_new_item, is_new_cost, cost_batch_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $5, $11, $12, $13)
             RETURNING id`,
            [locationId, batchNumber, item.description, item.unit, item.quantity, item.unit_cost, 
             item.suggested_selling_price, item.expiry_date, item.main_category, item.sub_category,
             isNewItem, isNewCost, costBatchId]
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

          // If doesn't exist in branch, create it with batch tracking
          if (branchItem.rows.length === 0) {
            const branchCostBatchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            await client.query(
              `INSERT INTO inventory 
               (location_id, batch_number, description, unit, quantity, unit_cost, suggested_selling_price, 
                expiry_date, main_category, sub_category, max_quantity, is_new_item, is_new_cost, cost_batch_id)
               VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, 0, false, false, $10)
               ON CONFLICT (location_id, description, unit, cost_batch_id) DO NOTHING`,
              [branchId, batchNumber, item.description, item.unit, item.unit_cost, item.suggested_selling_price, 
               item.expiry_date, item.main_category, item.sub_category, branchCostBatchId]
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

        await client.query('COMMIT');
        
      } catch (itemError) {
        await client.query('ROLLBACK');
        const errorMsg = `${item.description}: ${itemError.message}`;
        console.error(`❌ Error processing item:`, {
          description: item.description,
          brand: item.brand,
          batch_number: item.batch_number || 'not generated',
          error: itemError.message
        });
        errors.push(errorMsg);
        skipped++;
      } finally {
        client.release();
      }
    }
    
    console.log(`✅ Import complete: ${imported} imported, ${updated} updated, ${skipped} skipped, ${transferred} transferred`);
    if (conversionsCreated.length > 0) {
      console.log(`🔗 Conversions created: ${conversionsCreated.length}`);
      conversionsCreated.forEach(conv => console.log(`  - ${conv}`));
    }
    if (errors.length > 0) {
      console.log(`⚠️ Errors: ${errors.length}`);
      errors.forEach(err => console.log(`  - ${err}`));
    }

    // Log audit for the import operation
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'INVENTORY_IMPORT',
      tableName: 'inventory',
      recordId: null,
      newValues: { 
        imported: imported, 
        updated: updated,
        skipped: skipped, 
        transferred: transferred,
        conversions: conversionsCreated.length,
        errors: errors.length,
        location: locationId 
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      description: `Imported ${imported} items, updated ${updated}, skipped ${skipped}, transferred ${transferred}, ${conversionsCreated.length} conversions, ${errors.length} errors`
    });

    if (errors.length > 0) {
      return res.status(200).json({
        success: true,
        message: `⚠️ Import completed with ${errors.length} errors`,
        imported,
        updated,
        skipped,
        transferred,
        conversions: conversionsCreated.length,
        conversionDetails: conversionsCreated,
        errors: errors.slice(0, 5), // Show first 5 errors
        totalErrors: errors.length,
        fullErrorList: errors // Full list for console
      });
    }

    res.json({
      success: true,
      message: `✅ Import successful! ${imported} imported, ${updated} updated, ${skipped} skipped, ${transferred} transferred${conversionsCreated.length > 0 ? `, ${conversionsCreated.length} conversions created` : ''}`,
      imported,
      updated,
      skipped,
      transferred,
      conversions: conversionsCreated.length,
      conversionDetails: conversionsCreated
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import data: ' + error.message });
  }
});

module.exports = router;