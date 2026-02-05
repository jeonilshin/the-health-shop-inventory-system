# The Health Shop - How to Use the System

## 🎯 System Overview

This system manages inventory for **28 branches** and **2 warehouses** with automatic stock tracking, transfers, and sales recording.

---

## 👥 User Roles & Permissions

### 1. **Admin** (Full Access)
- View all locations
- Manage users
- View all reports
- Access everything

### 2. **Warehouse Staff**
- Add inventory to warehouse
- Send stock to branches
- View warehouse inventory

### 3. **Branch Manager**
- View branch inventory
- Record sales (auto-deducts stock)
- Transfer items between branches
- Edit inventory details

### 4. **Branch Staff** (Read-Only)
- View branch inventory only
- No editing or transactions

---

## 📋 Step-by-Step Operations

### **STEP 1: Initial Login**

1. Open your app: `https://your-app.vercel.app`
2. Login with admin credentials:
   - Username: `admin`
   - Password: `admin123`
3. **IMPORTANT**: Change admin password immediately!

---

### **STEP 2: Setup Locations (Admin Only - One Time)**

You can now create locations through the **Admin Dashboard UI** - no SQL needed!

**Using Admin Dashboard (Recommended)**:
1. Login as admin
2. Click **"Admin"** in the navigation bar
3. Go to **"Locations Management"** tab
4. Click **"Add Location"** button
5. Fill in the form:
   - Name: "Main Warehouse"
   - Type: "Warehouse"
   - Address: "123 Main St, City"
   - Contact: "555-0001"
6. Click **"Create Location"**
7. Repeat for all 2 warehouses and 28 branches

**Alternative: Using Neon SQL Editor (Bulk Creation)**
1. Go to https://console.neon.tech
2. Open your project → SQL Editor
3. Run this SQL:

```sql
-- Create 2 Warehouses
INSERT INTO locations (name, type, address, contact_number) VALUES
('Main Warehouse', 'warehouse', '123 Main St, City', '555-0001'),
('Secondary Warehouse', 'warehouse', '456 Second Ave, City', '555-0002');

-- Create 28 Branches (customize names/addresses as needed)
INSERT INTO locations (name, type, address, contact_number) VALUES
('Branch 1 - Downtown', 'branch', 'Downtown Address', '555-1001'),
('Branch 2 - Uptown', 'branch', 'Uptown Address', '555-1002'),
('Branch 3 - Eastside', 'branch', 'Eastside Address', '555-1003'),
('Branch 4 - Westside', 'branch', 'Westside Address', '555-1004'),
('Branch 5 - North', 'branch', 'North Address', '555-1005'),
('Branch 6 - South', 'branch', 'South Address', '555-1006'),
('Branch 7 - Central', 'branch', 'Central Address', '555-1007'),
('Branch 8 - Mall', 'branch', 'Mall Address', '555-1008'),
('Branch 9 - Plaza', 'branch', 'Plaza Address', '555-1009'),
('Branch 10 - Market', 'branch', 'Market Address', '555-1010'),
('Branch 11 - Station', 'branch', 'Station Address', '555-1011'),
('Branch 12 - Airport', 'branch', 'Airport Address', '555-1012'),
('Branch 13 - Harbor', 'branch', 'Harbor Address', '555-1013'),
('Branch 14 - University', 'branch', 'University Address', '555-1014'),
('Branch 15 - Hospital', 'branch', 'Hospital Address', '555-1015'),
('Branch 16 - Park', 'branch', 'Park Address', '555-1016'),
('Branch 17 - Beach', 'branch', 'Beach Address', '555-1017'),
('Branch 18 - Mountain', 'branch', 'Mountain Address', '555-1018'),
('Branch 19 - Valley', 'branch', 'Valley Address', '555-1019'),
('Branch 20 - Ridge', 'branch', 'Ridge Address', '555-1020'),
('Branch 21 - Heights', 'branch', 'Heights Address', '555-1021'),
('Branch 22 - Gardens', 'branch', 'Gardens Address', '555-1022'),
('Branch 23 - Springs', 'branch', 'Springs Address', '555-1023'),
('Branch 24 - Lakes', 'branch', 'Lakes Address', '555-1024'),
('Branch 25 - Hills', 'branch', 'Hills Address', '555-1025'),
('Branch 26 - Meadows', 'branch', 'Meadows Address', '555-1026'),
('Branch 27 - Woods', 'branch', 'Woods Address', '555-1027'),
('Branch 28 - Fields', 'branch', 'Fields Address', '555-1028');
```

---

### **STEP 3: Create User Accounts (Admin Only - One Time)**

You can now create users through the **Admin Dashboard UI** - no SQL needed!

**Using Admin Dashboard (Recommended)**:
1. Login as admin
2. Click **"Admin"** in the navigation bar
3. Go to **"User Management"** tab
4. Click **"Add User"** button
5. Fill in the form:
   - Username: "warehouse1"
   - Password: "warehouse123"
   - Full Name: "John Warehouse"
   - Role: "Warehouse Staff"
   - Location: "Main Warehouse"
6. Click **"Create User"**
7. Repeat for all staff members

**Alternative: Using Neon SQL Editor (Bulk Creation)**:

```sql
-- Create Warehouse Staff (password: warehouse123)
INSERT INTO users (username, password, full_name, role, location_id) VALUES
('warehouse1', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'John Warehouse', 'warehouse', 1),
('warehouse2', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'Jane Warehouse', 'warehouse', 2);

-- Create Branch Managers (password: manager123)
INSERT INTO users (username, password, full_name, role, location_id) VALUES
('manager1', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'Manager Branch 1', 'branch_manager', 3),
('manager2', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'Manager Branch 2', 'branch_manager', 4);
-- ... create for all 28 branches

-- Create Branch Staff (password: staff123)
INSERT INTO users (username, password, full_name, role, location_id) VALUES
('staff1', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'Staff Branch 1', 'branch_staff', 3),
('staff2', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8YqZ9vXqZ9vXqZ9vXqZ9vXqZ9vXqZ9', 'Staff Branch 2', 'branch_staff', 4);
-- ... create for all 28 branches
```

**Note**: These are example hashed passwords. In production, use proper password hashing!

---

## 🔄 Daily Operations Workflow

### **SCENARIO 1: Warehouse Receives New Stock**

**Who**: Warehouse Staff  
**Steps**:

1. Login as warehouse staff
2. Go to **Inventory** page
3. Select your warehouse location
4. Click **"Add Item"**
5. Fill in details:
   - Description: "Paracetamol 500mg"
   - Unit: "box"
   - Quantity: 100
   - Unit Cost: ₱50.00
   - Suggested Selling Price: ₱75.00
6. Click **"Add to Inventory"**

✅ **Result**: Stock added to warehouse inventory

---

### **SCENARIO 2: Warehouse Sends Stock to Branch**

**Who**: Warehouse Staff  
**Steps**:

1. Login as warehouse staff
2. Go to **Transfers** page
3. Click **"New Transfer"**
4. Fill in details:
   - From Location: "Main Warehouse"
   - To Location: "Branch 1 - Downtown"
   - Description: "Paracetamol 500mg"
   - Unit: "box"
   - Quantity: 20
   - Unit Cost: ₱50.00
   - Notes: "Initial stock for Branch 1"
5. Click **"Complete Transfer"**

✅ **Result**: 
- Warehouse stock: 100 - 20 = **80 boxes**
- Branch 1 stock: 0 + 20 = **20 boxes**
- Transfer recorded in history

---

### **SCENARIO 3: Branch Records a Sale**

**Who**: Branch Manager  
**Steps**:

1. Login as branch manager
2. Go to **Sales** page
3. Click **"Record Sale"**
4. Fill in details:
   - Branch: "Branch 1 - Downtown" (auto-selected)
   - Description: "Paracetamol 500mg"
   - Unit: "box"
   - Quantity: 2
   - Selling Price: ₱75.00 (per box)
   - Customer Name: "Juan Dela Cruz" (optional)
   - Notes: "Walk-in customer"
5. Click **"Record Sale"**

✅ **Result**:
- Branch 1 stock: 20 - 2 = **18 boxes**
- Sale recorded: 2 boxes × ₱75 = **₱150.00**
- Profit calculated: (₱75 - ₱50) × 2 = **₱50.00**

---

### **SCENARIO 4: Transfer Between Branches**

**Who**: Branch Manager  
**Steps**:

1. Login as branch manager (Branch 1)
2. Go to **Transfers** page
3. Click **"New Transfer"**
4. Fill in details:
   - From Location: "Branch 1 - Downtown"
   - To Location: "Branch 2 - Uptown"
   - Description: "Paracetamol 500mg"
   - Unit: "box"
   - Quantity: 5
   - Unit Cost: ₱50.00
   - Notes: "Branch 2 running low"
5. Click **"Complete Transfer"**

✅ **Result**:
- Branch 1 stock: 18 - 5 = **13 boxes**
- Branch 2 stock: 0 + 5 = **5 boxes**
- Transfer recorded

---

### **SCENARIO 5: View Reports (Admin)**

**Who**: Admin  
**Steps**:

1. Login as admin
2. Go to **Dashboard** page
3. View reports:

**Inventory Summary by Location:**
- See total items, quantities, and values per location
- Identify which locations have most/least stock

**Low Stock Alerts:**
- Automatically shows items with quantity < 10
- Red highlighting for urgent restocking

**Sales Reports:**
- Go to **Reports** page
- View total sales, profit margins
- Filter by date range, location, or product

---

## 📊 Understanding the Dashboard

### **Inventory Summary Table**
```
Location          | Type      | Total Items | Total Quantity | Total Value
Main Warehouse    | warehouse | 50          | 5,000          | ₱250,000
Branch 1          | branch    | 45          | 500            | ₱25,000
Branch 2          | branch    | 40          | 450            | ₱22,500
```

### **Low Stock Alert Table**
```
Location    | Description         | Unit | Quantity
Branch 1    | Paracetamol 500mg  | box  | 8
Branch 3    | Vitamin C          | btl  | 5
```

---

## 🔍 Common Tasks Quick Reference

### **Check Inventory**
1. Go to **Inventory** page
2. Select location from dropdown
3. View all items with quantities and costs

### **Search Transfer History**
1. Go to **Transfers** page
2. View complete history with dates, locations, and quantities
3. See who performed each transfer

### **View Sales History**
1. Go to **Sales** page
2. See all sales with dates, amounts, and customers
3. Track who made each sale

### **Monitor Stock Levels**
1. Go to **Dashboard**
2. Check "Low Stock Alert" section
3. Plan restocking from warehouse

---

## ⚠️ Important Rules

### **Stock Validation**
- ❌ Cannot transfer more than available quantity
- ❌ Cannot sell more than branch has in stock
- ❌ Cannot transfer to same location
- ✅ System automatically validates before processing

### **Role Restrictions**
- Branch Staff: **Read-only** access
- Branch Manager: Can only access **their branch**
- Warehouse Staff: Can only access **their warehouse**
- Admin: Can access **everything**

### **Automatic Calculations**
- Stock automatically deducted on transfer
- Stock automatically deducted on sale
- Profit automatically calculated (selling price - unit cost)
- Total values automatically computed

---

## 🎓 Training Checklist for New Users

### **Warehouse Staff Training**
- [ ] Login to system
- [ ] Add new inventory item
- [ ] Create transfer to branch
- [ ] View transfer history
- [ ] Check warehouse stock levels

### **Branch Manager Training**
- [ ] Login to system
- [ ] View branch inventory
- [ ] Record a sale
- [ ] Create transfer to another branch
- [ ] Check low stock alerts

### **Branch Staff Training**
- [ ] Login to system
- [ ] View inventory (read-only)
- [ ] Understand stock levels
- [ ] Report low stock to manager

### **Admin Training**
- [ ] View all locations
- [ ] Monitor dashboard
- [ ] Check inventory summary
- [ ] Review sales reports
- [ ] Manage user accounts

---

## 🆘 Troubleshooting

### **"Insufficient stock" Error**
- Check current inventory quantity
- Verify you're not trying to transfer/sell more than available

### **"Cannot find inventory item" Error**
- Item doesn't exist at that location
- Check spelling of description and unit
- Verify correct location selected

### **Cannot See Inventory**
- Verify you're logged in
- Check you selected correct location
- Ensure location has inventory items

### **Transfer Not Showing**
- Refresh the page
- Check transfer history table
- Verify both locations exist

---

## 📞 Support

For technical issues or questions:
1. Check this guide first
2. Contact system administrator
3. Review error messages carefully
4. Check user role permissions

---

## 🎉 Best Practices

1. **Daily**: Check low stock alerts
2. **Weekly**: Review sales reports
3. **Monthly**: Audit inventory levels
4. **Always**: Record sales immediately
5. **Always**: Document transfers with notes
6. **Always**: Use correct units (box, bottle, kg, etc.)
7. **Always**: Double-check quantities before submitting

---

**System is now ready to use! Start with STEP 1 and follow the workflow.**
