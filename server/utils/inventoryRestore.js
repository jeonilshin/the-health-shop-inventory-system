const pool = require('../config/database');

/**
 * Return stock to a source location after a cancellation/rejection.
 *
 * Tries to merge into an existing matching batch at the source
 * (description + unit + unit_cost + selling price + expiry).
 * If no compatible batch exists (e.g. the source ran the batch down to zero
 * and the row was auto-cleaned), inserts a new inventory row.
 */
async function restoreToSource(client, {
  locationId,
  description,
  unit,
  quantity,
  unitCost,
  suggestedSellingPrice = null,
  batchNumber = null,
  expiryDate = null,
}) {
  const db = client || pool;
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) return;

  const sellingPrice = suggestedSellingPrice != null
    ? parseFloat(suggestedSellingPrice)
    : null;

  const existing = await db.query(
    `SELECT id FROM inventory
      WHERE location_id = $1
        AND description = $2
        AND unit = $3
        AND unit_cost = $4
        AND COALESCE(suggested_selling_price, 0) = COALESCE($5, 0)
        AND ((expiry_date IS NULL AND $6::date IS NULL) OR expiry_date = $6::date)
      LIMIT 1`,
    [locationId, description, unit, unitCost, sellingPrice, expiryDate]
  );

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE inventory
          SET quantity = quantity + $1,
              max_quantity = GREATEST(COALESCE(max_quantity, 0), quantity + $1),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [qty, existing.rows[0].id]
    );
    return;
  }

  const costBatchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.query(
    `INSERT INTO inventory
       (location_id, description, unit, quantity, unit_cost, suggested_selling_price,
        batch_number, expiry_date, max_quantity, cost_batch_id, is_new_item, is_new_cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4, $9, false, false)`,
    [
      locationId,
      description,
      unit,
      qty,
      unitCost,
      sellingPrice != null ? sellingPrice : unitCost,
      batchNumber,
      expiryDate,
      costBatchId,
    ]
  );
}

/**
 * Restore inventory for every item belonging to a transfer.
 * Uses transfer_items if present, otherwise falls back to the legacy
 * single-item columns on the transfers row.
 *
 * Pulls batch_number/expiry_date hints from an existing source row when
 * available, so restored stock keeps lot tracking where possible.
 */
async function restoreTransferToSource(client, transferRow) {
  const items = await client.query(
    `SELECT description, unit, quantity, unit_cost, batch_number, expiry_date
       FROM transfer_items
      WHERE transfer_id = $1`,
    [transferRow.id]
  );

  const lines = items.rows.length > 0
    ? items.rows
    : [{
        description: transferRow.description,
        unit: transferRow.unit,
        quantity: transferRow.quantity,
        unit_cost: transferRow.unit_cost,
        batch_number: null,
        expiry_date: null,
      }];

  for (const line of lines) {
    if (!line.description || !line.quantity) continue;

    const hint = await client.query(
      `SELECT batch_number, expiry_date, suggested_selling_price
         FROM inventory
        WHERE location_id = $1 AND description = $2 AND unit = $3
        ORDER BY updated_at DESC
        LIMIT 1`,
      [transferRow.from_location_id, line.description, line.unit]
    );
    const hintRow = hint.rows[0] || {};

    await restoreToSource(client, {
      locationId: transferRow.from_location_id,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      unitCost: line.unit_cost,
      suggestedSellingPrice: hintRow.suggested_selling_price ?? null,
      batchNumber: line.batch_number ?? hintRow.batch_number ?? null,
      expiryDate: line.expiry_date ?? hintRow.expiry_date ?? null,
    });
  }
}

module.exports = { restoreToSource, restoreTransferToSource };
