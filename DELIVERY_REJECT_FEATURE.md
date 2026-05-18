# Delivery Reject Feature

## Feature Added

### Reject Delivery Button for Admin and Managers ✅

**Problem**: Admin and managers could only confirm deliveries, but had no way to reject them if there was an issue.

**Solution**: 
- Added "Reject" button next to "Confirm" button
- Inline rejection reason textarea (similar to transfers)
- Rejection reason is required
- Works for both admin (awaiting confirmation) and managers (incoming deliveries)

---

## Changes Made

**File**: `client/src/components/Deliveries.js`

### 1. Added Reject Delivery State
```javascript
const [rejectDeliveryState, setRejectDeliveryState] = useState({ id: null, reason: '' });
```

### 2. Added Reject Delivery Handler
```javascript
const handleRejectDelivery = async () => {
  if (!rejectDeliveryState.reason.trim()) {
    alert('Please enter a rejection reason.');
    return;
  }
  try {
    await api.post(`/deliveries/${rejectDeliveryState.id}/reject`, {
      rejection_reason: rejectDeliveryState.reason.trim()
    });
    alert('Delivery rejected successfully.');
    setRejectDeliveryState({ id: null, reason: '' });
    fetchAll();
  } catch (error) {
    alert(error.response?.data?.error || 'Error rejecting delivery');
  }
};
```

### 3. Updated UI with Reject Button

**Admin - Awaiting Confirmation Section**:
- Shows "Confirm" and "Reject" buttons side by side
- Click "Reject" → Inline textarea appears
- Enter rejection reason → Click "Confirm Reject"
- Delivery is rejected with reason saved

**Branch Manager - Incoming Deliveries Section**:
- Shows "Accept" and "Reject" buttons side by side
- Same inline rejection flow
- Works for both regular deliveries and manager confirmation deliveries

---

## User Experience

### Admin Workflow

#### Before Rejection:
```
Actions: [✓ Confirm]
```

#### After Adding Reject:
```
Actions: [✓ Confirm] [✗ Reject]
```

#### When Reject is Clicked:
```
┌─────────────────────────────────────────┐
│ Rejection reason (required)             │
│ [Supplier didn't have stock...]         │
└─────────────────────────────────────────┘
[Confirm Reject] [✗]
```

### Manager Workflow

#### Incoming Delivery Actions:
```
Before: [✓ Accept Delivery]
After:  [✓ Accept] [✗ Reject]
```

#### Manager Confirmation Actions:
```
Before: [✓ Confirm Delivery]
After:  [✓ Confirm] [✗ Reject]
```

---

## Visual Display

### Admin - Awaiting Confirmation

```
┌──────────────────────────────────────────────────────────────┐
│ Deliveries Awaiting Your Confirmation (3)                   │
├──────────────────────────────────────────────────────────────┤
│ Date    │ From      │ To       │ Items        │ Actions     │
├──────────────────────────────────────────────────────────────┤
│ 1/15/24 │ Warehouse │ Branch 1 │ Paracetamol  │ [✓ Confirm] │
│         │           │          │ 500 PC       │ [✗ Reject]  │
└──────────────────────────────────────────────────────────────┘
```

### When Reject is Clicked

```
┌──────────────────────────────────────────────────────────────┐
│ Date    │ From      │ To       │ Items        │ Actions     │
├──────────────────────────────────────────────────────────────┤
│ 1/15/24 │ Warehouse │ Branch 1 │ Paracetamol  │ ┌─────────┐ │
│         │           │          │ 500 PC       │ │ Reason: │ │
│         │           │          │              │ │ [____]  │ │
│         │           │          │              │ │ [Confirm│ │
│         │           │          │              │ │  Reject]│ │
│         │           │          │              │ │ [✗]     │ │
│         │           │          │              │ └─────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Manager - Incoming Deliveries

```
┌──────────────────────────────────────────────────────────────┐
│ Incoming Deliveries (2)                                      │
├──────────────────────────────────────────────────────────────┤
│ Date    │ From      │ Items        │ Status  │ Actions      │
├──────────────────────────────────────────────────────────────┤
│ 1/15/24 │ Warehouse │ Paracetamol  │ Ready   │ [✓ Accept]   │
│         │           │ 500 PC       │         │ [✗ Reject]   │
└──────────────────────────────────────────────────────────────┘
```

---

## Benefits

1. **Flexibility**: Can reject deliveries that have issues
2. **Documentation**: Rejection reason is saved for audit trail
3. **Consistency**: Same UI pattern as transfers rejection
4. **User-Friendly**: Inline rejection (no modal popup)
5. **Required Reason**: Cannot reject without providing a reason

---

## Use Cases

### When to Reject a Delivery

**Admin Reasons**:
- Supplier didn't have the stock
- Wrong items were prepared
- Pricing error
- Delivery no longer needed
- Branch requested cancellation

**Manager Reasons**:
- Branch doesn't need the items anymore
- Received wrong items
- Quantity is incorrect
- Quality issues noticed
- Storage space not available

---

## Comparison: Confirm vs Reject

| Action | Button Color | Icon | Confirmation | Result |
|--------|-------------|------|--------------|--------|
| Confirm | Green | ✓ | Yes (popup) | Delivery proceeds to next stage |
| Reject | Red | ✗ | Yes (inline reason) | Delivery is cancelled with reason |

---

## Workflow States

### Admin Workflow
```
1. Delivery created (awaiting_admin)
   ↓
2. Admin sees in "Awaiting Confirmation"
   ↓
3. Admin can:
   → Confirm → Delivery goes to branch (admin_confirmed)
   → Reject → Delivery cancelled (rejected)
```

### Manager Workflow
```
1. Delivery arrives at branch (admin_confirmed)
   ↓
2. Manager sees in "Incoming Deliveries"
   ↓
3. Manager can:
   → Accept → Items added to inventory (delivered)
   → Reject → Delivery cancelled (rejected)
```

---

## Backend API Endpoint

The reject functionality calls:
```
POST /deliveries/:id/reject
Body: { rejection_reason: "reason text" }
```

**Expected Backend Behavior**:
- Update delivery status to 'rejected'
- Save rejection reason
- Optionally notify relevant parties
- Return inventory to warehouse (if already deducted)

---

## Testing Checklist

### Admin - Awaiting Confirmation
- [ ] See delivery in "Awaiting Confirmation" section
- [ ] Click "Reject" button
- [ ] Inline textarea appears
- [ ] Try to submit without reason → Alert appears
- [ ] Enter rejection reason
- [ ] Click "Confirm Reject"
- [ ] Success message appears
- [ ] Delivery removed from list
- [ ] Delivery status updated to 'rejected'

### Manager - Incoming Deliveries
- [ ] See delivery in "Incoming Deliveries" section
- [ ] Click "Reject" button
- [ ] Inline textarea appears
- [ ] Enter rejection reason
- [ ] Click "Confirm Reject"
- [ ] Success message appears
- [ ] Delivery removed from list

### Manager - Pending Manager Confirmation
- [ ] See staff-accepted delivery
- [ ] Click "Reject" button (instead of "Confirm")
- [ ] Enter rejection reason
- [ ] Click "Confirm Reject"
- [ ] Delivery rejected

### Cancel Rejection
- [ ] Click "Reject" button
- [ ] Textarea appears
- [ ] Click "✗" button
- [ ] Textarea disappears
- [ ] Back to normal buttons

---

## Build Status
✅ **Build compiled successfully** - Ready to deploy!

---

## Summary

Admin and managers can now reject deliveries with a required reason:

- ✅ "Reject" button added next to "Confirm" button
- ✅ Inline rejection reason textarea
- ✅ Required rejection reason validation
- ✅ Works for admin (awaiting confirmation)
- ✅ Works for managers (incoming deliveries)
- ✅ Consistent with transfers rejection UI
- ✅ Saves rejection reason for audit trail

This gives users the flexibility to handle delivery issues properly!
