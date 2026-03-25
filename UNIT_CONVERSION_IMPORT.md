# Unit Conversion Import Feature

## Overview
The system now automatically creates unit conversion relationships when importing products with a CONTENT column. This allows you to define conversion factors directly in your Excel/CSV import file.

## How It Works

### Excel Format Example
```
BRAND | THE HEALTHSHOP PRODUCTS | UoM  | CONTENT | Ave Unit Cost | Selling Price | QTY
CH    | CHIMPEOUS MAN 10S       | BOT  |         | 70.00         | 500.00        | 5
CH    | CHIMPEOUS MAN 10S PC    | PC   | 10      | 7.00          | 50.00         | 50
```

### What Happens During Import

1. **Detection Phase**: The system scans all rows looking for:
   - Base products (no CONTENT or CONTENT = 0)
   - Converted products (CONTENT > 0)

2. **Matching Phase**: Products with the same base name are paired:
   - `CHIMPEOUS MAN 10S` (BOT) ← Base Unit
   - `CHIMPEOUS MAN 10S PC` (PC) ← Converted Unit with CONTENT = 10

3. **Conversion Creation**: Automatically creates:
   - Product: `CHIMPEOUS MAN 10S`
   - Conversion: `1 BOT = 10 PC`
   - This is stored in the `unit_conversions` table

4. **Inventory Creation**: Both items are added to inventory:
   - 5 BOT at ₱70.00 cost / ₱500.00 selling price
   - 50 PC at ₱7.00 cost / ₱50.00 selling price

## Key Features

### Automatic Linking
- Products with the same base name but different units are automatically linked
- The CONTENT value defines the conversion factor
- No manual setup required after import

### Immutable Content
- Once a conversion is created, the CONTENT value becomes the conversion factor
- Future imports will update the conversion if the CONTENT value changes
- The relationship is permanent until manually deleted

### Multiple Conversions
You can have multiple conversion levels:
```
BRAND | PRODUCT           | UoM  | CONTENT
CH    | PRODUCT A         | BOX  |         (base)
CH    | PRODUCT A PACK    | PACK | 12      (1 BOX = 12 PACK)
CH    | PRODUCT A PC      | PC   | 10      (1 PACK = 10 PC)
```

## Rules and Validation

### Required Fields
- BRAND: Required for all products
- Description: Required for all products
- Unit (UoM): Required for all products
- CONTENT: Optional, but required for converted units

### Content Rules
1. Base unit products should have CONTENT empty or 0
2. Converted unit products must have CONTENT > 0
3. CONTENT represents "how many converted units are in one base unit"

### Naming Convention
- Base product: `PRODUCT NAME`
- Converted product: `PRODUCT NAME [UNIT]` (e.g., `PRODUCT NAME PC`)
- The system matches by removing the unit suffix

## Benefits

### For Inventory Management
- Track products in multiple units simultaneously
- Automatic conversion calculations
- Consistent pricing across units

### For Sales
- Sell in any unit (BOT or PC)
- System automatically converts quantities
- Accurate inventory deduction

### For Transfers
- Transfer in any unit
- Automatic conversion to base unit
- Accurate tracking across locations

## Example Scenarios

### Scenario 1: Bottled Medicine
```
Import:
- MEDICINE A (BOT) - CONTENT: empty
- MEDICINE A PC (PC) - CONTENT: 10

Result:
- 1 BOT = 10 PC
- Can sell 1 BOT or 10 PC (same thing)
- Inventory tracks both units
```

### Scenario 2: Boxed Products
```
Import:
- PRODUCT B (BOX) - CONTENT: empty
- PRODUCT B PACK (PACK) - CONTENT: 24

Result:
- 1 BOX = 24 PACK
- Can transfer 1 BOX or 24 PACK
- System converts automatically
```

### Scenario 3: Multi-Level Conversion
```
Import:
- PRODUCT C (CASE) - CONTENT: empty
- PRODUCT C BOX (BOX) - CONTENT: 6
- PRODUCT C PC (PC) - CONTENT: 12

Result:
- 1 CASE = 6 BOX
- 1 BOX = 12 PC
- Therefore: 1 CASE = 72 PC (calculated)
```

## Viewing Conversions

After import, you can view all conversions in:
1. Admin Panel → Unit Conversions
2. API endpoint: `GET /api/unit-conversions`
3. Product-specific: `GET /api/unit-conversions/product/:description`

## Troubleshooting

### Conversion Not Created
- Check that base product has no CONTENT or CONTENT = 0
- Check that converted product has CONTENT > 0
- Verify product names match exactly (case-insensitive)

### Wrong Conversion Factor
- Update the CONTENT value in your Excel file
- Re-import (it will update the existing conversion)
- Or manually edit in Unit Conversions admin panel

### Duplicate Products
- If products already exist, the system will:
  - Update quantities (if selected)
  - Update prices (if selected)
  - Update or create conversion relationships

## Technical Details

### Database Table
```sql
unit_conversions (
  id SERIAL PRIMARY KEY,
  product_description TEXT NOT NULL,
  base_unit VARCHAR(50) NOT NULL,
  converted_unit VARCHAR(50) NOT NULL,
  conversion_factor DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(product_description, base_unit, converted_unit)
)
```

### Import Process
1. Parse Excel/CSV file
2. Extract CONTENT column values
3. Identify base and converted products
4. Create/update unit_conversions entries
5. Import inventory items
6. Log conversion creation in console

### API Integration
The conversion system integrates with:
- `/api/import/preview` - Shows CONTENT in preview
- `/api/import/import` - Creates conversions during import
- `/api/unit-conversions` - Manages conversions
- `/api/unit-conversions/convert` - Performs conversions

## Best Practices

1. **Consistent Naming**: Use consistent product names
2. **Clear Units**: Use standard unit abbreviations (BOT, PC, PACK, BOX)
3. **Verify Content**: Double-check CONTENT values before import
4. **Test First**: Preview import before committing
5. **Document Conversions**: Keep a reference of your conversion factors

## Future Enhancements

Potential improvements:
- Automatic multi-level conversion calculations
- Conversion history tracking
- Bulk conversion updates
- Conversion validation warnings
- Visual conversion tree display
