# Visual Guide: Import Search for Existing Items

## 🎯 Feature Overview
Match new items in your import file to existing inventory items to prevent duplicates from typos or naming variations.

---

## 📋 Step-by-Step Visual Flow

### Step 1: Upload and Preview
```
┌─────────────────────────────────────────┐
│ 📁 Import Inventory                     │
├─────────────────────────────────────────┤
│ [Choose File] inventory.xlsx            │
│ Location: [Main Warehouse ▼]           │
│                                         │
│ [Preview Import]                        │
└─────────────────────────────────────────┘
```

### Step 2: View New Items Section
```
┌─────────────────────────────────────────────────────────┐
│ 🆕 New Items (3)                        [▼ Show]       │
├─────────────────────────────────────────────────────────┤
│ ℹ️ Search for Existing Items                           │
│ Click the ✏️ icon to search and match new items with   │
│ existing inventory (useful for fixing typos)           │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ THS-001 │ CHIMPEUS MAN 10S │ BOT │ Qty: 50 │ ✏️│   │ ← Green
│ └─────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────┐   │
│ │ THS-002 │ VIT C 500        │ PC  │ Qty: 100│ ✏️│   │
│ └─────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────┐   │
│ │ THS-003 │ NEW PRODUCT ABC  │ BOT │ Qty: 25 │ ✏️│   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Step 3: Click Edit Icon (✏️)
```
┌─────────────────────────────────────────────────────────┐
│ 🆕 New Items (3)                        [▼ Show]       │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🔍 Search for existing item:                    │   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ CHIMPEUS MAN 10S                            │ │   │ ← Pre-filled
│ │ └─────────────────────────────────────────────┘ │   │
│ │                                                 │   │
│ │ [✕ Cancel]                                      │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Step 4: Type to Search
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Search for existing item:                           │
│ ┌─────────────────────────────────────────────────┐   │
│ │ CHIMPEOUS                                       │   │ ← Type here
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ 📋 Search Results:                                      │
│ ┌─────────────────────────────────────────────────┐   │
│ │ ▸ CHIMPEOUS MAN 10S - BOT (Qty: 100)          │   │ ← Click
│ │ ▸ CHIMPEOUS WOMAN 10S - BOT (Qty: 50)         │   │
│ │ ▸ CHIMPEOUS KIDS 5S - BOT (Qty: 75)           │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [✕ Cancel]                                              │
└─────────────────────────────────────────────────────────┘
```

### Step 5: Select Match
```
┌─────────────────────────────────────────────────────────┐
│ ✅ Matched: "CHIMPEUS MAN 10S" will be imported as     │
│    "CHIMPEOUS MAN 10S"                                  │
└─────────────────────────────────────────────────────────┘
```

### Step 6: View Mapped Item
```
┌─────────────────────────────────────────────────────────┐
│ 🆕 New Items (3)                        [▼ Show]       │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐   │
│ │ THS-001                                         │   │ ← Blue border
│ │ CHIMPEUS MAN 10S (strikethrough)               │   │
│ │ → CHIMPEOUS MAN 10S │ BOT │ Qty: 50        │ ✕│   │
│ └─────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────┐   │
│ │ THS-002 │ VIT C 500        │ PC  │ Qty: 100│ ✏️│   │ ← Still green
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Step 7: Import with Mappings
```
┌─────────────────────────────────────────┐
│ Import Summary:                         │
│                                         │
│ ✓ 1 item mapped to existing            │
│ ✓ 2 items will be created as new       │
│                                         │
│ [Confirm Import] [Cancel]               │
└─────────────────────────────────────────┘
```

---

## 🎨 Visual Indicators

### Unmapped New Item (Default)
```
┌─────────────────────────────────────────┐
│ THS-001 │ PRODUCT NAME │ BOT │ Qty │ ✏️│ ← Green background
└─────────────────────────────────────────┘   Green border
                                               Edit icon
```

### Mapped Item
```
┌─────────────────────────────────────────┐
│ THS-001                                 │ ← Blue background
│ WRONG NAME (crossed out)                │   Blue border
│ → CORRECT NAME │ BOT │ Qty: 50     │ ✕│   X to remove
└─────────────────────────────────────────┘
```

### Search Mode
```
┌─────────────────────────────────────────┐
│ 🔍 Search for existing item:            │
│ ┌─────────────────────────────────────┐ │
│ │ [Search text here...]               │ │ ← Autocomplete
│ └─────────────────────────────────────┘ │
│                                         │
│ [✕ Cancel]                              │
└─────────────────────────────────────────┘
```

---

## 📊 Complete Example

### Import File Contains
```
┌──────────────────────┬─────┬─────┐
│ PRODUCT              │ UoM │ Qty │
├──────────────────────┼─────┼─────┤
│ CHIMPEUS MAN 10S     │ BOT │ 50  │ ← Typo!
│ VIT C 500            │ PC  │ 100 │ ← Short name
│ NEW PRODUCT ABC      │ BOT │ 25  │ ← Actually new
└──────────────────────┴─────┴─────┘
```

### Existing Inventory
```
┌──────────────────────┬─────┬─────┐
│ PRODUCT              │ UoM │ Qty │
├──────────────────────┼─────┼─────┤
│ CHIMPEOUS MAN 10S    │ BOT │ 100 │ ← Correct spelling
│ VITAMIN C 500MG      │ PC  │ 200 │ ← Full name
└──────────────────────┴─────┴─────┘
```

### User Actions
```
1. Map "CHIMPEUS MAN 10S" → "CHIMPEOUS MAN 10S"
2. Map "VIT C 500" → "VITAMIN C 500MG"
3. Leave "NEW PRODUCT ABC" unmapped
```

### Import Result
```
┌──────────────────────┬─────┬──────┬────────┐
│ PRODUCT              │ UoM │ Qty  │ Action │
├──────────────────────┼─────┼──────┼────────┤
│ CHIMPEOUS MAN 10S    │ BOT │ 150  │ UPDATE │ ← 100 + 50
│ VITAMIN C 500MG      │ PC  │ 300  │ UPDATE │ ← 200 + 100
│ NEW PRODUCT ABC      │ BOT │ 25   │ CREATE │ ← New item
└──────────────────────┴─────┴──────┴────────┘
```

---

## 🔄 Workflow Diagram

```
┌─────────────┐
│ Upload File │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Preview   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ View New Items (3)  │
└──────┬──────────────┘
       │
       ├─────────────────────────┐
       │                         │
       ▼                         ▼
┌──────────────┐        ┌──────────────┐
│ Click ✏️     │        │ Leave as is  │
└──────┬───────┘        └──────┬───────┘
       │                       │
       ▼                       │
┌──────────────┐               │
│ Search       │               │
└──────┬───────┘               │
       │                       │
       ▼                       │
┌──────────────┐               │
│ Select Match │               │
└──────┬───────┘               │
       │                       │
       ▼                       │
┌──────────────┐               │
│ Item Mapped  │               │
│ (Blue)       │               │
└──────┬───────┘               │
       │                       │
       └───────┬───────────────┘
               │
               ▼
       ┌──────────────┐
       │    Import    │
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │   Success!   │
       └──────────────┘
```

---

## 💡 Tips

### When to Use Mapping
✅ Typos in import file
✅ Different spelling conventions
✅ Abbreviated vs full names
✅ Different unit formats

### When NOT to Use Mapping
❌ Genuinely new products
❌ Different product variants
❌ Different sizes/strengths

### Best Practices
1. Review all new items before importing
2. Use search to find similar names
3. Check unit matches (BOT vs PC)
4. Remove mapping if wrong match
5. Import and verify results

---

## 🔗 Related Features

- **Import Mode** - Filter existing/new items
- **Duplicate Detection** - Auto-identifies existing items
- **CDR Import** - Similar search for transfers
