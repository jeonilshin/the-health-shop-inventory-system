# Health Shop Inventory System — Improved

## Quick Setup

### 1. Create `.env` file
```bash
cp .env.example .env
# Edit .env with your PostgreSQL connection string
```

### 2. Install dependencies
```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 3. Set up database
```bash
cd server
node database/seed.js
```
This creates all tables and inserts demo data.

### 4. Start servers
```bash
# Terminal 1 — Backend (port 5001)
cd server && npm run dev

# Terminal 2 — Frontend (port 3001)
cd client && npm start
```

Open http://localhost:3001

---

## Demo Accounts

| Username    | Password  | Role      | Location     |
|-------------|-----------|-----------|--------------|
| admin       | admin123  | Admin     | All          |
| warehouse1  | pass123   | Warehouse | Warehouse A  |
| manager1    | pass123   | Manager   | Branch 1 & 2 |
| staff1      | pass123   | Staff     | Branch 1     |
| audit1      | pass123   | Audit     | Read-only    |

---

## What Was Fixed

1. **"No batches available for this item"** — The receive endpoint now CREATES inventory at the destination using data stored in the transfer itself. It never looks at the source warehouse at acceptance time.

2. **Negative inventory** — Database constraint `CHECK (quantity >= 0)` + transaction validation before every deduction.

3. **Broken history** — Every action (add, transfer sent/received, sale, cancellation) logs to a unified `activity_log` table visible on the History page.

---

## Role Capabilities

| Feature         | Admin | Warehouse | Manager | Staff | Audit |
|-----------------|-------|-----------|---------|-------|-------|
| Add inventory   | ✓     | ✓         |         |       |       |
| Create transfer | ✓     | ✓         |         |       |       |
| Approve transfer| ✓     |           | ✓       |       |       |
| Receive transfer| ✓     |           | ✓       | ✓     |       |
| Record sale     | ✓     |           | ✓       | ✓     |       |
| Cancel sale     | ✓     |           |         |       |       |
| View history    | ✓     | own loc   | branches| own   | ✓ all |
| Admin panel     | ✓     |           |         |       |       |
