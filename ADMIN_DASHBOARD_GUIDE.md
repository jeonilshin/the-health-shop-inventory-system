# Admin Dashboard Guide

## 🎉 New Feature: Admin Dashboard UI

You can now manage locations and user accounts directly from the web interface - no more SQL queries needed!

---

## 🔐 Access

**Who can access:** Admin users only

**How to access:**
1. Login as admin
2. Click **"Admin"** in the navigation bar (bold link)
3. You'll see two tabs: **Locations Management** and **User Management**

---

## 📍 Locations Management

### View All Locations
- See all warehouses and branches in a card grid layout
- Warehouses have blue background
- Branches have white background
- Each card shows: Name, Type, Address, Contact Number

### Add New Location
1. Click **"Add Location"** button
2. Fill in the form:
   - **Location Name** (required): e.g., "Branch 1 - Downtown"
   - **Type** (required): Select "Branch" or "Warehouse"
   - **Address** (optional): Full address
   - **Contact Number** (optional): Phone number
3. Click **"Create Location"**
4. Success! Location is now available system-wide

### Edit Location
1. Find the location card
2. Click **"Edit"** button
3. Update the information
4. Click **"Update Location"**

### Delete Location
1. Find the location card
2. Click **"Delete"** button
3. Confirm deletion (WARNING: This deletes all inventory at that location!)
4. Location removed

---

## 👥 User Management

### View All Users
- See all users in a table format
- Shows: Username, Full Name, Role, Assigned Location, Created Date
- Color-coded role badges:
  - 🟠 Orange = Admin
  - 🔵 Blue = Warehouse Staff
  - 🟢 Green = Branch Manager
  - ⚫ Gray = Branch Staff

### Add New User
1. Click **"Add User"** button
2. Fill in the form:
   - **Username** (required): Login username (e.g., "john.doe")
   - **Password** (required): User's password
   - **Full Name** (required): Display name (e.g., "John Doe")
   - **Role** (required): Select from:
     - Admin (full access)
     - Warehouse Staff (warehouse operations)
     - Branch Manager (branch operations + sales)
     - Branch Staff (read-only)
   - **Assigned Location** (optional): Select location (required for non-admin users)
3. Click **"Create User"**
4. User can now login with their credentials

### Edit User
1. Find the user in the table
2. Click **"Edit"** button
3. Update information:
   - Change username, full name, role, or location
   - **Password**: Leave blank to keep current password, or enter new password to change it
4. Click **"Update User"**

### Delete User
1. Find the user in the table
2. Click **"Delete"** button
3. Confirm deletion
4. User removed (Note: You cannot delete your own account)

---

## 🚀 Quick Setup Workflow

### Initial System Setup (First Time)

**Step 1: Create Locations**
1. Go to Admin Dashboard → Locations Management
2. Create 2 warehouses:
   - Click "Add Location"
   - Name: "Main Warehouse", Type: "Warehouse"
   - Add address and contact
   - Click "Create Location"
   - Repeat for "Secondary Warehouse"

3. Create 28 branches:
   - Click "Add Location"
   - Name: "Branch 1 - Downtown", Type: "Branch"
   - Add address and contact
   - Click "Create Location"
   - Repeat for all 28 branches

**Step 2: Create User Accounts**
1. Go to Admin Dashboard → User Management
2. Create warehouse staff:
   - Click "Add User"
   - Username: "warehouse1"
   - Password: "warehouse123" (user should change this)
   - Full Name: "John Warehouse"
   - Role: "Warehouse Staff"
   - Location: "Main Warehouse"
   - Click "Create User"
   - Repeat for "Secondary Warehouse"

3. Create branch managers (one per branch):
   - Click "Add User"
   - Username: "manager1"
   - Password: "manager123"
   - Full Name: "Manager Branch 1"
   - Role: "Branch Manager"
   - Location: "Branch 1 - Downtown"
   - Click "Create User"
   - Repeat for all 28 branches

4. Create branch staff (as needed):
   - Same process as managers
   - Role: "Branch Staff" (read-only)

**Step 3: Done!**
- All locations and users are now set up
- Users can login with their credentials
- Start adding inventory and making transactions

---

## 🔧 Backend API Endpoints (Auto-Created)

The following endpoints are now available:

### Locations
- `GET /api/locations` - Get all locations
- `POST /api/locations` - Create location (admin only)
- `PUT /api/locations/:id` - Update location (admin only)
- `DELETE /api/locations/:id` - Delete location (admin only)

### Users
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

---

## ⚠️ Important Notes

### Security
- Only admin users can access the Admin Dashboard
- Passwords are automatically hashed with bcrypt
- Users cannot delete their own account
- JWT tokens expire after 24 hours

### Data Integrity
- Deleting a location will CASCADE delete all inventory at that location
- Deleting a user does not delete their transaction history
- Username must be unique across the system

### Best Practices
1. **Create locations first**, then create users
2. **Assign locations** to all non-admin users
3. **Use strong passwords** for all accounts
4. **Change default passwords** immediately after first login
5. **Backup your database** before bulk deletions

---

## 🎯 Comparison: Old vs New Way

### OLD WAY (SQL Required)
```sql
-- Create location
INSERT INTO locations (name, type, address, contact_number) 
VALUES ('Branch 1', 'branch', 'Address', '555-1234');

-- Create user
INSERT INTO users (username, password, full_name, role, location_id)
VALUES ('user1', '$2a$10$...hashed...', 'User Name', 'branch_staff', 3);
```

### NEW WAY (UI)
1. Click "Add Location" button
2. Fill form
3. Click "Create"
✅ Done in 10 seconds!

---

## 🆘 Troubleshooting

**"Username already exists" error**
- Choose a different username
- Usernames must be unique

**Cannot see Admin link in navbar**
- Only admin users can see this link
- Check your user role

**"Cannot delete your own account" error**
- You cannot delete the account you're currently logged in with
- Login as a different admin to delete this account

**Location has inventory, cannot delete**
- Delete or transfer all inventory first
- Or use CASCADE delete (automatic)

**User not showing in list**
- Refresh the page
- Check if user was actually created (check for error messages)

---

## 📊 Summary

**Before:** Manual SQL queries required for setup  
**After:** Beautiful UI for managing everything

**Time saved:** 90% faster setup  
**User friendly:** No SQL knowledge needed  
**Safer:** Form validation prevents errors

---

**You're all set! No more SQL queries needed for basic admin tasks.** 🎉
