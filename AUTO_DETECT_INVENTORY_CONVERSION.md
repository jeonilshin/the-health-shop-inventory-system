# Auto-Detect Unit Conversion in Inventory Convert Units

## Overview
The Inventory page's "Convert Units" modal now automatically detects and applies unit conversions from the database when you select a "From Item" (BOX/BOT).

## How It Works

### 1. Select From Item
When you select a BOX or BOT item in the "From Item" field:
- System checks the `unit_conversions` table for existing conversion
- Searches for matching product description

### 2. Auto-Detection
If a conversion exists:
- ✅ Automatically finds and selects the matching PC item in "To Item" field
- ✅ Auto-fills "Units per Box/Bottle" with the conversion factor
- ✅ Locks the conversion factor field (read-only)
- ✅ Shows green background on the locked field
- ✅ Displays lock icon (🔒) in the field
- ✅ Shows toast notification with detected conversion
- ✅ Shows success message: "✓ Auto-detected from unit conversion database"

### 3. Manual Entry
If no conversion exists:
- Fields remain empty and editable
- You can manually select the "To Item" and enter conversion factor

## Example Flow

### Scenario: Converting CHIMPEOUS MAN 10S
1. Open Convert Units modal
2. Select "From Item": **CHIMPEOUS MAN 10S BOT**
3. System auto-detects:
   - To Item: **CHIMPEOUS MAN 10S PC**
   - Units per Box/Bottle: **10** (locked)
4. Enter "Boxes/Bottles to Convert": **5**
5. Result: 5 × 10 = 50 pieces will be added
6. Click "Convert Units"

## Visual Indicators

### Auto-Detected Conversion
- **Green background** on "Units per Box/Bottle" field
- **Lock icon** (🔒) displayed in the field
- **Success message**: "✓ Auto-detected from unit conversion database"
- **Toast notification**: "Auto-detected: 1 BOT = 10 PC"

### Manual Entry
- **White background** on "Units per Box/Bottle" field
- **No lock icon**
- **Help text**: "How many pieces are in one box/bottle?"

## Benefits

1. **Consistency**: Uses the same conversion factor established during import
2. **Speed**: No need to remember or look up conversion factors
3. **Accuracy**: Prevents manual entry errors
4. **Safety**: Locked field prevents accidental changes to established conversions

## Technical Details

### API Endpoint Used
```
GET /unit-conversions/product/:description
```

### Auto-Detection Logic
1. When "From Item" is selected, makes API call with product description
2. If conversion found, searches inventory for matching PC item
3. Auto-populates fields and sets `isConversionAutoDetected` flag to `true`
4. Field becomes read-only when flag is `true`

### State Management
- `conversionData`: Stores form data (fromItemId, toItemId, unitsPerBox, etc.)
- `isConversionAutoDetected`: Boolean flag for locked state

## Related Features
- **Import with CONTENT**: Creates unit conversions during import
- **Unit Conversions Page**: Manages conversion database
- **FIFO Sales**: Uses same product matching logic

## Notes
- Auto-detection only works if conversion was previously created (via import or Unit Conversions page)
- Conversion factor is locked to maintain consistency across the system
- You can still manually enter conversions for new products
