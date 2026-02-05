# The Health Shop - Inventory Management System

A comprehensive web-based inventory management system for managing 28 branches and 2 warehouses with automatic stock transfers and real-time tracking.

## Features

- **Multi-Location Support**: Manage 28 branches and 2 warehouses independently
- **Automatic Inventory Transfers**: Stock automatically moves between locations
- **Role-Based Access Control**:
  - Admin: Full system access
  - Warehouse Staff: Add inventory and send to branches
  - Branch Manager: Edit inventory, transfers, and record sales
  - Branch Staff: Read-only access
- **Real-Time Tracking**: Monitor inventory levels across all locations
- **Sales Management**: Record sales with automatic inventory deduction
- **Comprehensive Reports**: 
  - Inventory summary by location
  - Sales reports with profit tracking
  - Low stock alerts
  - Transfer history

## Technology Stack

- **Frontend**: React 18
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Authentication**: JWT tokens

## Installation

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <repository-folder>
   ```

2. **Install backend dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Setup PostgreSQL database**
   - Create a new database named `the_health_shop_inventory`
   - Run the schema file:
     ```bash
     psql -U your_username -d the_health_shop_inventory -f server/database/schema.sql
     ```

5. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Update the database connection string and JWT secret:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/the_health_shop_inventory
     JWT_SECRET=your-secure-secret-key
     PORT=5000
     ```

6. **Create initial admin user**
   After running the schema, you'll have a default admin account:
   - Username: `admin`
   - Password: `admin123` (CHANGE THIS IMMEDIATELY!)

7. **Start the application**
   ```bash
   npm run dev
   ```
   This will start both the backend server (port 5000) and frontend (port 3000)

## Usage

### Initial Setup

1. Login with admin credentials
2. Create locations (warehouses and branches) via API or database
3. Create user accounts for warehouse staff, branch managers, and branch staff
4. Start adding inventory to warehouses

### Daily Operations

**Warehouse Staff:**
- Add new inventory items
- Send inventory to branches (automatic stock deduction)

**Branch Manager:**
- View branch inventory
- Transfer items between branches
- Record sales (automatic stock deduction)
- Edit inventory details

**Branch Staff:**
- View inventory levels (read-only)

**Admin:**
- Full access to all features
- Monitor all locations
- View comprehensive reports

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Locations
- `GET /api/locations` - Get all locations
- `POST /api/locations` - Create location (admin only)

### Inventory
- `GET /api/inventory/location/:locationId` - Get inventory by location
- `POST /api/inventory` - Add inventory item
- `PUT /api/inventory/:id` - Update inventory item
- `DELETE /api/inventory/:id` - Delete inventory item

### Transfers
- `POST /api/transfers` - Create transfer
- `GET /api/transfers` - Get transfer history

### Sales
- `POST /api/sales` - Record sale
- `GET /api/sales` - Get sales history

### Reports
- `GET /api/reports/inventory-summary` - Inventory summary by location
- `GET /api/reports/sales-summary` - Sales summary with profit
- `GET /api/reports/low-stock` - Low stock alerts

## Database Schema

- **users**: User accounts with roles
- **locations**: Branches and warehouses
- **inventory**: Stock items per location
- **transfers**: Transfer history between locations
- **sales**: Sales transactions

## Security

- JWT-based authentication
- Role-based access control
- Password hashing with bcrypt
- Protected API endpoints
- Proprietary license - unauthorized use prohibited

## License

Copyright (c) 2026 The Health Shop. All Rights Reserved.

This software is proprietary and confidential. Unauthorized use is strictly prohibited.
See LICENSE file for details.

## Support

For support or licensing inquiries, contact The Health Shop.
