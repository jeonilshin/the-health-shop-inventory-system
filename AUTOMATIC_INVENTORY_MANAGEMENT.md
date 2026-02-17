# Automatic Inventory Management System

## Overview

The system now automatically updates inventory when you transfer, deliver, or sell items. You can only use existing inventory items, ensuring accurate stock tracking across all locations.

---

## How It Works

### 1. Transfers (Branch to Branch / Warehouse to Branch)

**Before:**
- Manually enter item details
- No inventory validation
- No automatic stock updates

**Now:**
- Select source location
- Choose from existing inventory items (dropdown)
- System shows available quantity
- Enter quantity to transfer (validated against available stock)
- On submit:
  - Automatically deducts from source location
  - Automatically adds to destination location
  - Records transfer history

**Example:**
```
Source: Warehouse A has 100 units of "Vitamin C"
Action: Transfer 50 units to Branch 1
Result:
  - Warehouse A: 100 - 50 = 50 units
  - Branch 1: 0 + 50 = 50 units (or adds to existing)
  - Transfer recorded in history
```

---

### 2. Sales (Branch Sales)

**Before:**
- Manually enter item details
- No inventory validation
- No automatic stock updates

**Now:**
- Select branch location
- Choose from existing inventory items
- System shows available quantity
- Enter quantity sold (validated against available stock)
- On submit:
  - Automatically deducts from branch inventory
  - Records sale with profit calculation
  - Updates sales history

**Example:**
```
Branch 1 has 50 units of "Vitamin C" @ ₱100 cost
Action: Sell 10 units @ ₱150 each
Result:
  - Branch 1: 50 - 10 = 40 units
  - Sale recorded: ₱1,500 revenue, ₱500 profit
  - Customer info saved
```

---

### 3. Deliveries (Warehouse to Branch)

**Before:**
- Manually enter item details
- No inventory validation
- No automatic stock updates

**Now:**
- Select source and destination locations
- Choose from existing inventory items
- System validates all items exist with sufficient quantity
- Create delivery with status: Pending
- When status changes to "Delivered":
  - Automatically deducts from source location
  - Automatically adds to destination location
  - Records delivery completion

**Example:**
```
Warehouse A has:
  - 100 units of "Vitamin C"
  - 200 units of "Vitamin D"

Action: Create delivery to Branch 2
  - 30 units of Vitamin C
  - 50 units of Vitamin D
  - Status: Pending

When marked as "Delivered":
Result:
  - Warehouse A: Vitamin C (100 - 30 = 70), Vitamin D (200 - 50 = 150)
  - Branch 2: Vitamin C (+30), Vitamin D (+50)
  - Delivery marked complete
```

---

## Key Features

### 1. Inventory Validation

**Stock Availability:**
- System checks if item exists in source location
- Validates sufficient quantity available
- Prevents negative inventory
- Shows real-time available quantity

**Error Prevention:**
- Cannot transfer more than available
- Cannot sell more than in stock
- Cannot deliver items that don't exist
- Clear error messages with available quantities

### 2. Automatic Updates

**Real-time Inventory:**
- Instant deduction from source
- Instant addition to destination
- No manual inventory adjustments needed
- Accurate stock levels always

**Transaction Recording:**
- All movements tracked
- Complete audit trail
- Who, what, when, where recorded
- Easy to trace inventory history

### 3. User-Friendly Interface

**Dropdown Selection:**
- See all available items
- Shows current quantity
- Shows unit cost
- Easy to select

**Visual Feedback:**
- Selected item details displayed
- Available quantity highlighted
- Validation messages
- Success/error notifications

**Smart Forms:**
- Auto-populate item details
- Quantity validation
- Max quantity limits
- Helpful placeholders

---

## Database Changes

### Updated Tables

**delivery_items:**
- Added `unit_cost` column
- Stores cost from source inventory
- Used for inventory valuation

### Transaction Safety

**Database Transactions:**
- All operations use BEGIN/COMMIT
- Rollback on any error
- Ensures data consistency
- No partial updates

**Validation Checks:**
- Item existence
- Quantity availability
- Location access
- User permissions

---

## Benefits

### 1. Accuracy
- No manual data entry errors
- Real-time stock levels
- Automatic calculations
- Consistent data

### 2. Efficiency
- Faster operations
- Less typing
- Auto-fill details
- Quick selection

### 3. Control
- Cannot oversell
- Cannot over-transfer
- Inventory always accurate
- Complete audit trail

### 4. Visibility
- See available stock
- Know what can be transferred
- Track all movements
- Historical data

---

## User Workflows

### Transfer Workflow

1. Click "New Transfer"
2. Select source location (your location if not admin)
3. Select destination location
4. Choose item from dropdown (shows available quantity)
5. Enter quantity to transfer (max = available)
6. Add notes (optional)
7. Click "Complete Transfer"
8. System validates and updates inventory
9. Success message shown
10. Transfer appears in history

### Sales Workflow

1. Click "Record Sale"
2. Select branch (your branch if not admin)
3. Choose item from dropdown (shows available quantity)
4. Enter quantity sold (max = available)
5. Enter selling price
6. Add customer name (optional)
7. Add notes (optional)
8. Click "Record Sale"
9. System validates and updates inventory
10. Success message shown
11. Sale appears in history

### Delivery Workflow

1. Click "Create Delivery"
2. Select source location (warehouse)
3. Select destination location (branch)
4. Set delivery date
5. For each item:
   - Choose from dropdown (shows available quantity)
   - Enter quantity (validated)
6. Add notes (optional)
7. Click "Create Delivery"
8. Delivery created with status "Pending"
9. When ready, change status to "In Transit"
10. When received, change status to "Delivered"
11. System automatically updates inventory
12. Delivery marked complete

---

## Error Messages

### Common Errors

**"Item not found in source location"**
- Item doesn't exist in inventory
- Check location selection
- Add item to inventory first

**"Insufficient quantity"**
- Trying to transfer/sell more than available
- Shows available quantity
- Reduce transfer/sale quantity

**"Cannot delete delivered delivery"**
- Delivery already completed
- Inventory already updated
- Cannot be deleted

**"Access denied to source location"**
- User doesn't have permission
- Check user role and assigned location
- Contact admin

---

## Migration Steps

### For Existing System

1. **Run Database Update:**
   ```sql
   -- Run this in Neon SQL Editor
   -- File: server/database/update_deliveries.sql
   
   ALTER TABLE delivery_items 
   ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);
   ```

2. **Deploy Backend:**
   - Push updated routes to Railway
   - Automatic deployment

3. **Deploy Frontend:**
   - Push updated components to Vercel
   - Automatic deployment

4. **Test:**
   - Create test transfer
   - Record test sale
   - Create test delivery
   - Verify inventory updates

---

## Best Practices

### 1. Regular Stock Checks
- Verify physical inventory matches system
- Adjust if discrepancies found
- Document adjustments

### 2. Proper Workflow
- Always use system for movements
- Don't manually adjust inventory
- Record all transactions
- Add notes for clarity

### 3. Training
- Train staff on new workflow
- Emphasize selecting from dropdown
- Explain validation messages
- Practice with test data

### 4. Monitoring
- Review transfer history regularly
- Check for unusual patterns
- Monitor low stock alerts
- Track delivery status

---

## Technical Details

### API Endpoints

**Transfers:**
- POST /api/transfers - Create transfer (auto-updates inventory)
- GET /api/transfers - Get transfer history

**Sales:**
- POST /api/sales - Record sale (auto-updates inventory)
- GET /api/sales - Get sales history

**Deliveries:**
- POST /api/deliveries - Create delivery (validates inventory)
- PUT /api/deliveries/:id - Update status (auto-updates when delivered)
- GET /api/deliveries - Get all deliveries
- DELETE /api/deliveries/:id - Delete (only if not delivered)

### Database Transactions

All operations use PostgreSQL transactions:
```javascript
await client.query('BEGIN');
// Validate
// Deduct from source
// Add to destination
// Record transaction
await client.query('COMMIT');
// On error: ROLLBACK
```

---

## Future Enhancements

### Planned Features

1. **Batch Transfers**
   - Transfer multiple items at once
   - Bulk selection
   - Faster workflow

2. **Transfer Requests**
   - Branches request from warehouse
   - Approval workflow
   - Automated fulfillment

3. **Stock Alerts**
   - Low stock notifications
   - Reorder suggestions
   - Email alerts

4. **Barcode Scanning**
   - Scan to select items
   - Faster data entry
   - Mobile support

5. **Inventory Adjustments**
   - Physical count adjustments
   - Damage/loss recording
   - Audit trail

---

## Support

### Need Help?

**Common Issues:**
1. Item not showing in dropdown
   - Check if item exists in source location
   - Verify location selection
   - Refresh inventory

2. Cannot complete transfer
   - Check available quantity
   - Verify destination location
   - Check user permissions

3. Delivery not updating inventory
   - Ensure status is "Delivered"
   - Check for error messages
   - Verify items exist in source

**Contact:**
- Check system logs
- Review error messages
- Contact system administrator

---

## Summary

The automatic inventory management system ensures:
- Accurate stock levels
- No overselling or over-transferring
- Complete audit trail
- Easy to use interface
- Real-time updates
- Error prevention

All inventory movements are now tracked and validated automatically!
