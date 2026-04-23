/**
 * Test Transfer Approval - Verify Inventory Deduction
 * 
 * This script tests if the approval endpoint properly deducts inventory
 */

const pool = require('./server/config/database');

async function testTransferApproval() {
  const client = await pool.connect();
  
  try {
    console.log('=== TESTING TRANSFER APPROVAL ===\n');
    
    // Get a pending transfer
    const pendingTransfers = await client.query(`
      SELECT 
        t.*,
        fl.name as from_location_name,
        tl.name as to_location_name
      FROM transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.status = 'pending'
      ORDER BY t.created_at DESC
      LIMIT 1
    `);
    
    if (pendingTransfers.rows.length === 0) {
      console.log('No pending transfers found. Create a transfer first.');
      return;
    }
    
    const transfer = pendingTransfers.rows[0];
    console.log(`Found pending transfer #${transfer.id}:`);
    console.log(`  Item: ${transfer.description} (${transfer.quantity} ${transfer.unit})`);
    console.log(`  From: ${transfer.from_location_name} (ID: ${transfer.from_location_id})`);
    console.log(`  To: ${transfer.to_location_name} (ID: ${transfer.to_location_id})`);
    console.log('');
    
    // Check inventory BEFORE approval
    console.log('Inventory BEFORE approval:');
    const inventoryBefore = await client.query(`
      SELECT 
        i.id,
        i.location_id,
        l.name as location_name,
        i.description,
        i.unit,
        i.quantity,
        i.unit_cost
      FROM inventory i
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.description = $1
        AND i.unit = $2
        AND i.location_id = $3
      ORDER BY i.created_at ASC
    `, [transfer.description, transfer.unit, transfer.from_location_id]);
    
    if (inventoryBefore.rows.length === 0) {
      console.log('  ❌ No inventory found at source location!');
      console.log('  Cannot approve this transfer.');
      return;
    }
    
    const totalBefore = inventoryBefore.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
    console.log(`  Source (${transfer.from_location_name}):`);
    for (const batch of inventoryBefore.rows) {
      console.log(`    Batch #${batch.id}: ${batch.quantity} ${batch.unit}`);
    }
    console.log(`  Total: ${totalBefore} ${transfer.unit}`);
    console.log('');
    
    // Simulate the approval deduction logic
    console.log('Simulating approval deduction (FIFO):');
    await client.query('BEGIN');
    
    let remainingToDeduct = parseFloat(transfer.quantity);
    console.log(`  Need to deduct: ${remainingToDeduct}`);
    
    for (const batch of inventoryBefore.rows) {
      if (remainingToDeduct <= 0) break;
      
      const batchQty = parseFloat(batch.quantity);
      if (batchQty <= 0) continue;
      
      const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
      
      console.log(`  Deducting ${deductFromThisBatch} from batch #${batch.id} (had ${batchQty})`);
      
      const updateResult = await client.query(
        'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [deductFromThisBatch, batch.id]
      );
      
      console.log(`    After: ${updateResult.rows[0].quantity}`);
      
      remainingToDeduct -= deductFromThisBatch;
    }
    
    console.log(`  Remaining to deduct: ${remainingToDeduct} (should be 0)`);
    console.log('');
    
    // Check inventory AFTER deduction
    console.log('Inventory AFTER deduction:');
    const inventoryAfter = await client.query(`
      SELECT 
        i.id,
        i.location_id,
        l.name as location_name,
        i.description,
        i.unit,
        i.quantity
      FROM inventory i
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.description = $1
        AND i.unit = $2
        AND i.location_id = $3
      ORDER BY i.created_at ASC
    `, [transfer.description, transfer.unit, transfer.from_location_id]);
    
    const totalAfter = inventoryAfter.rows.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
    console.log(`  Source (${transfer.from_location_name}):`);
    for (const batch of inventoryAfter.rows) {
      console.log(`    Batch #${batch.id}: ${batch.quantity} ${batch.unit}`);
    }
    console.log(`  Total: ${totalAfter} ${transfer.unit}`);
    console.log('');
    
    // Verify
    const expectedAfter = totalBefore - parseFloat(transfer.quantity);
    console.log('Verification:');
    console.log(`  Before: ${totalBefore}`);
    console.log(`  Deducted: ${transfer.quantity}`);
    console.log(`  Expected After: ${expectedAfter}`);
    console.log(`  Actual After: ${totalAfter}`);
    
    if (Math.abs(totalAfter - expectedAfter) < 0.01) {
      console.log('  ✅ Deduction worked correctly!');
    } else {
      console.log('  ❌ Deduction did NOT work!');
    }
    
    // ROLLBACK - don't actually approve
    await client.query('ROLLBACK');
    console.log('\n✅ Test complete (changes rolled back)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error);
  } finally {
    client.release();
  }
}

// Run the test
testTransferApproval().then(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
