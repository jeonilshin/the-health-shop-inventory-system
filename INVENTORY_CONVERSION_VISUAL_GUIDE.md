# Visual Guide: Auto-Detect Unit Conversion in Inventory

## 🎯 Feature Overview
When converting units in the Inventory page, the system automatically detects and applies conversion factors from the database.

---

## 📋 Step-by-Step Visual Flow

### Step 1: Open Convert Units Modal
```
Inventory Page → Click "🔄 Convert Units" button
```

### Step 2: Select From Item (BOX/BOT)
```
┌─────────────────────────────────────────┐
│ From Item (BOX/BOT) *                   │
├─────────────────────────────────────────┤
│ Search: CHIMPEOUS MAN 10S               │
│                                         │
│ Results:                                │
│ ▸ CHIMPEOUS MAN 10S BOT (Qty: 50)     │ ← Click this
│ ▸ PRODUCT ABC BOT (Qty: 30)           │
└─────────────────────────────────────────┘
```

### Step 3: Auto-Detection Happens! ✨
```
System checks database:
  ✓ Found conversion for "CHIMPEOUS MAN 10S"
  ✓ Base Unit: BOT
  ✓ Converted Unit: PC
  ✓ Conversion Factor: 10

Auto-fills fields:
  ✓ To Item: CHIMPEOUS MAN 10S PC
  ✓ Units per Box/Bottle: 10 (LOCKED 🔒)
```

### Step 4: Fields Auto-Populated
```
┌─────────────────────────────────────────┐
│ From Item (BOX/BOT) *                   │
│ ✓ CHIMPEOUS MAN 10S - BOT (Qty: 50)   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ To Item (PC) *                          │
│ ✓ CHIMPEOUS MAN 10S PC - PC (Qty: 100)│ ← Auto-filled!
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Units per Box/Bottle *                  │
│ ┌─────────────────────────────────┐ 🔒 │
│ │ 10                              │    │ ← Locked & Green!
│ └─────────────────────────────────┘    │
│ ✓ Auto-detected from database          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Boxes/Bottles to Convert *              │
│ [Enter amount here...]                  │ ← You enter this
└─────────────────────────────────────────┘
```

### Step 5: Enter Quantity & Convert
```
┌─────────────────────────────────────────┐
│ Boxes/Bottles to Convert *              │
│ 5                                       │ ← Enter: 5
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ✓ Result: 5 × 10 = 50 pieces           │
└─────────────────────────────────────────┘

[Convert Units] [Cancel]
```

---

## 🎨 Visual Indicators

### Auto-Detected (Locked)
```
┌─────────────────────────────────────┐
│ Units per Box/Bottle *              │
│ ┌───────────────────────────────┐ 🔒│
│ │ 10                            │   │ ← Green background
│ └───────────────────────────────┘   │    Lock icon
│ ✓ Auto-detected from database       │    Success message
└─────────────────────────────────────┘
```

### Manual Entry (Editable)
```
┌─────────────────────────────────────┐
│ Units per Box/Bottle *              │
│ ┌───────────────────────────────┐   │
│ │ [Enter value...]              │   │ ← White background
│ └───────────────────────────────┘   │    No lock icon
│ How many pieces are in one box?     │    Help text
└─────────────────────────────────────┘
```

---

## 🔔 Toast Notifications

### Success - Auto-Detection
```
┌─────────────────────────────────────────┐
│ ℹ️ Auto-detected: 1 BOT = 10 PC         │
└─────────────────────────────────────────┘
```

---

## 📊 Complete Example

### Before Auto-Detection
```
Import Data:
┌──────────────────────┬─────┬─────────┐
│ PRODUCT              │ UoM │ CONTENT │
├──────────────────────┼─────┼─────────┤
│ CHIMPEOUS MAN 10S    │ BOT │         │ ← Base unit
│ CHIMPEOUS MAN 10S PC │ PC  │ 10      │ ← Converted unit
└──────────────────────┴─────┴─────────┘

System creates conversion:
  1 BOT = 10 PC
```

### During Conversion
```
User Action:
1. Select: CHIMPEOUS MAN 10S BOT
2. System auto-fills: CHIMPEOUS MAN 10S PC
3. System locks: 10 (conversion factor)
4. User enters: 5 (boxes to convert)
5. Result: 5 × 10 = 50 pieces

Inventory Changes:
  CHIMPEOUS MAN 10S BOT: 50 → 45 (-5)
  CHIMPEOUS MAN 10S PC: 100 → 150 (+50)
```

---

## ✅ Benefits

| Feature | Benefit |
|---------|---------|
| 🔒 Locked Factor | Prevents accidental changes |
| 🎨 Green Background | Clear visual indicator |
| ⚡ Auto-Fill | Saves time and effort |
| ✓ Consistency | Uses same factor as import |
| 🎯 Accuracy | Eliminates manual errors |

---

## 🔗 Related Features

1. **Import with CONTENT** - Creates conversions during import
2. **Unit Conversions Page** - Manages conversion database
3. **FIFO Sales** - Uses same product matching logic

---

## 💡 Tips

- ✅ Conversion factor is locked for safety
- ✅ Green background = auto-detected
- ✅ White background = manual entry
- ✅ Lock icon (🔒) = read-only field
- ✅ Toast shows detected conversion
