# Visual Flow - Discrepancy System

## 🎯 Complete System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DELIVERY & DISCREPANCY FLOW                  │
└─────────────────────────────────────────────────────────────────┘

STEP 1: WAREHOUSE SHIPS
┌──────────────┐
│  Warehouse   │  Creates delivery: 30 boxes Paracetamol
│   (Admin)    │  Status: "awaiting_admin"
└──────┬───────┘
       │
       ▼
STEP 2: ADMIN CONFIRMS
┌──────────────┐
│    Admin     │  Clicks "Confirm Delivery"
│              │  Status: "admin_confirmed" → "in_transit"
└──────┬───────┘
       │
       ▼
STEP 3: BRANCH RECEIVES
┌──────────────┐
│    Branch    │  Opens box, counts: Only 29 boxes!
│   Manager    │  Clicks "Accept Delivery" (adds 29 to inventory)
└──────┬───────┘  Status: "delivered"
       │
       ├─────────────────────────────────────────────────┐
       │                                                 │
       ▼                                                 ▼
OPTION A: REPORT SHORTAGE                    OPTION B: REQUEST RETURN
┌──────────────┐                             ┌──────────────┐
│ Report       │                             │ Request      │
│ Shortage     │                             │ Return       │
│              │                             │              │
│ Expected: 30 │                             │ Item: Syrup  │
│ Received: 29 │                             │ Qty: 3       │
│ Missing: 1   │                             │ Reason: Broken│
└──────┬───────┘                             └──────┬───────┘
       │                                            │
       └────────────────┬───────────────────────────┘
                        ▼
STEP 4: ADMIN REVIEWS
┌──────────────────────────────────────────────────────┐
│  Admin sees in Deliveries page:                      │
│  "Pending Discrepancy / Return Requests"             │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ Type: Shortage                                 │  │
│  │ Item: Paracetamol                              │  │
│  │ Expected: 30 | Received: 29 | Missing: 1      │  │
│  │ [Approve] [Reject]                             │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ Type: Return                                   │  │
│  │ Item: Syrup                                    │  │
│  │ Return Qty: 3 bottles                          │  │
│  │ [Approve] [Reject]                             │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────┬───────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
APPROVE SHORTAGE        APPROVE RETURN
┌──────────────┐       ┌──────────────┐
│ Warehouse    │       │ Branch: -3   │
│ +1 box       │       │ Warehouse: +3│
│              │       │              │
│ Branch: 29   │       │              │
│ (unchanged)  │       │              │
└──────┬───────┘       └──────┬───────┘
       │                      │
       └──────────┬───────────┘
                  ▼
STEP 5: VIEW IN DISCREPANCY PAGE
┌─────────────────────────────────────────────────────┐
│  📅 March 25, 2026                        (2 items) │
│                                                      │
│  [Shortage] Paracetamol                             │
│  Expected: 30 | Received: 29                        │
│  Missing: 1× box                        [Approved]  │
│                                                      │
│  [Return] Cough Syrup                               │
│  Return Quantity: 3 bottles                         │
│  Returned: 3× bottle                    [Approved]  │
└─────────────────────────────────────────────────────┘
```

---

## 🗺️ Navigation Map

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR SIDEBAR                           │
├─────────────────────────────────────────────────────────────┤
│  📊 Dashboard                                               │
│  💰 Sales                                                   │
│  📦 Inventory                                               │
│  📤 Transfers                                               │
│  📄 Reports                                                 │
│  📈 Analytics                                               │
│  🚚 Deliveries  ← CLICK HERE TO REPORT SHORTAGE/RETURN     │
│  ⚠️  Discrepancy ← CLICK HERE TO VIEW ALL RECORDS          │
│  💬 Messages                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📍 Deliveries Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🚚 Delivery Management                                     │
│                          [🔄 Request Return to Warehouse]   │← Button 1
└─────────────────────────────────────────────────────────────┘
                                ↑
                                │
                    Click here to return broken items


┌─────────────────────────────────────────────────────────────┐
│  📦 Incoming Deliveries (2)                                 │
│  ⓘ These items are ready for delivery.                     │
├─────────────────────────────────────────────────────────────┤
│  Date | From | Items | Status | Actions                     │
│  3/25 | WH   | Para  | Shipped | [✅ Accept Delivery]       │
└─────────────────────────────────────────────────────────────┘
                                    ↑
                                    │
                        Click to add to your inventory


┌─────────────────────────────────────────────────────────────┐
│  🚚 Delivery History                                        │
├─────────────────────────────────────────────────────────────┤
│  Date | From | Items | Status    | Actions                  │
│  3/25 | WH   | Para  | Delivered | [⚠️ Report Shortage]     │← Button 2
│  3/24 | WH   | Asp   | Delivered | [⚠️ Report Shortage]     │
└─────────────────────────────────────────────────────────────┘
                                      ↑
                                      │
                    Click here if you received less than expected


┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Shortage & Return History              [Show ▼]        │
├─────────────────────────────────────────────────────────────┤
│  (Click to expand and see your shortage/return history)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Two Main Buttons

### Button 1: Request Return to Warehouse
**Location:** Top right of Deliveries page  
**Color:** Purple  
**Icon:** 🔄  
**Use when:** You have broken/wrong items to send back

```
┌─────────────────────────────────────┐
│  🔄 Request Return to Warehouse     │
└─────────────────────────────────────┘
         ↓ Click opens modal
┌─────────────────────────────────────┐
│  Request Return to Warehouse        │
├─────────────────────────────────────┤
│  Item Description: [___________]    │
│  Unit: [___________]                │
│  Quantity to Return: [___________]  │
│  Return to Warehouse: [Select ▼]   │
│  Note: [___________________]        │
│         [___________________]       │
│                                     │
│  [Cancel] [Submit Return Request]  │
└─────────────────────────────────────┘
```

### Button 2: Report Shortage
**Location:** Actions column in Delivery History  
**Color:** Yellow/Orange  
**Icon:** ⚠️  
**Use when:** You received less than expected

```
┌─────────────────────────────────────┐
│  ⚠️ Report Shortage                 │
└─────────────────────────────────────┘
         ↓ Click opens modal
┌─────────────────────────────────────┐
│  Report Delivery Shortage           │
├─────────────────────────────────────┤
│  Which item is short?               │
│  [Paracetamol 500mg - 30 box ▼]    │
│                                     │
│  Expected: 30 box                   │
│  Actually Received: [29]            │
│                                     │
│  Shortage amount: 1 box             │
│                                     │
│  Note: [___________________]        │
│        [___________________]        │
│                                     │
│  [Cancel] [Submit Shortage Report] │
└─────────────────────────────────────┘
```

---

## 📊 Discrepancy Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  📦 Discrepancy Records                                     │
│  Track shortage reports and return requests                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🔍 Filters:                                                │
│  Type: [All Types ▼] [Shortage Only] [Return Only]         │
│  Status: [All Status ▼] [Pending] [Approved] [Rejected]    │
│  Showing 5 of 5 records                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  📅 March 25, 2026                              (3 items)   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [🔶 Shortage] Paracetamol 500mg                       │  │
│  │ Expected: 30 | Received: 29                           │  │
│  │ Missing: 1× box                          [⏳ Pending] │  │
│  │ Note: One box was damaged during transport            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [🔄 Return] Cough Syrup 100ml                         │  │
│  │ Return Quantity: 3 bottles                            │  │
│  │ Returned: 3× bottle                      [✅ Approved]│  │
│  │ Note: Bottles were broken, glass shattered            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [🔄 Return] Vitamin C Tablets                         │  │
│  │ Return Quantity: 2 boxes                              │  │
│  │ Returned: 2× box                         [❌ Rejected]│  │
│  │ Admin: Items are still usable, keep them              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  📅 March 24, 2026                              (2 items)   │
├─────────────────────────────────────────────────────────────┤
│  ... (more items)                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎬 Real Example Walkthrough

### Scenario: You received 29 boxes instead of 30

**Step 1:** Go to Deliveries page
```
Click: Sidebar → 🚚 Deliveries
```

**Step 2:** Accept the delivery first
```
See: "Incoming Deliveries" section
Find: Paracetamol 30 boxes
Click: [✅ Accept Delivery]
Result: 29 boxes added to your inventory (you counted 29)
```

**Step 3:** Report the shortage
```
Scroll down to: "Delivery History"
Find: The delivery you just accepted (now shows "Delivered")
Click: [⚠️ Report Shortage]
```

**Step 4:** Fill the form
```
Modal opens:
- Which item? → Paracetamol 500mg (auto-selected)
- Expected: 30 box (auto-filled)
- Actually Received: Type "29"
- System shows: "Shortage amount: 1 box"
- Note: Type "One box was damaged during transport"
- Click: [Submit Shortage Report]
```

**Step 5:** Wait for admin
```
You see: "Shortage report submitted! Admin will review shortly."
Status: Pending
```

**Step 6:** Check status
```
Option 1: Go to Discrepancy page
Option 2: Stay on Deliveries page, expand "Shortage & Return History"
```

**Step 7:** Admin approves
```
You get notification: "Your shortage report was approved"
Result: Warehouse gets +1 box back
        Your inventory stays at 29 boxes
```

---

## ✅ Summary

**You can now:**
1. ✅ See "Deliveries" in your sidebar
2. ✅ View deliveries coming to YOUR branch only
3. ✅ Report shortages when you receive less
4. ✅ Request returns for broken items
5. ✅ View all records in Discrepancy page

**You will only see:**
- Deliveries TO your branch
- Discrepancies FROM your branch
- Nothing from other branches
