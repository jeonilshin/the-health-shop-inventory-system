# The Health Shop Inventory Management System - Complete Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Features Guide](#features-guide)
5. [Database Schema](#database-schema)
6. [API Documentation](#api-documentation)
7. [Deployment Guide](#deployment-guide)
8. [Troubleshooting](#troubleshooting)

---

## System Overview

### What is This System?

The Health Shop Inventory Management System is a comprehensive web application designed to manage inventory, sales, transfers, and deliveries across multiple branches and warehouses.

### Key Features

- Multi-location inventory management (28 branches + 2 warehouses)
- Real-time inventory tracking
- Sales recording and reporting
- Inter-location transfers
- Delivery management
- Analytics dashboard
- User management with role-based access
- Data export (CSV)
- Search and filtering

### Technology Stack

**Frontend:**
- React 18.2.0
- React Router 6.20.0
- Axios for API calls
- React Icons for UI icons

**Backend:**
- Node.js with Express
- PostgreSQL database (Neon)
- JWT authentication
- Bcrypt for password hashing

**Deployment:**
- Frontend: Vercel
- Backend: Railway
- Database: Neon (PostgreSQL)

---

## Getting Started

### Default Login Credentials

**Username:** admin  
**Password:** admin123

**IMPORTANT:** Change this password immediately after first login!

### First Time Setup

1. **Login as Admin**
   - Navigate to your deployed URL or http://localhost:3000
   - Enter username: admin
   - Enter password: admin123

2. **Change Admin Password**
   - Click "Change Password" in the navbar
   - Enter current password: admin123
   - Enter new password (minimum 6 characters)
   - Confirm new password

3. **Create Locations**
   - Go to Admin > Locations tab
   - Click "Add Location"
   - Create your warehouses first
   - Then create your branches
   - Fill in: Name, Type, Address, Contact Number

4. **Create Users**
   - Go to Admin > Users tab
   - Click "Add User"
   - Fill in user details
   - Assign appropriate role
   - Assign location (except for admin users)

5. **Add Initial Inventory**
   - Go to Inventory page
   - Select a location
   - Click "Add Item"
   - Fill in product details

---

## User Roles & Permissions

### Admin

**Access Level:** Full system access

**Permissions:**
- View and manage all locations
- Create, edit, delete locations
- Create, edit, delete users (except admin account)
- View and manage all inventory
- Delete inventory items
- Create and manage transfers
- Record and view sales
- Create and manage deliveries
- View analytics
- Export data
- Change own password
- Change other users' passwords

**Restrictions:**
- Cannot delete the admin account (protected)

---

### Warehouse Staff

**Access Level:** Warehouse operations

**Permissions:**
- View and manage warehouse inventory
- Create transfers to branches
- Create and manage deliveries
- View analytics
- Export data
- Change own password

**Restrictions:**
- Cannot access admin dashboard
- Cannot manage users or locations
- Cannot delete inventory
- Cannot record sales

---

### Branch Manager

**Access Level:** Branch operations

**Permissions:**
- View and manage branch inventory
- Create transfers between branches
- Record sales
- View reports
- View analytics
- Export data
- Change own password

**Restrictions:**
- Cannot access admin dashboard
- Cannot manage users or locations
- Cannot delete inventory
- Cannot manage deliveries
- Limited to assigned branch

---

### Branch Staff

**Access Level:** Basic operations

**Permissions:**
- View inventory
- Record sales (if allowed)
- View reports
- View analytics
- Export data
- Change own password

**Restrictions:**
- Cannot access admin dashboard
- Cannot manage users or locations
- Cannot delete inventory
- Cannot create transfers
- Cannot manage deliveries
- Limited to assigned branch

---

## Features Guide

### 1. Dashboard

**Purpose:** Overview of inventory and quick stats

**What You See:**
- Welcome message with user info
- Quick stats cards
- Recent activity summary

**How to Use:**
- Login to automatically see dashboard
- Click navigation links to access other features

---

### 2. Inventory Management

**Purpose:** Track and manage products across locations

**Features:**
- View inventory by location
- Add new items
- Search items by description or unit
- Export inventory to CSV
- Delete items (admin only)

**How to Add Inventory:**
1. Select location from dropdown
2. Click "Add Item"
3. Fill in:
   - Description (product name)
   - Unit (kg, pcs, box, etc.)
   - Quantity
   - Unit Cost
   - Suggested Selling Price (optional)
4. Click "Add to Inventory"

**How to Search:**
1. Select location
2. Type in search box
3. Results filter in real-time

**How to Export:**
1. Select location
2. Click "Export CSV"
3. File downloads automatically
4. Open in Excel or Google Sheets

**Number Formatting:**
- Quantities: Smart formatting (10, 10.5, 10.25)
- Prices: Always 2 decimals with commas (₱1,234.56)

---

### 3. Transfers

**Purpose:** Move inventory between locations

**Features:**
- Transfer from warehouse to branches
- Transfer between branches
- Track transfer history
- View transfer details

**How to Create Transfer:**
1. Click "Create Transfer"
2. Select "From Location" (source)
3. Select "To Location" (destination)
4. Fill in:
   - Description
   - Unit
   - Quantity
   - Unit Cost
   - Notes (optional)
5. Click "Create Transfer"

**Transfer Rules:**
- Warehouse can transfer to any branch
- Branches can transfer to other branches
- Cannot transfer to same location
- Quantity must be available at source

---

### 4. Sales

**Purpose:** Record and track sales transactions

**Features:**
- Record sales by branch
- View sales history
- Export sales data
- Track customer information

**How to Record Sale:**
1. Click "Record Sale"
2. Select branch (if admin)
3. Fill in:
   - Description
   - Unit
   - Quantity sold
   - Selling Price (per unit)
   - Customer Name (optional)
   - Notes (optional)
4. Click "Record Sale"

**Sales Data Includes:**
- Date and time
- Branch location
- Product details
- Quantity and price
- Total amount
- Customer name
- Sold by (user)

**How to Export:**
1. Click "Export CSV"
2. File downloads with all sales data
3. Use for accounting or reporting

---

### 5. Reports

**Purpose:** View detailed reports and summaries

**Features:**
- Inventory reports by location
- Sales reports with profit calculations
- Transfer history
- Date range filtering

**Available Reports:**
- Current inventory levels
- Sales transactions
- Transfer records
- Profit margins

---

### 6. Analytics

**Purpose:** Business insights and trends

**What You See:**

**Summary Cards:**
- Total Inventory Value (all locations)
- Sales Last 30 Days
- Profit Last 30 Days
- Total Transactions
- Low Stock Items (quantity < 10)

**Top Products Table:**
- Top 5 selling products
- Total quantity sold
- Total revenue

**Sales by Location:**
- Sales breakdown per branch
- Transaction count
- Total sales amount

**Daily Sales Trend:**
- Last 7 days sales
- Daily transaction count
- Daily total amount

**How to Use:**
- Navigate to Analytics from navbar
- View real-time business metrics
- Identify top performers
- Monitor low stock items
- Track sales trends

---

### 7. Deliveries

**Purpose:** Track deliveries between locations

**Access:** Admin and Warehouse staff only

**Features:**
- Create delivery orders
- Add multiple items per delivery
- Track delivery status
- Update status workflow
- View delivery history

**Delivery Status Workflow:**
1. Pending (initial state)
2. In Transit (shipped)
3. Delivered (received)
4. Cancelled (if needed)

**How to Create Delivery:**
1. Click "Create Delivery"
2. Select "From Location"
3. Select "To Location"
4. Set delivery date
5. Add notes (optional)
6. Add items:
   - Click "Add Item" for multiple products
   - Fill in: Description, Unit, Quantity, Unit Cost
   - Remove items if needed
7. Click "Create Delivery"

**How to Update Status:**
1. Find delivery in list
2. Click status button:
   - "In Transit" (when shipped)
   - "Delivered" (when received)
   - "Cancel" (if needed)
3. Status updates immediately

**Status Colors:**
- Pending: Orange
- In Transit: Blue
- Delivered: Green
- Cancelled: Red

---

### 8. Admin Dashboard

**Purpose:** Manage system settings, locations, and users

**Access:** Admin only

**Two Main Tabs:**

#### Locations Tab

**Features:**
- View all locations (branches and warehouses)
- Create new locations
- Edit existing locations
- Delete locations

**How to Add Location:**
1. Click "Add Location"
2. Fill in:
   - Location Name (e.g., "Branch 1 - Downtown")
   - Type (Branch or Warehouse)
   - Address (full address)
   - Contact Number
3. Click "Create Location"

**Location Card Shows:**
- Location name
- Type badge (color-coded)
- Address
- Contact number
- Edit and Delete buttons

**How to Edit Location:**
1. Click "Edit" on location card
2. Update information
3. Click "Update Location"

**How to Delete Location:**
1. Click "Delete" on location card
2. Confirm deletion
3. WARNING: This deletes all associated inventory

#### Users Tab

**Features:**
- View all users
- Create new users
- Edit existing users
- Delete users (except admin)
- Change user passwords

**How to Add User:**
1. Click "Add User"
2. Fill in:
   - Username (unique)
   - Password (minimum 6 characters)
   - Full Name
   - Role (Admin, Warehouse, Branch Manager, Branch Staff)
   - Assigned Location (optional for admin)
3. Click "Create User"

**User Table Shows:**
- Username
- Full Name
- Role (color-coded badge)
- Location (shows "Administrator" for admin)
- Created date
- Edit and Delete buttons

**Role Badges:**
- Admin: Orange
- Warehouse: Blue
- Branch Manager: Green
- Branch Staff: Gray

**How to Edit User:**
1. Click "Edit" on user row
2. Update information
3. Leave password blank to keep current
4. Click "Update User"

**How to Delete User:**
1. Click "Delete" on user row
2. Confirm deletion
3. NOTE: Admin account shows "Protected" instead

**Admin Account Protection:**
- Cannot be deleted
- Shows "Protected" label
- Location shows "Administrator"
- Can still be edited

---

### 9. Change Password

**Purpose:** Update user password

**Access:** All users

**How to Change Your Password:**
1. Click "Change Password" in navbar
2. Enter current password
3. Enter new password (minimum 6 characters)
4. Confirm new password
5. Click "Change Password"

**Admin Changing Other User Passwords:**
1. Go to Admin > Users tab
2. Click "Edit" on user
3. Enter new password
4. Click "Update User"

---

## Database Schema

### Tables Overview

**users**
- Stores user accounts and authentication
- Fields: id, username, password, full_name, role, location_id, created_at, updated_at

**locations**
- Stores branches and warehouses
- Fields: id, name, type, address, contact_number, created_at

**inventory**
- Stores product inventory by location
- Fields: id, location_id, description, unit, quantity, unit_cost, suggested_selling_price, created_at, updated_at

**transfers**
- Stores transfer records between locations
- Fields: id, from_location_id, to_location_id, inventory_id, description, unit, quantity, unit_cost, transfer_date, transferred_by, notes

**sales**
- Stores sales transactions
- Fields: id, location_id, inventory_id, description, unit, quantity, unit_cost, selling_price, total_amount, sale_date, sold_by, customer_name, notes

**deliveries**
- Stores delivery orders
- Fields: id, from_location_id, to_location_id, delivery_date, status, notes, created_by, created_at, updated_at

**delivery_items**
- Stores items in each delivery
- Fields: id, delivery_id, description, unit, quantity, unit_cost, created_at

### Relationships

- users.location_id → locations.id
- inventory.location_id → locations.id
- transfers.from_location_id → locations.id
- transfers.to_location_id → locations.id
- transfers.transferred_by → users.id
- sales.location_id → locations.id
- sales.sold_by → users.id
- deliveries.from_location_id → locations.id
- deliveries.to_location_id → locations.id
- deliveries.created_by → users.id
- delivery_items.delivery_id → deliveries.id

---

## API Documentation

### Authentication Endpoints

**POST /api/auth/login**
- Login user
- Body: { username, password }
- Returns: { token, user }

**POST /api/auth/change-password**
- Change user password
- Headers: Authorization: Bearer {token}
- Body: { currentPassword, newPassword }
- Returns: { message }

### User Endpoints

**GET /api/users**
- Get all users (admin only)
- Headers: Authorization: Bearer {token}
- Returns: Array of users

**POST /api/users**
- Create user (admin only)
- Headers: Authorization: Bearer {token}
- Body: { username, password, full_name, role, location_id }
- Returns: Created user

**PUT /api/users/:id**
- Update user (admin only)
- Headers: Authorization: Bearer {token}
- Body: { username, full_name, role, location_id, password? }
- Returns: Updated user

**DELETE /api/users/:id**
- Delete user (admin only)
- Headers: Authorization: Bearer {token}
- Returns: { message }
- Note: Cannot delete admin account

### Location Endpoints

**GET /api/locations**
- Get all locations
- Headers: Authorization: Bearer {token}
- Returns: Array of locations

**POST /api/locations**
- Create location (admin only)
- Headers: Authorization: Bearer {token}
- Body: { name, type, address, contact_number }
- Returns: Created location

**PUT /api/locations/:id**
- Update location (admin only)
- Headers: Authorization: Bearer {token}
- Body: { name, type, address, contact_number }
- Returns: Updated location

**DELETE /api/locations/:id**
- Delete location (admin only)
- Headers: Authorization: Bearer {token}
- Returns: { message }

### Inventory Endpoints

**GET /api/inventory/location/:locationId**
- Get inventory for location
- Headers: Authorization: Bearer {token}
- Returns: Array of inventory items

**POST /api/inventory**
- Add inventory item
- Headers: Authorization: Bearer {token}
- Body: { location_id, description, unit, quantity, unit_cost, suggested_selling_price }
- Returns: Created item

**DELETE /api/inventory/:id**
- Delete inventory item (admin only)
- Headers: Authorization: Bearer {token}
- Returns: { message }

### Transfer Endpoints

**GET /api/transfers**
- Get all transfers
- Headers: Authorization: Bearer {token}
- Returns: Array of transfers

**POST /api/transfers**
- Create transfer
- Headers: Authorization: Bearer {token}
- Body: { from_location_id, to_location_id, description, unit, quantity, unit_cost, notes }
- Returns: Created transfer

### Sales Endpoints

**GET /api/sales**
- Get all sales
- Headers: Authorization: Bearer {token}
- Returns: Array of sales

**POST /api/sales**
- Record sale
- Headers: Authorization: Bearer {token}
- Body: { location_id, description, unit, quantity, selling_price, customer_name, notes }
- Returns: Created sale

### Delivery Endpoints

**GET /api/deliveries**
- Get all deliveries
- Headers: Authorization: Bearer {token}
- Returns: Array of deliveries with items

**POST /api/deliveries**
- Create delivery
- Headers: Authorization: Bearer {token}
- Body: { from_location_id, to_location_id, delivery_date, status, notes, items: [] }
- Returns: Created delivery

**PUT /api/deliveries/:id**
- Update delivery status
- Headers: Authorization: Bearer {token}
- Body: { status }
- Returns: Updated delivery

**DELETE /api/deliveries/:id**
- Delete delivery (admin only)
- Headers: Authorization: Bearer {token}
- Returns: { message }

### Analytics Endpoints

**GET /api/export/analytics**
- Get analytics data
- Headers: Authorization: Bearer {token}
- Returns: { summary, topProducts, salesByLocation, dailySales }

### Report Endpoints

**GET /api/reports/inventory**
- Get inventory report
- Headers: Authorization: Bearer {token}
- Returns: Inventory data by location

**GET /api/reports/sales**
- Get sales report
- Headers: Authorization: Bearer {token}
- Query: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
- Returns: Sales data with profit

---

## Deployment Guide

### Prerequisites

1. GitHub account
2. Vercel account (for frontend)
3. Railway account (for backend)
4. Neon account (for database)

### Database Setup (Neon)

1. Create Neon account at https://neon.tech
2. Create new project
3. Copy connection string
4. Run schema:
   - Open SQL Editor
   - Copy contents from `server/database/schema.sql`
   - Execute SQL
5. Run deliveries schema:
   - Copy contents from `server/database/deliveries.sql`
   - Execute SQL

### Backend Deployment (Railway)

1. Create Railway account at https://railway.app
2. Create new project
3. Connect GitHub repository
4. Set environment variables:
   - DATABASE_URL (from Neon)
   - JWT_SECRET (random string)
   - PORT (5000)
   - FRONTEND_URL (your Vercel URL)
5. Deploy
6. Copy Railway URL

### Frontend Deployment (Vercel)

1. Create Vercel account at https://vercel.com
2. Import GitHub repository
3. Set build settings:
   - Framework: Create React App
   - Root Directory: client
   - Build Command: npm run build
   - Output Directory: build
4. Set environment variables:
   - REACT_APP_API_URL (your Railway URL)
5. Deploy
6. Copy Vercel URL

### Update CORS

1. Update `server/index.js`:
   - Add Vercel URL to CORS origins
2. Push to GitHub
3. Railway auto-deploys

### Verify Deployment

1. Visit Vercel URL
2. Login with admin credentials
3. Test all features
4. Check browser console for errors
5. Check Railway logs for backend errors

---

## Troubleshooting

### Common Issues

**Issue: Cannot login**
- Check if backend is running
- Verify DATABASE_URL is correct
- Check if users table has admin user
- Verify password is correct (default: admin123)

**Issue: CORS errors**
- Add frontend URL to CORS origins in server/index.js
- Redeploy backend
- Clear browser cache

**Issue: Database connection failed**
- Verify DATABASE_URL in Railway
- Check Neon database is active
- Verify connection string format

**Issue: Deliveries page shows error**
- Run deliveries.sql in Neon SQL Editor
- Verify tables were created
- Check browser console for specific error

**Issue: Export doesn't work**
- Check if data exists
- Try different browser
- Check browser console for errors

**Issue: Search doesn't filter**
- Select a location first
- Check if inventory has items
- Clear browser cache

**Issue: Cannot delete admin account**
- This is intentional (protected account)
- Admin account cannot be deleted
- Shows "Protected" label

### Getting Help

**Check Logs:**
- Railway: View logs in Railway dashboard
- Vercel: View logs in Vercel dashboard
- Browser: Open Developer Tools > Console

**Database Issues:**
- Check Neon dashboard
- Verify tables exist
- Check connection string

**API Issues:**
- Test endpoints with Postman
- Check Railway logs
- Verify authentication token

---

## Best Practices

### Security

1. Change default admin password immediately
2. Use strong passwords (minimum 6 characters)
3. Don't share admin credentials
4. Regularly backup database
5. Keep dependencies updated

### Data Management

1. Export data regularly (CSV backups)
2. Verify inventory counts periodically
3. Review sales reports monthly
4. Clean up old transfer records
5. Monitor low stock items

### User Management

1. Assign appropriate roles
2. Assign users to specific locations
3. Remove inactive users
4. Update user information regularly
5. Train users on their role permissions

### Inventory Management

1. Use consistent naming conventions
2. Use standard units (kg, pcs, box)
3. Update costs regularly
4. Set suggested selling prices
5. Monitor stock levels

### System Maintenance

1. Monitor system performance
2. Check error logs regularly
3. Update documentation
4. Test new features before deployment
5. Keep backups of configuration

---

## Support & Updates

### Version Information

Current Version: 2.0.0  
Last Updated: February 16, 2026

### Change Log

**Version 2.0.0**
- Added Analytics Dashboard
- Added Delivery Management
- Added Export to CSV
- Added Search functionality
- Protected admin account from deletion
- Improved number formatting
- Updated UI design

**Version 1.0.0**
- Initial release
- Basic inventory management
- Sales recording
- Transfer management
- User authentication
- Admin dashboard

---

## Appendix

### Keyboard Shortcuts

Currently no keyboard shortcuts implemented.

### File Structure

```
the-health-shop-inventory-system/
├── client/                 # Frontend React app
│   ├── public/
│   └── src/
│       ├── components/     # React components
│       ├── context/        # React context
│       ├── utils/          # Utility functions
│       ├── App.js
│       ├── index.js
│       └── index.css
├── server/                 # Backend Node.js app
│   ├── config/            # Database config
│   ├── database/          # SQL schemas
│   ├── middleware/        # Auth middleware
│   ├── routes/            # API routes
│   └── index.js
├── .env                   # Environment variables
├── package.json
└── README.md
```

### Environment Variables

**Backend (.env):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
PORT=5000
FRONTEND_URL=https://your-vercel-url.vercel.app
```

**Frontend (client/.env.production):**
```
REACT_APP_API_URL=https://your-railway-url.railway.app
```

---

End of Guide
