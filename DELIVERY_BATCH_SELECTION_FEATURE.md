# Delivery Form - Batch Selection Feature

## Feature Added

### Cost Batch Selection in New Delivery Form ✅

**Problem**: The Deliveries page didn't have batch selection like the Transfers page, making it impossible to select specific batches with different costs and expiry dates when creating deliveries.

**Solution**: 
- Added cost batch fetching when item is selected
- Added batch selection dropdown showing batch number, quantity, cost, and expiry date
- Auto-fills unit cost when batch is selected
- Validates quantity against selected batch quantity
- Shows batch details after selection

---

## Changes Made

**File**: `client/src/components/Deliveries.js`

### 1. Added Cost Batches State
```javascript
const [costBatches, setCostBatches] = useState([]);
const [deliveryFormData, setDeliveryFormData] = useState({
  from_location_id: '',
  description: '',
  unit: '',
  quantity: '',
  unit_cost: '',
  notes: '',
  available_quantity: null,
  cost_batch_id: ''  // NEW
});
```

### 2. Fetch Cost Batches on Item Selection
```javascript
// Fetch cost batches
const batchResponse = await api.get(
  `/inventory/cost-batches/${fromLocationId}/${encodeURIComponent(item.description)}/${encodeURIComponent(item.unit)}`
);
batches = batchResponse.data;
setCostBatches(batches);
```

### 3. Batch Selection Dropdown
```javascript
<select
  value={deliveryFormData.cost_batch_id}
  onChange={(e) => {
    const selectedBatch = costBatches.find(b => b.cost_batch_id === e.target.value);
    setDeliveryFormData({
      ...deliveryFormData,
      cost_batch_id: e.target.value,
      unit_cost: selectedBatch ? selectedBatch.unit_cost : deliveryFormData.unit_cost
    });
  }}
  required
>
  <option value="">Select batch...</option>
  {costBatches.map((batch, batchIndex) => (
    <option key={batch.cost_batch_id} value={batch.cost_batch_id}>
      {batch.batch_number || `BATCH-${batchIndex + 1}`} - 
      Qty: {formatQuantity(batch.quantity)} - 
      Cost: ₱{formatPrice(batch.unit_cost)} - 
      Exp: {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}
    </option>
  ))}
</select>
```

### 4. Quantity Validation by Batch
```javascript
onChange={(e) => {
  const qty = parseFloat(e.target.value);
  let maxQty = deliveryFormData.available_quantity;
  
  if (deliveryFormData.cost_batch_id) {
    const batch = costBatches.find(b => b.cost_batch_id === deliveryFormData.cost_batch_id);
    maxQty = batch ? parseFloat(batch.quantity) : maxQty;
  }
  
  if (maxQty !== null && qty > maxQty) {
    alert(`Cannot exceed available quantity: ${formatQuantity(maxQty)} ${deliveryFormData.unit}`);
    return;
  }
  setDeliveryFormData({...deliveryFormData, quantity: e.target.value});
}}
```

---

## User Experience

### Form Flow with Batch Selection

1. **Select Warehouse and Branch**
   - Choose source warehouse and destination branch

2. **Search and Select Item**
   - Type to search for product
   - Select from autocomplete suggestions
   - System fetches cost batches from warehouse

3. **Select Batch** (NEW!)
   - Dropdown shows all available batches
   - Each option displays:
     - Batch number (e.g., "BATCH-001")
     - Available quantity (e.g., "Qty: 500.00")
     - Unit cost (e.g., "Cost: ₱5.50")
     - Expiry date (e.g., "Exp: 12/31/2024")

4. **Batch Details Display**
   - After selection, shows batch details in blue box:
     - Batch number
     - Available quantity
     - Expiry date

5. **Enter Quantity**
   - Quantity field enabled after batch selection
   - Placeholder shows max quantity from selected batch
   - Validates against batch quantity (not total quantity)

6. **Unit Cost Auto-Filled**
   - Unit cost automatically filled from selected batch
   - Can be adjusted if needed

7. **Submit Delivery**
   - All validations pass
   - Delivery created with specific batch information

### Visual Display

```
┌─────────────────────────────────────────────────────────────┐
│ Search Item *                                               │
│ [Search for product...                              🔍]     │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Selected: Paracetamol 500mg (PC)                        │ │
│ │ Available in warehouse: 1000.00 PC                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────┐
│ Item Description     │ Unit                 │
│ Paracetamol 500mg    │ PC                   │
│ (disabled)           │ (disabled)           │
└──────────────────────┴──────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Select Batch *                                              │
│ [BATCH-001 - Qty: 500.00 - Cost: ₱5.50 - Exp: 12/31/2024] │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Batch Details: BATCH-001 | Available: 500.00 PC |      │ │
│ │ Expires: 12/31/2024                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────┐
│ Quantity *           │ Unit Cost *          │
│ [400.00]             │ [5.50]               │
│ Max: 500.00          │ (from batch)         │
└──────────────────────┴──────────────────────┘
```

---

## Benefits

1. **Batch Tracking**: Can select specific batches with different costs and expiry dates
2. **FIFO Management**: Can prioritize batches that expire sooner
3. **Cost Accuracy**: Unit cost automatically filled from selected batch
4. **Quantity Control**: Validates against specific batch quantity, not total
5. **Expiry Awareness**: Shows expiry dates to help make informed decisions
6. **Consistency**: Same behavior as Transfers page

---

## Comparison: Transfers vs Deliveries

| Feature | Transfers Page | Deliveries Page |
|---------|---------------|-----------------|
| Item Search | ✅ AutocompleteSearch | ✅ AutocompleteSearch |
| Batch Selection | ✅ Dropdown with details | ✅ Dropdown with details |
| Batch Details Display | ✅ Shows batch info | ✅ Shows batch info |
| Quantity Validation | ✅ By batch | ✅ By batch |
| Unit Cost Auto-Fill | ✅ From batch | ✅ From batch |
| Expiry Date Display | ✅ | ✅ |
| Available Quantity | ✅ | ✅ |

Both pages now have identical batch selection functionality!

---

## Batch Selection Details

### Batch Dropdown Options Format
```
BATCH-001 - Qty: 500.00 - Cost: ₱5.50 - Exp: 12/31/2024
BATCH-002 - Qty: 300.00 - Cost: ₱5.75 - Exp: 06/30/2025
BATCH-003 - Qty: 200.00 - Cost: ₱6.00 - Exp: 12/31/2025
```

### Batch Details Box (After Selection)
```
┌─────────────────────────────────────────────────────────┐
│ Batch Details: BATCH-001 | Available: 500.00 PC |      │
│ Expires: 12/31/2024                                     │
└─────────────────────────────────────────────────────────┘
```

### Quantity Field Behavior
- **Before batch selection**: Disabled with placeholder "Select batch first"
- **After batch selection**: Enabled with placeholder "Max: 500.00"
- **Validation**: Cannot exceed selected batch quantity

### Unit Cost Field Behavior
- **Before batch selection**: Disabled
- **After batch selection**: Auto-filled from batch, can be adjusted

---

## Edge Cases Handled

### 1. Item Has Multiple Batches
- Shows all batches in dropdown
- User selects which batch to deliver from
- Quantity validated against selected batch only

### 2. Item Has Single Batch
- Still shows batch selection dropdown
- Only one option available
- User must select it to proceed

### 3. Item Has No Batches
- Batch selection not shown
- Falls back to simple quantity/cost entry
- Uses total available quantity for validation

### 4. Batch Expires Soon
- Expiry date clearly visible in dropdown
- User can prioritize expiring batches (FIFO)
- No automatic warning (user decision)

### 5. Different Costs in Different Batches
- Each batch shows its own cost
- User can see cost differences
- Selected batch cost auto-fills unit cost field

---

## Workflow Example

### Scenario: Creating a delivery with batch selection

1. **Warehouse user logs in**
2. **Goes to Deliveries page**
3. **Clicks "New Delivery"**
4. **Form opens with warehouse pre-selected**
5. **Selects destination branch**
6. **Searches for "Paracetamol 500mg"**
7. **System shows:**
   - Selected: Paracetamol 500mg (PC)
   - Available in warehouse: 1000.00 PC (green)
8. **Batch dropdown appears with 3 batches:**
   - BATCH-001 - Qty: 500.00 - Cost: ₱5.50 - Exp: 12/31/2024
   - BATCH-002 - Qty: 300.00 - Cost: ₱5.75 - Exp: 06/30/2025
   - BATCH-003 - Qty: 200.00 - Cost: ₱6.00 - Exp: 12/31/2025
9. **User selects BATCH-001** (expires soonest - FIFO)
10. **Batch details appear:**
    - Batch Details: BATCH-001 | Available: 500.00 PC | Expires: 12/31/2024
11. **Quantity field enabled with placeholder "Max: 500.00"**
12. **Unit cost auto-filled with ₱5.50**
13. **User enters quantity: 400**
14. **User adds notes (optional)**
15. **Clicks "Create Delivery"**
16. **Success! Delivery created from BATCH-001**

---

## Testing Checklist

### Basic Batch Selection
- [ ] Select item with multiple batches
- [ ] Batch dropdown appears
- [ ] All batches shown with correct details
- [ ] Select a batch
- [ ] Batch details appear in blue box
- [ ] Unit cost auto-fills from batch
- [ ] Quantity field enabled

### Quantity Validation
- [ ] Enter quantity less than batch quantity → Accepted
- [ ] Enter quantity equal to batch quantity → Accepted
- [ ] Enter quantity more than batch quantity → Alert appears
- [ ] Alert shows correct max quantity
- [ ] Input rejected

### Different Batch Costs
- [ ] Item has batches with different costs
- [ ] Each batch shows its own cost in dropdown
- [ ] Select batch with cost ₱5.50 → Unit cost = ₱5.50
- [ ] Select different batch with cost ₱6.00 → Unit cost = ₱6.00

### Expiry Date Display
- [ ] Batch with expiry date shows date in dropdown
- [ ] Batch without expiry date shows "N/A"
- [ ] Batch details show expiry date after selection

### Edge Cases
- [ ] Item with single batch → Dropdown shows one option
- [ ] Item with no batches → No batch dropdown, simple form
- [ ] Select item, then change warehouse → Batches re-fetched
- [ ] Cancel form → Batches cleared

---

## Build Status
✅ **Build compiled successfully** - Ready to deploy!

---

## Summary

The Deliveries page now has complete batch selection functionality, matching the Transfers page:

- ✅ Fetch cost batches when item selected
- ✅ Batch selection dropdown with full details
- ✅ Batch details display after selection
- ✅ Quantity validation by selected batch
- ✅ Unit cost auto-fill from batch
- ✅ Expiry date visibility
- ✅ Consistent with Transfers page

Users can now select specific batches when creating deliveries, enabling proper FIFO management and cost tracking!
