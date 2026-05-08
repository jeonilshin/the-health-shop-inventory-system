const pool = require('../config/database');

/**
 * Delete inventory records with zero or negative quantity
 * Call this after any operation that reduces inventory quantity
 * 
 * @param {Object} client - Database client (for transactions) or null to use pool
 * @param {Number} inventoryId - Specific inventory ID to check, or null to check all
 * @returns {Promise<Number>} Number of records deleted
 */
async function cleanupZeroInventory(client = null, inventoryId = null) {
  const db = client || pool;
  
  try {
    let query;
    let params = [];
    
    if (inventoryId) {
      // Clean up specific inventory record
      query = 'DELETE FROM inventory WHERE id = $1 AND quantity <= 0 RETURNING id';
      params = [inventoryId];
    } else {
      // Clean up all zero-quantity records
      query = 'DELETE FROM inventory WHERE quantity <= 0 RETURNING id';
    }
    
    const result = await db.query(query, params);
    
    if (result.rows.length > 0) {
      console.log(`🧹 Cleaned up ${result.rows.length} zero-quantity inventory record(s)`);
    }
    
    return result.rows.length;
  } catch (error) {
    console.error('Error cleaning up zero inventory:', error);
    // Don't throw - cleanup failure shouldn't break the main operation
    return 0;
  }
}

/**
 * Clean up zero-quantity inventory records for a specific location
 * Useful after bulk operations
 * 
 * @param {Object} client - Database client (for transactions) or null to use pool
 * @param {Number} locationId - Location ID to clean up
 * @returns {Promise<Number>} Number of records deleted
 */
async function cleanupZeroInventoryByLocation(client = null, locationId) {
  const db = client || pool;
  
  try {
    const result = await db.query(
      'DELETE FROM inventory WHERE location_id = $1 AND quantity <= 0 RETURNING id',
      [locationId]
    );
    
    if (result.rows.length > 0) {
      console.log(`🧹 Cleaned up ${result.rows.length} zero-quantity records at location ${locationId}`);
    }
    
    return result.rows.length;
  } catch (error) {
    console.error('Error cleaning up zero inventory by location:', error);
    return 0;
  }
}

module.exports = {
  cleanupZeroInventory,
  cleanupZeroInventoryByLocation
};
