/**
 * Diagnose and Fix Transfer Inventory Issues
 * 
 * This script helps identify and fix transfers where:
 * 1. Inventory was added to destination but NOT deducted from source
 * 2. Transfers were approved but inventory wasn't deducted
 */

const pool = require('./server/config/database');

async function diagnoseTransfers() {
  const client = await pool.connect();
  
  try {
    console.log('=== TRANSFER DIAGNOSIS ===\n');
    
    // 1. Get all delivered transfers from today
    console.log('1. Recent Delivered Transfers:');
    const deliveredTransfers = await client.query(`
      SELECT 
        t.id,
        t.description,
        t.unit,
        t.quantity,
        t.from_location_id,
        fl.name as from_location,
        t.to_location_id,
        tl.name as to_location,
        t.status,
        t.approved_at,
        t.delivered_at,
        u.username as approved_by_user
      FROM transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users u ON t.approved_by = u.id
      WHERE t.status = 'delivered'
        AND t.delivered_at > CURRENT_DATE
      ORDER BY t.delivered_at DESC
    `);
    
    console.log(`Found ${deliveredTransfers.rows.length} delivered transfers today\n`);
    
    for (const transfer of deliveredTransfers.rows) {
      console.log(`Transfer #${transfer.id}:`);
      console.log(`  Item: ${transfer.description} (${transfer.quantity} ${transfer.unit})`);
      console.log(`  From: ${transfer.from_location} (ID: ${transfer.from_location_id})`);
      console.log(`  To: ${transfer.to_location} (ID: ${transfer.to_location_id})`);
      console.log(`  Approved: ${transfer.approved_at}`);
      console.log(`  Delivered: ${transfer.delivered_at}`);
      console.log(`  Approved by: ${transfer.approved_by_user}`);
      
      // Check inventory at both locations
      const inventoryCheck = await client.query(`
        SELECT 
          i.location_id,
          l.name as location_name,
          SUM(i.quantity) as total_quantity,
          COUNT(*) as batch_count
        FROM inventory i
        LEFT JOIN locations l ON i.location_id = l.id
        WHERE i.description = $1
          AND i.unit = $2
          AND i.location_id IN ($3, $4)
        GROUP BY i.location_id, l.name
      `, [transfer.description, transfer.unit, transfer.from_location_id, transfer.to_location_id]);
      
      console.log(`  Current Inventory:`);
      for (const inv of inventoryCheck.rows) {
        console.log(`    ${inv.location_name}: ${inv.total_quantity} ${transfer.unit} (${inv.batch_count} batches)`);
      }
      console.log('');
    }
    
    // 2. Get all approved transfers (waiting to be received)
    console.log('\n2. Approved Transfers (Waiting to be Received):');
    const approvedTransfers = await client.query(`
      SELECT 
        t.id,
        t.description,
        t.unit,
        t.quantity,
        fl.name as from_location,
        tl.name as to_location,
        t.approved_at
      FROM transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.status = 'approved'
      ORDER BY t.approved_at DESC
    `);
    
    console.log(`Found ${approvedTransfers.rows.length} approved transfers\n`);
    for (const transfer of approvedTransfers.rows) {
      console.log(`Transfer #${transfer.id}: ${transfer.quantity} ${transfer.unit} of ${transfer.description}`);
      console.log(`  ${transfer.from_location} → ${transfer.to_location}`);
      console.log(`  Approved: ${transfer.approved_at}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
  }
}

async function fixDuplicateInventory(transferId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`\n=== FIXING TRANSFER #${transferId} ===\n`);
    
    // Get transfer details
    const transferResult = await client.query(`
      SELECT * FROM transfers WHERE id = $1
    `, [transferId]);
    
    if (transferResult.rows.length === 0) {
      console.log('Transfer not found!');
      return;
    }
    
    const transfer = transferResult.rows[0];
    console.log(`Transfer: ${transfer.quantity} ${transfer.unit} of ${transfer.description}`);
    console.log(`From Location ID: ${transfer.from_location_id}`);
    console.log(`To Location ID: ${transfer.to_location_id}`);
    console.log(`Status: ${transfer.status}`);
    
    if (transfer.status !== 'delivered') {
      console.log('Transfer is not delivered. No fix needed.');
      await client.query('ROLLBACK');
      return;
    }
    
    // Check current inventory at source
    const sourceInventory = await client.query(`
      SELECT * FROM inventory
      WHERE location_id = $1
        AND description = $2
        AND unit = $3
        AND quantity > 0
      ORDER BY created_at ASC
    `, [transfer.from_location_id, transfer.description, transfer.unit]);
    
    if (sourceInventory.rows.length === 0) {
      console.log('ERROR: No inventory found at source location!');
      console.log('Cannot deduct - item may have been sold or transferred elsewhere.');
      await client.query('ROLLBACK');
      return;
    }
    
    const totalAvailable = sourceInventory.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
    console.log(`\nCurrent inventory at source: ${totalAvailable} ${transfer.unit}`);
    console.log(`Need to deduct: ${transfer.quantity} ${transfer.unit}`);
    
    if (totalAvailable < parseFloat(transfer.quantity)) {
      console.log('ERROR: Insufficient inventory at source!');
      console.log('Cannot deduct full amount. Manual intervention required.');
      await client.query('ROLLBACK');
      return;
    }
    
    // Deduct using FIFO
    console.log('\nDeducting inventory (FIFO):');
    let remainingToDeduct = parseFloat(transfer.quantity);
    
    for (const batch of sourceInventory.rows) {
      if (remainingToDeduct <= 0) break;
      
      const batchQty = parseFloat(batch.quantity);
      const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
      
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [deductFromThisBatch, batch.id]
      );
      
      console.log(`  Batch #${batch.id}: Deducted ${deductFromThisBatch} (had ${batchQty})`);
      remainingToDeduct -= deductFromThisBatch;
    }
    
    console.log('\n✅ Inventory deducted successfully!');
    console.log('\nVerifying...');
    
    // Verify
    const verifyResult = await client.query(`
      SELECT 
        i.location_id,
        l.name as location_name,
        SUM(i.quantity) as total_quantity
      FROM inventory i
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.description = $1
        AND i.unit = $2
        AND i.location_id IN ($3, $4)
      GROUP BY i.location_id, l.name
    `, [transfer.description, transfer.unit, transfer.from_location_id, transfer.to_location_id]);
    
    console.log('Current inventory after fix:');
    for (const inv of verifyResult.rows) {
      console.log(`  ${inv.location_name}: ${inv.total_quantity} ${transfer.unit}`);
    }
    
    console.log('\nCommit this fix? (You need to manually commit in the database)');
    console.log('Run: COMMIT; (if correct) or ROLLBACK; (if wrong)');
    
    // Don't auto-commit - let user verify
    // await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error);
  } finally {
    client.release();
  }
}

// Main execution
const command = process.argv[2];
const transferId = process.argv[3];

if (command === 'diagnose') {
  diagnoseTransfers().then(() => {
    console.log('\n=== DIAGNOSIS COMPLETE ===');
    process.exit(0);
  });
} else if (command === 'fix' && transferId) {
  fixDuplicateInventory(parseInt(transferId)).then(() => {
    console.log('\n=== FIX COMPLETE ===');
    console.log('Review the changes above and commit if correct.');
    process.exit(0);
  });
} else {
  console.log('Usage:');
  console.log('  node diagnose-and-fix-transfers.js diagnose');
  console.log('  node diagnose-and-fix-transfers.js fix <transfer_id>');
  process.exit(1);
}
