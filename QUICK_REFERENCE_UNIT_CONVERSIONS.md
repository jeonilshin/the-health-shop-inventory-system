# Unit Conversion Import - Quick Reference Card

## 📝 Excel Template

```
┌───────┬──────────────────────┬─────┬─────────┬──────────┬───────────────┬─────┐
│ BRAND │ THE HEALTHSHOP       │ UoM │ CONTENT │ Ave Unit │ Selling Price │ QTY │
│       │ PRODUCTS             │     │         │ Cost     │               │     │
├───────┼──────────────────────┼─────┼─────────┼──────────┼───────────────┼─────┤
│ XX    │ PRODUCT NAME         │ BOT │         │ 100.00   │ 750.00        │ 10  │
│ XX    │ PRODUCT NAME PC      │ PC  │ 20      │ 5.00     │ 37.50         │ 200 │
└───────┴──────────────────────┴─────┴─────────┴──────────┴───────────────┴─────┘
```

## ✅ Rules

| Item | CONTENT Value | Result |
|------|---------------|--------|
| Base Unit (BOT, BOX, CASE) | Empty or 0 | Base product |
| Converted Unit (PC, PACK) | Number > 0 | Creates conversion |

## 🎯 Examples

### Medicine Bottle
```
PARACETAMOL 500 | BOT | [empty] → Base
PARACETAMOL 500 | PC  | 20      → 1 BOT = 20 PC
```

### Boxed Product
```
VITAMIN C | BOX  | [empty] → Base
VITAMIN C | PACK | 12      → 1 BOX = 12 PACK
```

### Multi-Level
```
SUPPLEMENT | CASE | [empty] → Base
SUPPLEMENT | BOX  | 6       → 1 CASE = 6 BOX
SUPPLEMENT | PC   | 24      → 1 BOX = 24 PC
```

## 🔍 What to Check

✓ Base unit has NO content
✓ Converted unit has content > 0
✓ Product names match exactly
✓ Units are different (BOT vs PC)

## 🚀 Import Steps

1. Add CONTENT column to Excel
2. Fill conversion factors
3. Import → Preview
4. Check CONTENT column highlighted
5. Import → Check console for "🔗 Created conversion"

## 💡 Tips

- Use consistent product names
- Standard units: BOT, PC, PACK, BOX, CASE
- Content = "how many small units in one big unit"
- Re-import updates existing conversions

## ⚠️ Common Mistakes

❌ Base unit has content → Should be empty
❌ Different product names → Must match
❌ Same unit for both → Must be different
❌ Negative content → Must be positive

## 📊 After Import

Check conversions at:
- Admin Panel → Unit Conversions
- Console: "🔗 Created conversion" messages
- Database: `unit_conversions` table

## 🎓 Remember

**CONTENT = Conversion Factor**

If 1 BOTTLE contains 20 PIECES:
- BOTTLE row: CONTENT = [empty]
- PIECE row: CONTENT = 20

That's it! 🎉
