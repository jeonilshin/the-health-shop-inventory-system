const pool = require('../config/database');

/**
 * Delete inventory records with zero or negative quantity
 * BUT only if there are other batches of the same item remaining
 * This keeps items visible in inventory even when out of stock
 * 
 * @param {Object} client - Database client (for transactions) or null to use pool
 * @param {Number} inventoryId - Specific inventory ID to check, or null to check all
 * @returns {Promise<Number>} Number of records deleted
 */
async function cleanupZeroInventory(client = null, inventoryId = null) {
  const db = client || pool;
  
  try {
    if (inventoryId) {
      // Check if this specific batch should be deleted
      // Only delete if there are OTHER batches of the same item at the same location
      const result = await db.query(
        `WITH item_info AS (
          SELECT location_id, description, unit
          FROM inventory
          WHERE id = $1 AND quantity <= 0
        ),
        other_batches AS (
          SELECT COUNT(*) as batch_count
          FROM inventory i
          INNER JOIN item_info ii ON 
            i.location_id = ii.location_id 
            AND i.description = ii.description 
            AND i.unit = ii.unit
          WHERE i.id != $1 AND i.quantity > 0
        )
        DELETE FROM inventory
        WHERE id = $1 
          AND quantity <= 0
          AND EXISTS (SELECT 1 FROM other_batches WHERE batch_count > 0)
        RETURNING id`,
        [inventoryId]
      );
      
      if (result.rows.length > 0) {
        console.log(`🧹 Cleaned up zero-quantity batch (ID: ${inventoryId}) - other batches remain`);
      }
      
      return result.rows.length;
    } else {
      // Clean up all zero-quantity batches that have other batches remaining
      const result = await db.query(
        `WITH items_with_multiple_batches AS (
          SELECT i1.id
          FROM inventory i1
          WHERE i1.quantity <= 0
            AND EXISTS (
              SELECT 1 FROM inventory i2
              WHERE i2.location_id = i1.location_id
                AND i2.description = i1.description
                AND i2.unit = i1.unit
                AND i2.id != i1.id
                AND i2.quantity > 0
            )
        )
        DELETE FROM inventory
        WHERE id IN (SELECT id FROM items_with_multiple_batches)
        RETURNING id`
      );
      
      if (result.rows.length > 0) {
        console.log(`🧹 Cleaned up ${result.rows.length} zero-quantity batch(es) - other batches remain`);
      }
      
      return result.rows.length;
    }
  } catch (error) {
    console.error('Error cleaning up zero inventory:', error);
    // Don't throw - cleanup failure shouldn't break the main operation
    return 0;
  }
}

/**
 * Clean up zero-quantity inventory records for a specific location
 * Only deletes batches if other batches of the same item exist
 * 
 * @param {Object} client - Database client (for transactions) or null to use pool
 * @param {Number} locationId - Location ID to clean up
 * @returns {Promise<Number>} Number of records deleted
 */
async function cleanupZeroInventoryByLocation(client = null, locationId) {
  const db = client || pool;
  
  try {
    const result = await db.query(
      `WITH items_with_multiple_batches AS (
        SELECT i1.id
        FROM inventory i1
        WHERE i1.location_id = $1
          AND i1.quantity <= 0
          AND EXISTS (
            SELECT 1 FROM inventory i2
            WHERE i2.location_id = i1.location_id
              AND i2.description = i1.description
              AND i2.unit = i1.unit
              AND i2.id != i1.id
              AND i2.quantity > 0
          )
      )
      DELETE FROM inventory
      WHERE id IN (SELECT id FROM items_with_multiple_batches)
      RETURNING id`,
      [locationId]
    );
    
    if (result.rows.length > 0) {
      console.log(`🧹 Cleaned up ${result.rows.length} zero-quantity batch(es) at location ${locationId}`);
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
