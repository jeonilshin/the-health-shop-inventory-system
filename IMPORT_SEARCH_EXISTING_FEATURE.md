# Import: Search for Existing Items Feature

## Overview
When importing data, new items can now be matched to existing inventory items using a search function. This is useful for handling typos, spelling variations, or different naming conventions.

## Problem Solved
Sometimes import files contain product names that are slightly different from existing inventory:
- Typos: "CHIMPEOUS MAN 10S" vs "CHIMPEUS MAN 10S"
- Spelling variations: "VITAMIN C 500MG" vs "VIT C 500MG"
- Different formats: "PARACETAMOL 500" vs "PARACETAMOL 500MG"

Without this feature, these would be imported as new items, creating duplicates.

## How It Works

### Step 1: Import and Preview
1. Upload your Excel/CSV file
2. Click "Preview Import"
3. System identifies new items (items not in inventory)

### Step 2: Review New Items
1. Expand the "New Items" section
2. See all items that will be created as new
3. Each item shows:
   - Batch number
   - Description
   - Unit
   - Quantity
   - Unit cost

### Step 3: Search for Existing Items
1. Click the **Edit icon (✏️)** next to any new item
2. Search box appears with autocomplete
3. Type to search existing inventory
4. Select the matching item from dropdown

### Step 4: Confirm Mapping
- Original name shows with strikethrough
- Matched name shows in blue with arrow (→)
- Blue border indicates item is mapped
- Click **X** to remove mapping if needed

### Step 5: Import
- Mapped items will update existing inventory
- Unmapped items will be created as new
- Console shows mapping details

## Visual Flow

### Before Mapping
```
┌─────────────────────────────────────────────────┐
│ 🆕 New Items (3)                    [▼ Show]   │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ ✏️ │
│ │ THS-001  CHIMPEUS MAN 10S  BOT  Qty: 50│    │
│ └─────────────────────────────────────────┘    │
│ ┌─────────────────────────────────────────┐ ✏️ │
│ │ THS-002  VIT C 500  PC  Qty: 100       │    │
│ └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### During Search
```
┌─────────────────────────────────────────────────┐
│ 🔍 Search for existing item:                   │
│ ┌─────────────────────────────────────────────┐│
│ │ CHIMPEOUS                                   ││
│ └─────────────────────────────────────────────┘│
│                                                 │
│ Results:                                        │
│ ▸ CHIMPEOUS MAN 10S - BOT                     │ ← Click
│ ▸ CHIMPEOUS WOMAN 10S - BOT                   │
│                                                 │
│ [Cancel]                                        │
└─────────────────────────────────────────────────┘
```

### After Mapping
```
┌─────────────────────────────────────────────────┐
│ 🆕 New Items (3)                    [▼ Show]   │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ ✕ │ ← Blue border
│ │ THS-001                                 │    │
│ │ CHIMPEUS MAN 10S (crossed out)         │    │
│ │ → CHIMPEOUS MAN 10S  BOT  Qty: 50      │    │
│ └─────────────────────────────────────────┘    │
│ ┌─────────────────────────────────────────┐ ✏️ │
│ │ THS-002  VIT C 500  PC  Qty: 100       │    │
│ └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## UI Elements

### New Item (Unmapped)
- **Green background** and border
- **Green badge** for batch number
- **Edit icon (✏️)** on the right
- Click edit to search

### Mapped Item
- **Blue background** and border
- **Blue badge** for batch number
- **Original name** with strikethrough
- **Arrow (→)** pointing to matched name
- **Matched name** in blue
- **X icon** to remove mapping

### Search Mode
- **Search box** with autocomplete
- **Dropdown** shows matching items
- **Cancel button** to exit search

## Example Scenarios

### Scenario 1: Typo in Import File
```
Import File: "CHIMPEUS MAN 10S" (typo)
Inventory:   "CHIMPEOUS MAN 10S" (correct)

Action:
1. Click ✏️ next to "CHIMPEUS MAN 10S"
2. Search for "CHIMPEOUS"
3. Select "CHIMPEOUS MAN 10S"
4. Import

Result:
✓ Quantity added to existing "CHIMPEOUS MAN 10S"
✗ No duplicate created
```

### Scenario 2: Different Naming Convention
```
Import File: "VIT C 500"
Inventory:   "VITAMIN C 500MG"

Action:
1. Click ✏️ next to "VIT C 500"
2. Search for "VITAMIN C"
3. Select "VITAMIN C 500MG"
4. Import

Result:
✓ Quantity added to existing "VITAMIN C 500MG"
✗ No duplicate created
```

### Scenario 3: Genuinely New Item
```
Import File: "NEW PRODUCT ABC"
Inventory:   (doesn't exist)

Action:
1. Don't map (leave as is)
2. Import

Result:
✓ New item "NEW PRODUCT ABC" created
```

## Benefits

| Benefit | Description |
|---------|-------------|
| 🎯 Accuracy | Prevents duplicate items from typos |
| ⚡ Speed | Quick search with autocomplete |
| 🔍 Flexibility | Search by partial name |
| 🛡️ Safety | Preview before import |
| 📊 Clarity | Visual indicators for mapped items |

## Technical Details

### State Management
```javascript
const [editingNewItemIndex, setEditingNewItemIndex] = useState(null);
const [newItemSearchText, setNewItemSearchText] = useState('');
const [existingInventory, setExistingInventory] = useState([]);
const [newItemMappings, setNewItemMappings] = useState({});
```

### Mapping Structure
```javascript
newItemMappings = {
  0: { description: "CHIMPEOUS MAN 10S", unit: "BOT" },
  2: { description: "VITAMIN C 500MG", unit: "PC" }
}
```

### Import Processing
1. Apply mappings to validData
2. Replace description and unit with mapped values
3. Store original values in `_originalDescription` and `_originalUnit`
4. Console logs show mapping details
5. Import proceeds with mapped data

## Console Output

### During Import
```
🔄 Mapping: "CHIMPEUS MAN 10S" (BOT) → "CHIMPEOUS MAN 10S" (BOT)
🔄 Mapping: "VIT C 500" (PC) → "VITAMIN C 500MG" (PC)
📊 Import mode: BOTH - Importing 10 items (existing + new)
```

## Related Features

1. **Import Mode** - Filter existing/new items
2. **Duplicate Detection** - Identifies existing items
3. **CDR Import** - Similar search logic for transfers

## Notes

- Mappings are applied before import mode filtering
- Mapped items become "existing" items (updates)
- Unmapped items remain "new" items (creates)
- Search uses SimpleAutocomplete component
- Inventory is fetched during preview
- Mappings are reset when modal closes
