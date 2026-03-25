# 🔄 Unit Conversion Import Feature

## Overview

This feature automatically creates unit conversion relationships when importing inventory from Excel/CSV files. Simply add a CONTENT column to define conversion factors, and the system handles the rest!

## 🚀 Quick Start

### 1. Prepare Your Excel File

Add a CONTENT column to your import file:

```
BRAND | PRODUCT NAME      | UoM | CONTENT | Cost  | Price  | QTY
CH    | CHIMPEOUS MAN 10S | BOT |         | 70.00 | 500.00 | 5
CH    | CHIMPEOUS MAN 10S | PC  | 10      | 7.00  | 50.00  | 50
```

### 2. Import the File

1. Go to Inventory → Import
2. Select your Excel file
3. Click "Preview"
4. Verify CONTENT column shows correctly
5. Click "Import to Inventory"

### 3. Verify Conversions

Check the browser console for:
```
🔗 Created conversion: CHIMPEOUS MAN 10S - 1 BOT = 10 PC
```

Or go to Admin Panel → Unit Conversions to see all conversions.

## 📖 Documentation

- **[UNIT_CONVERSION_IMPORT.md](UNIT_CONVERSION_IMPORT.md)** - Complete feature documentation
- **[UNIT_CONVERSION_VISUAL_GUIDE.md](UNIT_CONVERSION_VISUAL_GUIDE.md)** - Visual examples and troubleshooting
- **[QUICK_REFERENCE_UNIT_CONVERSIONS.md](QUICK_REFERENCE_UNIT_CONVERSIONS.md)** - Quick reference card
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Technical implementation details

## 🎯 Key Rules

| Item Type | CONTENT Value | Result |
|-----------|---------------|--------|
| Base Unit (BOT, BOX, CASE) | Empty or 0 | Identified as base product |
| Converted Unit (PC, PACK) | Number > 0 | Creates conversion relationship |

## ✨ Features

- ✅ Automatic conversion detection
- ✅ Zero manual setup required
- ✅ Products automatically linked
- ✅ Conversion factors immutable
- ✅ Re-import updates conversions
- ✅ Console logging for verification
- ✅ Audit trail maintained

## 💡 Examples

### Medicine Bottles
```
PARACETAMOL 500 | BOT | [empty] → Base unit
PARACETAMOL 500 | PC  | 20      → 1 BOT = 20 PC
```

### Boxed Products
```
VITAMIN C | BOX  | [empty] → Base unit
VITAMIN C | PACK | 12      → 1 BOX = 12 PACK
```

### Multi-Level Conversions
```
SUPPLEMENT | CASE | [empty] → Base unit
SUPPLEMENT | BOX  | 6       → 1 CASE = 6 BOX
SUPPLEMENT | PC   | 24      → 1 BOX = 24 PC
```

## ⚠️ Common Mistakes

| Mistake | Fix |
|---------|-----|
| Base unit has CONTENT value | Leave CONTENT empty for base units |
| Different product names | Ensure names match exactly |
| Same unit for both items | Use different units (BOT vs PC) |
| Negative CONTENT | Use positive numbers only |

## 🔍 Troubleshooting

### Conversion Not Created?

1. Check base unit has NO content
2. Check converted unit HAS content > 0
3. Verify product names match exactly
4. Check console for error messages

### Wrong Conversion Factor?

1. Update CONTENT value in Excel
2. Re-import the file
3. System will update the conversion

### Products Not Matching?

1. Ensure product names are identical
2. Check for extra spaces or typos
3. Names are case-insensitive

## 🛠️ Technical Details

### Files Modified

- `server/routes/import.js` - Backend import logic
- `client/src/components/ImportModal.js` - Frontend UI

### Database Table

```sql
unit_conversions (
  id SERIAL PRIMARY KEY,
  product_description TEXT NOT NULL,
  base_unit VARCHAR(50) NOT NULL,
  converted_unit VARCHAR(50) NOT NULL,
  conversion_factor DECIMAL(10, 2) NOT NULL,
  UNIQUE(product_description, base_unit, converted_unit)
)
```

### API Endpoints

- `POST /api/import/preview` - Preview with CONTENT
- `POST /api/import/import` - Import with conversion creation
- `GET /api/unit-conversions` - View all conversions
- `GET /api/unit-conversions/product/:description` - View product conversions

## 📊 Benefits

### For Users
- No manual conversion setup
- Automatic product linking
- Consistent conversion factors
- Easy updates via re-import

### For System
- Accurate inventory tracking
- Automatic unit conversions
- Data integrity maintained
- Complete audit trail

## 🎓 Best Practices

1. **Consistent Naming** - Use the same product name for all units
2. **Standard Units** - Use BOT, PC, PACK, BOX, CASE consistently
3. **Verify Content** - Double-check CONTENT values before import
4. **Test First** - Use preview to verify before importing
5. **Document** - Keep a reference of your conversion factors

## 📞 Support

For questions or issues:
1. Check the documentation files listed above
2. Review console logs for detailed messages
3. Verify Excel format matches examples
4. Check `unit_conversions` table in database

## 🎉 Success!

You're now ready to use the unit conversion import feature. Simply add a CONTENT column to your Excel files, and the system will automatically create conversion relationships between your products!

**Remember:** CONTENT = Conversion Factor

If 1 BOTTLE contains 20 PIECES:
- BOTTLE row: CONTENT = [empty]
- PIECE row: CONTENT = 20

That's it! Happy importing! 🚀
