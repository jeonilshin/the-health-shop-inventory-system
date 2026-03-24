# Branch Manager Guide - Discrepancy System

## 🎯 What You Can Now See

As a **Branch Manager**, you now have access to the **Deliveries** page in your sidebar!

### Your Sidebar Navigation:
```
📊 Dashboard
💰 Sales
📦 Inventory
📤 Transfers
📄 Reports
📈 Analytics
🚚 Deliveries          ← NEW! You can now see this
⚠️  Discrepancy
💬 Messages
```

---

## 🚚 Deliveries Page (`/deliveries`)

### What You'll See:

#### 1. **Incoming Deliveries** (Top Section)
Shows deliveries coming TO your branch that need to be accepted:

```
┌─────────────────────────────────────────────────┐
│  📦 Incoming Deliveries (2)                     │
│  ⓘ These items are ready for delivery.         │
│     Accept them to add to your inventory.       │
├─────────────────────────────────────────────────┤
│ Date  | From      | Items           | Status    │
├─────────────────────────────────────────────────┤
│ 3/25  | Warehouse | Paracetamol 30x | Shipped   │
│                                [✅ Accept Delivery]│
├─────────────────────────────────────────────────┤
│ 3/24  | Warehouse | Aspirin 50x     | Confirmed │
│                                [✅ Accept Delivery]│
└─────────────────────────────────────────────────┘
```

**Actions:**
- Click "Accept Delivery" to add items to your inventory

---

#### 2. **Delivery History** (Middle Section)
Shows all deliveries to your branch:

```
┌─────────────────────────────────────────────────┐
│  🚚 Delivery History                            │
├─────────────────────────────────────────────────┤
│ Date | From | Items        | Status   | Actions │
├─────────────────────────────────────────────────┤
│ 3/25 | WH   | Para 30x     | Delivered│         │
│                              [⚠️ Report Shortage]│← HERE!
├─────────────────────────────────────────────────┤
│ 3/24 | WH   | Aspirin 50x  | Delivered│         │
│                              [⚠️ Report Shortage]│
├─────────────────────────────────────────────────┤
│ 3/23 | WH   | Syrup 20x    | Shipped  │         │
└─────────────────────────────────────────────────┘
```

**Actions:**
- Click "Report Shortage" on delivered items if you received less than expected

---

#### 3. **Request Return Button** (Top Right)
```
┌─────────────────────────────────────────────────┐
│  🚚 Delivery Management                         │
│                    [🔄 Request Return to Warehouse]│← HERE!
└─────────────────────────────────────────────────┘
```

**Use this when:**
- You have broken items
- Wrong items were delivered
- Excess stock to return

---

#### 4. **Shortage & Return History** (Bottom Section - Collapsible)
```
┌─────────────────────────────────────────────────┐
│  ⚠️ Shortage & Return History          [Show ▼]│
├─────────────────────────────────────────────────┤
│  Type      | Item  | Expected | Received | Status│
├─────────────────────────────────────────────────┤
│  Shortage  | Para  | 30       | 29       | Pending│
│  Return    | Syrup | -        | 3        | Approved│
└─────────────────────────────────────────────────┘
```

Click "Show" to expand and see all your shortage reports and return requests.

---

## ⚠️ Discrepancy Page (`/discrepancy`)

### Dedicated page for viewing all records grouped by date:

```
┌─────────────────────────────────────────────────┐
│  📦 Discrepancy Records                         │
│  Track shortage reports and return requests     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  🔍 Filters:                                    │
│  Type: [Shortage Only ▼] Status: [Pending ▼]   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  📅 March 25, 2026                    (2 items) │
├─────────────────────────────────────────────────┤
│  [Shortage] Paracetamol 500mg                   │
│  Expected: 30 | Received: 29                    │
│  Missing: 1× box                    [Pending]   │
│  Note: One box was damaged during transport     │
├─────────────────────────────────────────────────┤
│  [Return] Cough Syrup 100ml                     │
│  Return Quantity: 3 bottles                     │
│  Returned: 3× bottle                [Approved]  │
│  Note: Bottles were broken, glass shattered     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  📅 March 24, 2026                    (1 item)  │
├─────────────────────────────────────────────────┤
│  [Shortage] Aspirin 100mg                       │
│  Expected: 50 | Received: 48                    │
│  Missing: 2× box                    [Approved]  │
└─────────────────────────────────────────────────┘
```

---

## 🎬 Step-by-Step Workflows

### **Workflow 1: Report a Shortage**

1. **Receive delivery**
   - Go to: Deliveries page
   - See: "Incoming Deliveries" section
   - Click: "Accept Delivery"

2. **Count items**
   - You ordered 30 boxes
   - You only received 29 boxes

3. **Report shortage**
   - Scroll to: "Delivery History"
   - Find: The delivery you just accepted
   - Click: "Report Shortage" button
   - Modal opens

4. **Fill out form**
   - Select item: "Paracetamol 500mg"
   - Expected: 30 (auto-filled from delivery)
   - Actually Received: 29 (enter what you got)
   - System shows: Missing = 1 box
   - Note: "One box was damaged during transport"
   - Click: "Submit Shortage Report"

5. **Wait for admin**
   - Admin will review and approve/reject
   - You'll get a notification
   - View status in Discrepancy page

---

### **Workflow 2: Request a Return**

1. **Discover broken items**
   - During inventory check, find 3 broken bottles

2. **Create return request**
   - Go to: Deliveries page
   - Click: "Request Return to Warehouse" (top right)
   - Modal opens

3. **Fill out form**
   - Item Description: "Cough Syrup 100ml"
   - Unit: "bottle"
   - Quantity to Return: 3
   - Return to Warehouse: Select warehouse
   - Note: "Bottles were broken, glass shattered"
   - Click: "Submit Return Request"

4. **Wait for admin**
   - Admin will review and approve/reject
   - If approved: Items removed from your inventory
   - You'll get a notification
   - View status in Discrepancy page

---

## 🔒 What You Can See vs Admin

| Feature | Branch Manager | Admin |
|---------|---------------|-------|
| **Deliveries** | Only TO your branch | All deliveries |
| **Report Shortage** | ✅ Yes | ✅ Yes |
| **Request Return** | ✅ Yes | ✅ Yes |
| **Approve/Reject** | ❌ No | ✅ Yes |
| **Discrepancy Page** | Only your branch | All branches |

---

## 📱 Quick Access

### To report shortage:
```
Sidebar → Deliveries → Delivery History → Report Shortage
```

### To request return:
```
Sidebar → Deliveries → Request Return to Warehouse (top right)
```

### To view all records:
```
Sidebar → Discrepancy → See all grouped by date
```

---

## ✅ Summary

You now have full access to:
1. ✅ **Deliveries page** - See incoming deliveries and history
2. ✅ **Report Shortage** - When you receive less than expected
3. ✅ **Request Return** - When you need to send items back
4. ✅ **Discrepancy page** - View all records organized by date

All filtered to show only YOUR branch data!
