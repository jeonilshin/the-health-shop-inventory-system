# Unit Conversion Feature

## Overview
This feature allows selling products in different units than they were purchased. For example:
- Buy 1 box of paracetamol (containing 50 packs)
- Sell 30 packs to a retailer
- System tracks: 20 packs remaining (or 0.4 boxes)

## How It Works

### 1. Define Unit Conversions
Admins can define how units relate to each other:
- **Product**: Paracetamol
- **Base Unit**: box
- **Converted Unit**: pack
- **Conversion Factor**: 50 (meaning 1 box = 50 packs)

### 2. Multi-Level Conversions
You can chain conversions:
- 1 box = 50 packs
- 1 pack = 10 pieces
- Therefore: 1 box = 500 pieces

### 3. Selling in Different Units
When recording a sale:
1. Select the product
2. Choose the unit to sell in (box, pack, or piece)
3. Enter quantity
4. System automatically:
   - Converts to base unit for inventory tracking
   - Deducts correct amount from inventory
   - Records both original and converted values

## Database Schema

### unit_conversions Table
```sql
CREATE TABLE unit_conversions (
  id SERIAL PRIMARY KEY,
  product_description TEXT NOT NULL,
  base_unit VARCHAR(50) NOT NULL,
  converted_unit VARCHAR(50) NOT NULL,
  conversion_factor DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_description, base_unit, converted_unit)
);
```

### Enhanced Tables
- **inventory**: Added `base_unit` and `base_quantity` columns
- **sales**: Added `conversion_used`, `original_unit`, `original_quantity` columns
- **transfers**: Added `conversion_used`, `original_unit`, `original_quantity` columns

## API Endpoints

### Unit Conversions Management
- `GET /api/unit-conversions` - Get all conversions
- `GET /api/unit-conversions/product/:description` - Get conversions for a product
- `POST /api/unit-conversions` - Create conversion (admin only)
- `PUT /api/unit-conversions/:id` - Update conversion factor (admin only)
- `DELETE /api/unit-conversions/:id` - Delete conversion (admin only)
- `POST /api/unit-conversions/convert` - Convert between units (helper)

### Enhanced Sales Endpoint
The sales endpoint now accepts:
```json
{
  "location_id": 1,
  "description": "Paracetamol",
  "unit": "pack",  // Can be different from inventory unit
  "quantity": 30,
  "selling_price": 5.00,
  "customer_name": "Retailer ABC",
  "notes": "Wholesale order"
}
```

## UI Components

### 1. Unit Conversions Page (Admin Only)
- View all configured conversions grouped by product
- Add new conversions
- Edit conversion factors
- Delete conversions
- Info panel explaining how conversions work

### 2. Enhanced Sales Form
- Dropdown to select unit (shows available units for the product)
- Real-time conversion preview
- Shows how much will be deducted from inventory
- Validates sufficient quantity in base unit

### 3. Enhanced Inventory Display
- Shows quantity in both base and converted units
- Example: "2.5 boxes (125 packs)"

## Example Scenarios

### Scenario 1: Simple Conversion
**Setup:**
- Product: Paracetamol
- Inventory: 5 boxes (1 box = 50 packs)
- Total available: 250 packs

**Sale:**
- Customer wants 30 packs
- System converts: 30 packs = 0.6 boxes
- Deducts 0.6 boxes from inventory
- Remaining: 4.4 boxes (220 packs)

### Scenario 2: Multi-Level Conversion
**Setup:**
- Product: Vitamin C
- Conversions:
  - 1 box = 24 bottles
  - 1 bottle = 60 tablets
- Inventory: 10 boxes

**Sale:**
- Customer wants 500 tablets
- System converts:
  - 500 tablets = 8.33 bottles
  - 8.33 bottles = 0.347 boxes
- Deducts 0.347 boxes
- Remaining: 9.653 boxes

### Scenario 3: Mixed Unit Sales
**Day's Sales:**
1. Sell 2 boxes (wholesale)
2. Sell 30 packs (retail)
3. Sell 150 pieces (individual)

**System tracks:**
- All sales in their original units
- Converts all to base unit for inventory
- Maintains accurate stock levels

## Benefits

1. **Flexibility**: Sell in any unit without manual calculations
2. **Accuracy**: Automatic conversion prevents errors
3. **Tracking**: Complete audit trail of sales in original units
4. **Reporting**: Analyze sales by unit type
5. **Inventory**: Always accurate regardless of sale unit

## Setup Instructions

### 1. Run Database Migration
```bash
psql $DATABASE_URL -f server/database/unit_conversions.sql
```

### 2. Configure Conversions
1. Login as admin
2. Navigate to Admin → Unit Conversions
3. Add conversions for your products

### 3. Start Selling
- Sales form now shows unit dropdown
- Select appropriate unit for each sale
- System handles the rest automatically

## Future Enhancements

1. **Bulk Conversion Import**: CSV upload for multiple conversions
2. **Conversion Templates**: Pre-defined conversion sets for common products
3. **Smart Suggestions**: Auto-suggest conversions based on product type
4. **Conversion History**: Track when conversion factors change
5. **Multi-Currency**: Extend to handle currency conversions
6. **Barcode Integration**: Scan products in any unit
7. **Reorder Levels**: Set min/max in preferred units

## Technical Notes

### Conversion Algorithm
```javascript
// Forward conversion (base to converted)
converted_quantity = base_quantity * conversion_factor

// Reverse conversion (converted to base)
base_quantity = converted_quantity / conversion_factor
```

### Precision
- All quantities stored as DECIMAL(10, 2)
- Supports up to 2 decimal places
- Prevents floating-point errors

### Performance
- Indexed on product_description for fast lookups
- Cached conversions in memory (future enhancement)
- Minimal overhead on sales transactions

## Audit Logging
All conversion operations are logged:
- `UNIT_CONVERSION_CREATE`
- `UNIT_CONVERSION_UPDATE`
- `UNIT_CONVERSION_DELETE`
- Sales with conversions marked with `conversion_used = true`

## Support
For questions or issues with unit conversions:
1. Check conversion is configured correctly
2. Verify conversion factor is positive
3. Ensure product description matches exactly
4. Check audit log for conversion operations
