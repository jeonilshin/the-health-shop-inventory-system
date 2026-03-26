# Auto-Detect Unit Conversion Feature

## Overview

The Unit Conversions page now automatically detects and populates conversion factors when you select a product that already has a conversion defined (from import or previous setup). The conversion factor is locked to prevent accidental changes.

## How It Works

### Before (Manual Entry)
```
1. Select product: "CHIMPEOUS MAN 10S"
2. Manually enter base unit: "BOT"
3. Manually enter converted unit: "PC"
4. Manually enter conversion factor: "10"
5. Submit
```

### After (Auto-Detection)
```
1. Select product: "CHIMPEOUS MAN 10S"
2. System auto-detects existing conversion
3. Auto-fills:
   - Base Unit: BOT
   - Converted Unit: PC
   - Conversion Factor: 10 🔒 (locked)
4. Submit (or edit if needed)
```

## User Interface

### Product Selection with Auto-Detection

**When conversion exists:**
```
┌────────────────────────────────────────────────────┐
│ Product Description *                              │
│ [Search for product...                        🔍] │
│                                                    │
│ ✓ Auto-detected: CHIMPEOUS MAN 10S                │
│ Conversion: 1 BOT = 10 PC                         │
└────────────────────────────────────────────────────┘
```

**Conversion Factor Field (Locked):**
```
┌────────────────────────────────────────────────────┐
│ Conversion Factor * (Auto-filled)                  │
│ [10                                           ] 🔒 │
│ 1 BOT = 10 PC 🔒 Locked from import               │
└────────────────────────────────────────────────────┘
```

### Visual Indicators

**Auto-Detected Product:**
- Background: Light green
- Border: Green
- Icon: ✓ checkmark
- Text: "Auto-detected"

**Locked Conversion Factor:**
- Background: Light green
- Border: Green (2px)
- Icon: 🔒 lock
- Read-only: Yes
- Cursor: not-allowed

## Flow Diagram

```
User selects product
        ↓
System checks database for existing conversion
        ↓
    ┌───────┴───────┐
    │               │
Exists          Doesn't Exist
    │               │
    ↓               ↓
Auto-fill       Manual entry
all fields      required
    │               │
    ↓               ↓
Lock factor     Allow editing
    │               │
    └───────┬───────┘
            ↓
        Submit
```

## Examples

### Example 1: Product with Existing Conversion

**Action:** Select "CHIMPEOUS MAN 10S" (BOT)

**System Response:**
```
✓ Auto-detected conversion!

Product: CHIMPEOUS MAN 10S
Base Unit: BOT (auto-filled)
Converted Unit: PC (auto-filled)
Conversion Factor: 10 🔒 (locked)

Toast: "Auto-detected conversion: 1 BOT = 10 PC"
```

**User Can:**
- ✓ View the conversion
- ✓ Submit to create/update
- ✗ Cannot change conversion factor (locked)

### Example 2: Product without Conversion

**Action:** Select "NEW PRODUCT A" (BOX)

**System Response:**
```
Selected: NEW PRODUCT A

Product: NEW PRODUCT A
Base Unit: BOX (from selection)
Converted Unit: [empty - manual entry]
Conversion Factor: [empty - manual entry]
```

**User Must:**
- Enter converted unit (e.g., "PACK")
- Enter conversion factor (e.g., "12")
- Submit to create conversion

### Example 3: Product with Multiple Conversions

**Action:** Select "VITAMIN C" (BOX)

**System Response:**
```
✓ Auto-detected conversion!

Product: VITAMIN C
Base Unit: BOX (auto-filled)
Converted Unit: PACK (auto-filled from first conversion)
Conversion Factor: 12 🔒 (locked)

Note: If multiple conversions exist, uses the first one
```

## Technical Implementation

### Auto-Detection Logic

```javascript
const handleProductSelect = async (item) => {
  // Set basic info
  setFormData({ 
    product_description: item.description,
    base_unit: item.unit,
    converted_unit: '',
    conversion_factor: ''
  });
  
  // Check for existing conversion
  try {
    const response = await api.get(
      `/unit-conversions/product/${encodeURIComponent(item.description)}`
    );
    
    if (response.data && response.data.length > 0) {
      const existingConv = response.data[0];
      
      // Auto-fill all fields
      setFormData({
        product_description: item.description,
        base_unit: existingConv.base_unit,
        converted_unit: existingConv.converted_unit,
        conversion_factor: existingConv.conversion_factor
      });
      
      // Mark as detected (for locking)
      setDetectedConversion(existingConv);
      
      // Show toast notification
      showToast(
        `Auto-detected: 1 ${existingConv.base_unit} = ${existingConv.conversion_factor} ${existingConv.converted_unit}`,
        'info'
      );
    }
  } catch (error) {
    // No conversion found - manual entry required
    setDetectedConversion(null);
  }
};
```

### Locking Mechanism

```javascript
<input
  type="number"
  value={formData.conversion_factor}
  readOnly={detectedConversion !== null}
  style={{ 
    backgroundColor: detectedConversion ? 'rgba(16, 185, 129, 0.1)' : 'white',
    border: detectedConversion ? '2px solid var(--success)' : '1px solid var(--border)',
    cursor: detectedConversion ? 'not-allowed' : 'text'
  }}
/>
```

## Benefits

### For Users
✅ No need to remember conversion factors
✅ Prevents data entry errors
✅ Faster conversion setup
✅ Visual confirmation of existing conversions

### For Data Integrity
✅ Conversion factors stay consistent
✅ Prevents accidental changes
✅ Uses values from import (CONTENT column)
✅ Maintains historical accuracy

### For Workflow
✅ Streamlined conversion creation
✅ Less manual typing
✅ Immediate feedback
✅ Reduced training needed

## Use Cases

### Use Case 1: Setting Up Conversions After Import

**Scenario:** Products imported with CONTENT column

**Steps:**
1. Go to Unit Conversions page
2. Click "Add Conversion"
3. Search for "CHIMPEOUS MAN 10S"
4. System auto-fills: 1 BOT = 10 PC (from import)
5. Click "Create Conversion"

**Result:** Conversion created with correct factor from import

### Use Case 2: Verifying Existing Conversions

**Scenario:** Want to check conversion factor

**Steps:**
1. Go to Unit Conversions page
2. Click "Add Conversion"
3. Search for product
4. View auto-detected conversion

**Result:** Can see conversion without creating duplicate

### Use Case 3: Adding New Conversion for Existing Product

**Scenario:** Product has BOT→PC, want to add BOT→PACK

**Steps:**
1. Search for product
2. System shows BOT→PC (existing)
3. Manually change converted unit to "PACK"
4. Enter new conversion factor
5. Submit

**Result:** Second conversion created for same product

## Toast Notifications

### Auto-Detection Success
```
ℹ️ Auto-detected conversion: 1 BOT = 10 PC
```

### No Conversion Found
```
(No toast - user proceeds with manual entry)
```

### Conversion Created
```
✓ Unit conversion created successfully
```

## Visual States

### State 1: No Product Selected
```
Product Description: [Search...]
Base Unit: [empty]
Converted Unit: [empty]
Conversion Factor: [empty]
```

### State 2: Product Selected (No Conversion)
```
Product Description: ✓ Selected: NEW PRODUCT
Base Unit: BOX (from selection)
Converted Unit: [empty - enter manually]
Conversion Factor: [empty - enter manually]
```

### State 3: Product Selected (Conversion Exists)
```
Product Description: ✓ Auto-detected: CHIMPEOUS MAN 10S
                     Conversion: 1 BOT = 10 PC
Base Unit: BOT (auto-filled)
Converted Unit: PC (auto-filled)
Conversion Factor: 10 🔒 (locked, green background)
```

## API Integration

### Endpoint Used
```
GET /api/unit-conversions/product/:description
```

**Response (Conversion Exists):**
```json
[
  {
    "id": 1,
    "product_description": "CHIMPEOUS MAN 10S",
    "base_unit": "BOT",
    "converted_unit": "PC",
    "conversion_factor": 10,
    "created_at": "2024-03-26T10:00:00Z"
  }
]
```

**Response (No Conversion):**
```json
[]
```

## Relationship with Import

### Import Creates Conversion
```
Excel Import:
CHIMPEOUS MAN 10S | BOT | [empty] | CONTENT: [empty]
CHIMPEOUS MAN 10S | PC  | 50      | CONTENT: 10

Result:
✓ Conversion created: 1 BOT = 10 PC
```

### Unit Conversions Page Uses It
```
User Action:
1. Go to Unit Conversions
2. Search "CHIMPEOUS MAN 10S"

Result:
✓ Auto-detects: 1 BOT = 10 PC (from import)
✓ Factor locked at 10
```

## Best Practices

### When to Use Auto-Detection
✅ After importing products with CONTENT column
✅ When setting up conversions for existing products
✅ When verifying conversion factors
✅ When you want consistency with import data

### When Manual Entry is Needed
- New products without conversions
- Adding additional conversion levels
- Creating conversions before import
- Testing different conversion factors

## Troubleshooting

### Issue: Conversion Factor Not Auto-Filling

**Possible Causes:**
1. Product doesn't have conversion in database
2. Product name doesn't match exactly
3. Conversion was never imported

**Solution:**
- Check if product was imported with CONTENT column
- Verify product name spelling
- Create conversion manually if needed

### Issue: Wrong Conversion Factor Detected

**Cause:** Multiple conversions exist, using first one

**Solution:**
- Check existing conversions for product
- Delete incorrect conversion
- Re-import with correct CONTENT value

### Issue: Can't Edit Locked Conversion Factor

**Cause:** This is intentional - factor is locked

**Solution:**
- If you need to change it, delete existing conversion first
- Then create new one with correct factor
- Or edit existing conversion from the list

## Summary

The auto-detect feature:
- ✅ Automatically finds existing conversions
- ✅ Auto-fills all conversion fields
- ✅ Locks conversion factor to prevent changes
- ✅ Shows visual indicators (green, locked icon)
- ✅ Provides toast notifications
- ✅ Maintains data consistency with imports

**Key Achievement:** Seamless integration between import CONTENT column and Unit Conversions page! 🎯
