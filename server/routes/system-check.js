const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// System check endpoint (admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const checks = {
      database: 'connected',
      tables: {},
      columns: {},
      status: 'ok',
      errors: []
    };

    // Check notifications table
    try {
      const notifCheck = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications'"
      );
      checks.tables.notifications = notifCheck.rows.length > 0 ? 'exists' : 'missing';
      checks.columns.notifications = notifCheck.rows.map(r => r.column_name);
    } catch (error) {
      checks.tables.notifications = 'error';
      checks.errors.push('Notifications table: ' + error.message);
    }

    // Check deliveries columns
    try {
      const delivCheck = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'deliveries'"
      );
      checks.columns.deliveries = delivCheck.rows.map(r => r.column_name);
      
      const requiredColumns = ['transfer_id', 'admin_confirmed', 'admin_confirmed_by', 'admin_confirmed_at'];
      const missingColumns = requiredColumns.filter(col => !checks.columns.deliveries.includes(col));
      
      if (missingColumns.length > 0) {
        checks.status = 'incomplete';
        checks.errors.push(`Deliveries table missing columns: ${missingColumns.join(', ')}`);
      }
    } catch (error) {
      checks.tables.deliveries = 'error';
      checks.errors.push('Deliveries table: ' + error.message);
    }

    // Check delivery_items unit_cost column
    try {
      const itemCheck = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'delivery_items' AND column_name = 'unit_cost'"
      );
      checks.columns.delivery_items_unit_cost = itemCheck.rows.length > 0 ? 'exists' : 'missing';
      
      if (itemCheck.rows.length === 0) {
        checks.status = 'incomplete';
        checks.errors.push('delivery_items table missing unit_cost column');
      }
    } catch (error) {
      checks.errors.push('delivery_items check: ' + error.message);
    }

    // Check deliveries status constraint
    try {
      const constraintCheck = await pool.query(
        "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'deliveries' AND constraint_type = 'CHECK'"
      );
      checks.constraints = constraintCheck.rows.map(r => r.constraint_name);
    } catch (error) {
      checks.errors.push('Constraint check: ' + error.message);
    }

    if (checks.errors.length > 0) {
      checks.status = 'error';
    }

    res.json(checks);
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      hint: 'Run database migrations from SETUP_DELIVERY_SYSTEM.md'
    });
  }
});

module.exports = router;
