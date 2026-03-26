# Task 9: Import Search for Existing Items

## Status: ✅ COMPLETED

## User Request
"so sometime in import there are names that exists in inventory but wrong spelling so in new item add option so select if search in existing like cdr logic"

## Problem
When importing data, items with typos or spelling variations would be created as new items instead of updating existing inventory, leading to:
- Duplicate items with similar names
- Inventory fragmentation
- Data inconsistency
- Manual cleanup required

## Solution Implemented

### 1. Added Search Functionality to New Items
- New items section now includes search capability
- Each new item has an **Edit icon (✏️)**
- Click to search existing inventory
- Uses autocomplete for quick matching

### 2. Autocomplete Search
- Search box pre-filled with item name
- Type to filter existing inventory
- Dropdown shows matching items
- Select to create mapping

### 3. Visual Mapping Indicators
- **Unmapped items**: Green background/border
- **Mapped items**: Blue background/border
- **Original name**: Shown with strikethrough
- **Matched name**: Shown with arrow (→) in blue
- **Remove mapping**: X icon to undo

### 4. Import Processing
- Mappings applied before import
- Mapped items update existing inventory
- Unmapped items create new entries
- Console logs show mapping details

## Code Changes

### File: `client/src/components/ImportModal.js`

#### 1. Added Imports
```javascript
import SimpleAutocomplete from './SimpleAutocomplete';
import { FiEdit2, FiCheck, FiX, FiSearch } from 'react-icons/fi';
```

#### 2. Added State Variables
```javascript
const [editingNewItemIndex, setEditingNewItemIndex] = useState(null);
const [newItemSearchText, setNewItemSearchText] = useState('');
const [existingInventory, setExistingInventory] = useState([]);
const [newItemMappings, setNewItemMappings] = useState({});
```

#### 3. Updated handlePreview Function
```javascript
// Fetch existing inventory for search functionality
try {
  const inventoryResponse = await api.get(`/inventory/location/${selectedLocation}`);
  setExistingInventory(inventoryResponse.data);
} catch (invError) {
  console.error('Error fetching inventory for search:', invError);
}
```

#### 4. Enhanced New Items Section
- Added info banner explaining the feature
- Added edit button for each item
- Added search mode with SimpleAutocomplete
- Added visual indicators for mapped items
- Added remove mapping functionality

#### 5. Updated performImport Function
```javascript
// Apply new item mappings (replace description/unit with matched existing items)
validData = validData.map((item, idx) => {
  const mapping = newItemMappings[idx];
  if (mapping) {
    console.log(`🔄 Mapping: "${item.description}" (${item.unit}) → "${mapping.description}" (${mapping.unit})`);
    return {
      ...item,
      description: mapping.description,
      unit: mapping.unit,
      _originalDescription: item.description,
      _originalUnit: item.unit
    };
  }
  return item;
});
```

## User Flow

### Step 1: Upload and Preview
1. User uploads Excel/CSV file
2. Clicks "Preview Import"
3. System identifies new items

### Step 2: Review New Items
1. Expand "New Items" section
2. See list of items that will be created
3. Each item shows batch, description, unit, qty, cost

### Step 3: Search for Match
1. Click **✏️** icon next to item with typo
2. Search box appears with autocomplete
3. Type to search existing inventory
4. Select matching item from dropdown

### Step 4: Confirm Mapping
1. Original name shows with strikethrough
2. Matched name shows with arrow (→)
3. Item border changes to blue
4. Toast confirms mapping

### Step 5: Import
1. Click "Import"
2. Mapped items update existing inventory
3. Unmapped items create new entries
4. Console shows mapping details

## Example Scenarios

### Scenario 1: Typo in Product Name
```
Import:    "CHIMPEUS MAN 10S" (typo)
Inventory: "CHIMPEOUS MAN 10S" (correct)

Action:
1. Click ✏️ next to "CHIMPEUS MAN 10S"
2. Search "CHIMPEOUS"
3. Select "CHIMPEOUS MAN 10S"

Result:
✓ Quantity added to "CHIMPEOUS MAN 10S"
✗ No duplicate created
```

### Scenario 2: Abbreviated Name
```
Import:    "VIT C 500"
Inventory: "VITAMIN C 500MG"

Action:
1. Click ✏️ next to "VIT C 500"
2. Search "VITAMIN C"
3. Select "VITAMIN C 500MG"

Result:
✓ Quantity added to "VITAMIN C 500MG"
✗ No duplicate created
```

### Scenario 3: Genuinely New Item
```
Import:    "NEW PRODUCT ABC"
Inventory: (doesn't exist)

Action:
1. Leave unmapped (don't click ✏️)

Result:
✓ New item "NEW PRODUCT ABC" created
```

## Visual Indicators

### Unmapped Item (Default)
- Green background: `rgba(16, 185, 129, 0.05)`
- Green border: `rgba(16, 185, 129, 0.2)`
- Edit icon (✏️) on right
- Normal display of description

### Mapped Item
- Blue background: `rgba(59, 130, 246, 0.05)`
- Blue border: `rgba(59, 130, 246, 0.3)`
- Original description with strikethrough
- Arrow (→) pointing to matched description
- Matched description in blue
- X icon to remove mapping

### Search Mode
- Search box with autocomplete
- Pre-filled with item description
- Dropdown shows matching items
- Cancel button to exit

## Benefits

| Benefit | Description |
|---------|-------------|
| 🎯 Prevents Duplicates | Matches typos to existing items |
| ⚡ Fast Search | Autocomplete for quick matching |
| 🔍 Flexible | Search by partial name |
| 👁️ Visual Feedback | Clear indicators for mapped items |
| 🛡️ Safe | Preview before import |
| 🔄 Reversible | Remove mappings if wrong |

## Console Output

### During Import
```
🔄 Mapping: "CHIMPEUS MAN 10S" (BOT) → "CHIMPEOUS MAN 10S" (BOT)
🔄 Mapping: "VIT C 500" (PC) → "VITAMIN C 500MG" (PC)
📊 Import mode: BOTH - Importing 10 items (existing + new)
```

## Documentation Created

1. **IMPORT_SEARCH_EXISTING_FEATURE.md**
   - Detailed feature explanation
   - Technical implementation
   - Example scenarios

2. **IMPORT_SEARCH_VISUAL_GUIDE.md**
   - Step-by-step visual flow
   - UI mockups
   - Complete examples

## Testing Checklist

- [x] Upload file with typos in product names
- [x] Preview shows new items section
- [x] Click edit icon opens search
- [x] Search box pre-filled with item name
- [x] Autocomplete shows matching items
- [x] Select item creates mapping
- [x] Visual indicators show mapped items
- [x] Remove mapping works (X icon)
- [x] Import applies mappings correctly
- [x] Console logs show mapping details
- [x] Mapped items update existing inventory
- [x] Unmapped items create new entries
- [x] No ESLint errors

## Related Features

- **Task 6**: Import Mode (existing/new/both)
- **Task 5**: Empty prices use existing DB prices
- **CDR Import**: Similar search logic for transfers

## Pattern Reference

This feature follows the same pattern as CDR Import:
- Search with autocomplete
- Visual mapping indicators
- Apply mappings before processing
- Console logging for transparency

## Notes

- Mappings are stored in `newItemMappings` state object
- Key is the original item index in preview array
- Value is `{ description, unit }` of matched item
- Mappings applied in `performImport` before mode filtering
- Original values stored in `_originalDescription` and `_originalUnit`
- Inventory fetched during preview for search functionality
