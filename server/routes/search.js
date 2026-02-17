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
          l.name as location_name,
          l.id as location_id
        FROM inventory i
        JOIN locations l ON i.location_id = l.id
        WHERE i.location_id = $1 
          AND (i.description ILIKE $2 OR i.batch_number ILIKE $2)
          AND i.quantity > 0
        ORDER BY i.description
        LIMIT 10
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
          l.name as location_name,
          l.id as location_id
        FROM inventory i
        JOIN locations l ON i.location_id = l.id
        WHERE (i.description ILIKE $1 OR i.batch_number ILIKE $1)
          AND i.quantity > 0
        ORDER BY i.description
        LIMIT 10
      `;
      params = [searchTerm];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Error searching inventory' });
  }
});

module.exports = router;
