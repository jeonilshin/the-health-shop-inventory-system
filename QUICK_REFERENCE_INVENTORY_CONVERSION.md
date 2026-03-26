# Quick Reference: Inventory Convert Units Auto-Detection

## 🚀 Quick Start

### What It Does
Auto-detects and applies unit conversions when converting BOX/BOT to PC in Inventory page.

### How to Use
1. Go to **Inventory** page
2. Click **🔄 Convert Units** button
3. Select a **BOX/BOT** item in "From Item"
4. System auto-fills **PC item** and **conversion factor**
5. Enter **quantity to convert**
6. Click **Convert Units**

---

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 🔍 Auto-Detect | Finds conversion from database |
| 🎯 Auto-Fill | Fills PC item and conversion factor |
| 🔒 Lock Field | Prevents changes to conversion factor |
| 🎨 Visual Cues | Green background + lock icon |
| 🔔 Toast Alert | Shows detected conversion |

---

## 📋 Visual Indicators

### Auto-Detected ✅
```
┌─────────────────────────┐
│ Units per Box/Bottle *  │
│ ┌─────────────────┐ 🔒 │
│ │ 10              │    │ ← Green + Locked
│ └─────────────────┘    │
│ ✓ Auto-detected        │
└─────────────────────────┘
```

### Manual Entry ✏️
```
┌─────────────────────────┐
│ Units per Box/Bottle *  │
│ ┌─────────────────┐    │
│ │ [Enter...]      │    │ ← White + Editable
│ └─────────────────┘    │
│ How many pieces?       │
└─────────────────────────┘
```

---

## 💡 Example

### Input
- From: **CHIMPEOUS MAN 10S BOT**
- System finds: **1 BOT = 10 PC**

### Auto-Filled
- To: **CHIMPEOUS MAN 10S PC** ✅
- Factor: **10** 🔒

### You Enter
- Quantity: **5**

### Result
- **5 × 10 = 50 pieces** added

---

## ⚡ Benefits

- ✅ **Faster**: No manual searching
- ✅ **Accurate**: Uses database values
- ✅ **Safe**: Locked to prevent errors
- ✅ **Consistent**: Same as import

---

## 🔗 Works With

1. **Import with CONTENT** - Creates conversions
2. **Unit Conversions Page** - Manages database
3. **FIFO Sales** - Same product logic

---

## 📝 Notes

- Only works if conversion exists in database
- Conversion factor is locked for safety
- Manual entry available for new products
- Toast shows detected conversion
