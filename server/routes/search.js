const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

// Autocomplete search for inventory items
router.get('/inventory', auth, async (req, res) => {
  try {
    const { q, location_id } = req.query;
    
    if (!q || q.length < 3) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;
    let query;
    let params;

    // Filter by location if provided
    if (location_id) {
      query = `
        SELECT
          i.id,
          i.description,
          i.unit,
          i.quantity,
          i.unit_cost,
          i.suggested_selling_price,
          i.expiry_date,
          i.batch_number,
          i.created_at,
          l.name as location_name,
          l.id as location_id
        FROM inventory i
        JOIN locations l ON i.location_id = l.id
        WHERE i.location_id = $1
          AND (i.description ILIKE $2 OR i.batch_number ILIKE $2)
          AND i.quantity > 0
        ORDER BY i.description, i.expiry_date NULLS LAST, i.created_at ASC
        LIMIT 50
      `;
      params = [location_id, searchTerm];
    } else {
      // Search across all locations (for admin)
      query = `
        SELECT
          i.id,
          i.description,
          i.unit,
          i.quantity,
          i.unit_cost,
          i.suggested_selling_price,
          i.expiry_date,
          i.batch_number,
          i.created_at,
          l.name as location_name,
          l.id as location_id
        FROM inventory i
        JOIN locations l ON i.location_id = l.id
        WHERE (i.description ILIKE $1 OR i.batch_number ILIKE $1)
          AND i.quantity > 0
        ORDER BY i.description, i.expiry_date NULLS LAST, i.created_at ASC
        LIMIT 100
      `;
      params = [searchTerm];
    }

    const result = await pool.query(query, params);

    // Group rows by (description, unit, location_id) so products with
    // multiple expiries show as one search result with aggregated quantity.
    const groups = new Map();
    for (const row of result.rows) {
      const key = `${row.location_id}|${row.description}|${row.unit}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: row.id, // representative id (first/oldest)
          description: row.description,
          unit: row.unit,
          unit_cost: row.unit_cost,
          suggested_selling_price: row.suggested_selling_price,
          location_id: row.location_id,
          location_name: row.location_name,
          quantity: 0,
          batches: []
        });
      }
      const group = groups.get(key);
      group.quantity += parseFloat(row.quantity) || 0;
      group.batches.push({
        id: row.id,
        batch_number: row.batch_number,
        expiry_date: row.expiry_date,
        quantity: parseFloat(row.quantity) || 0,
        unit_cost: row.unit_cost,
        suggested_selling_price: row.suggested_selling_price
      });
    }

    // Limit to 10 products for the dropdown
    const grouped = Array.from(groups.values()).slice(0, 10);
    res.json(grouped);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Error searching inventory' });
  }
});

module.exports = router;
