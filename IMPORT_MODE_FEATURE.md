# Import Mode Feature - Filter Existing vs New Items

## Overview

Added an "Import Mode" selector that allows users to choose whether to import all items, only existing items, or only new items. This provides more control over the import process.

## Feature Description

### Import Modes

**1. Import All Items (Both) - Default**
- Imports everything from the file
- Updates existing items
- Creates new items
- Default behavior

**2. Update Existing Items Only**
- Only processes items that already exist in inventory
- Skips new items completely
- Perfect for restocking/updating prices

**3. Import New Items Only**
- Only processes items that don't exist yet
- Skips existing items completely
- Perfect for adding new products

## User Interface

### Import Mode Selector

Located below the location selection, before file upload:

```
┌────────────────────────────────────────────────────┐
│ Import Mode                                        │
├────────────────────────────────────────────────────┤
│ [📦 Import All Items (Existing + New)        ▼]   │
│ • Import all items from the file (default)        │
│                                                    │
│ 📊 Will import: 50 items (10 existing + 40 new)   │
└────────────────────────────────────────────────────┘
```

### Mode Options

**Option 1: Import All Items (Both)**
```
📦 Import All Items (Existing + New)
• Import all items from the file (default)
📊 Will import: 50 items (10 existing + 40 new)
```

**Option 2: Update Existing Items Only**
```
🔄 Update Existing Items Only
• Only update items that already exist in inventory (skip new items)
🔄 Will update: 10 existing items
```

**Option 3: Import New Items Only**
```
✨ Import New Items Only
• Only import items that don't exist yet (skip existing items)
✨ Will import: 40 new items
```

## How It Works

### Logic Flow

```
1. User uploads Excel file
2. System previews and detects:
   - Total items: 50
   - Existing items (duplicates): 10
   - New items: 40
3. User selects import mode
4. System filters data based on mode:
   - Both: All 50 items
   - Existing: Only 10 existing items
   - New: Only 40 new items
5. Import proceeds with filtered data
```

### Filtering Logic

**Existing Items Filter:**
```javascript
validData = validData.filter(item => 
  duplicateDetails.some(d => 
    d.description === item.description && 
    d.unit === item.unit
  )
);
```

**New Items Filter:**
```javascript
validData = validData.filter(item => 
  !duplicateDetails.some(d => 
    d.description === item.description && 
    d.unit === item.unit
  )
);
```

## Use Cases

### Use Case 1: Restocking Existing Products
```
Scenario: Receiving new stock of existing products only
Mode: 🔄 Update Existing Items Only
Excel: Mix of existing and new products
Result: Only existing items are updated, new items ignored
Benefit: Prevents accidentally adding unwanted new products
```

### Use Case 2: Adding New Product Line
```
Scenario: Adding completely new products to inventory
Mode: ✨ Import New Items Only
Excel: Mix of existing and new products
Result: Only new items are imported, existing items unchanged
Benefit: Prevents accidentally updating existing product prices
```

### Use Case 3: Full Inventory Update
```
Scenario: Complete inventory refresh
Mode: 📦 Import All Items (Both)
Excel: Complete product list
Result: All items processed (existing updated, new created)
Benefit: One-stop import for everything
```

### Use Case 4: Price Update for Existing Items
```
Scenario: Updating prices for current inventory
Mode: 🔄 Update Existing Items Only
Excel: Product list with new prices
Result: Only existing items get price updates
Benefit: New items in file won't be accidentally created
```

## Examples

### Example 1: Mixed Import with "Both" Mode

**Excel File:**
```
PRODUCT A | BOT | 10 | 100 | 750  (exists in DB)
PRODUCT B | PC  | 50 | 5   | 35   (exists in DB)
PRODUCT C | BOX | 20 | 200 | 1500 (new)
PRODUCT D | PACK| 100| 10  | 75   (new)
```

**Mode: Both**
```
Result:
✓ PRODUCT A: Updated (qty +10)
✓ PRODUCT B: Updated (qty +50)
✓ PRODUCT C: Created (new)
✓ PRODUCT D: Created (new)

Summary: 2 updated, 2 imported
```

### Example 2: Same File with "Existing Only" Mode

**Mode: Existing Only**
```
Result:
✓ PRODUCT A: Updated (qty +10)
✓ PRODUCT B: Updated (qty +50)
⊘ PRODUCT C: Skipped (new item)
⊘ PRODUCT D: Skipped (new item)

Summary: 2 updated, 0 imported, 2 skipped
```

### Example 3: Same File with "New Only" Mode

**Mode: New Only**
```
Result:
⊘ PRODUCT A: Skipped (existing)
⊘ PRODUCT B: Skipped (existing)
✓ PRODUCT C: Created (new)
✓ PRODUCT D: Created (new)

Summary: 0 updated, 2 imported, 2 skipped
```

## Visual Indicators

### Mode Selection Styling

**Both Mode (Default):**
- Background: White
- Border: Normal
- Color: Warning (orange)
- Icon: 📦

**Existing Only Mode:**
- Background: Light blue
- Border: Blue (2px)
- Color: Primary (blue)
- Icon: 🔄

**New Only Mode:**
- Background: Light green
- Border: Green (2px)
- Color: Success (green)
- Icon: ✨

### Summary Badge

Shows real-time count based on selected mode:

```
Mode: Both
📊 Will import: 50 items (10 existing + 40 new)

Mode: Existing Only
🔄 Will update: 10 existing items

Mode: New Only
✨ Will import: 40 new items
```

## Console Logging

The system logs which mode is being used:

**Both Mode:**
```
📊 Import mode: BOTH - Importing 50 items (existing + new)
```

**Existing Only:**
```
📊 Import mode: EXISTING ONLY - Filtered to 10 existing items
```

**New Only:**
```
📊 Import mode: NEW ONLY - Filtered to 40 new items
```

## Benefits

### For Users
✅ More control over import process
✅ Prevents accidental imports
✅ Clearer intent when importing
✅ Safer bulk operations

### For Workflows
✅ Dedicated restocking mode
✅ Dedicated new product mode
✅ Flexible import options
✅ Reduces import errors

### For Data Integrity
✅ Prevents unwanted new items
✅ Prevents unwanted updates
✅ More predictable results
✅ Better audit trail

## Technical Implementation

### State Management
```javascript
const [importMode, setImportMode] = useState('both');
```

### Filtering Logic
```javascript
if (importMode === 'existing') {
  validData = validData.filter(item => 
    duplicateDetails.some(d => 
      d.description === item.description && 
      d.unit === item.unit
    )
  );
} else if (importMode === 'new') {
  validData = validData.filter(item => 
    !duplicateDetails.some(d => 
      d.description === item.description && 
      d.unit === item.unit
    )
  );
}
```

### UI Component
```jsx
<select
  value={importMode}
  onChange={(e) => setImportMode(e.target.value)}
  className="form-control"
>
  <option value="both">📦 Import All Items (Existing + New)</option>
  <option value="existing">🔄 Update Existing Items Only</option>
  <option value="new">✨ Import New Items Only</option>
</select>
```

## Best Practices

### When to Use Each Mode

**Use "Both" when:**
- Doing a complete inventory import
- Adding new products and restocking existing ones
- Initial setup or full refresh

**Use "Existing Only" when:**
- Restocking current inventory
- Updating prices for existing products
- Receiving shipment of known products
- Want to avoid accidentally adding new items

**Use "New Only" when:**
- Adding a new product line
- Expanding inventory with new items
- Want to avoid touching existing inventory
- Testing new product imports

## Migration Notes

### Backward Compatibility
- Default mode is "both" (existing behavior)
- No changes to existing import functionality
- New feature is additive, not breaking

### No Database Changes
- Pure frontend filtering
- No backend changes required
- Works with existing import API

## Summary

The Import Mode feature provides users with three options:
1. **Both** - Import everything (default)
2. **Existing Only** - Update existing items only
3. **New Only** - Import new items only

This gives users more control and prevents accidental imports, making the import process safer and more flexible!

**Key Achievement:** Flexible import modes for different workflows! 🎯
