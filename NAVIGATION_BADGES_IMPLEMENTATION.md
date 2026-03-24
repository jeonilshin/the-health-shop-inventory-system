# Navigation Badge Counters Implementation

## Overview
Added red badge counters to navigation items showing pending/unread counts for different user roles.

## Features Implemented

### 1. Backend API Endpoint
**File:** `server/routes/counts.js`
- New unified endpoint: `GET /api/counts`
- Returns counts for: messages, transfers, deliveries, discrepancies
- Role-based filtering:
  - **Admin**: All counts (pending transfers, awaiting admin deliveries, pending discrepancies, unread messages)
  - **Branch Manager**: Deliveries ready to accept, unread messages
  - **Warehouse**: Unread messages
  - **Branch Staff**: Unread messages

### 2. Frontend Navigation Updates
**File:** `client/src/components/Navbar.js`
- Replaced single `unreadMessages` state with unified `counts` object
- Fetches all counts every 15 seconds
- Displays badges on relevant navigation items:
  - **Messages**: Shows unread message count (all roles)
  - **Transfers**: Shows pending transfer count (admin only)
  - **Deliveries**: Shows deliveries needing action (admin & branch managers)
  - **Discrepancy**: Shows pending discrepancy count (admin only)

### 3. Badge Display Logic
```javascript
// Messages: All users see unread messages
if (item.to === '/messages') badgeCount = counts.messages;

// Transfers: Admin sees pending approvals
else if (item.to === '/transfers' && user.role === 'admin') badgeCount = counts.transfers;

// Deliveries: Admin sees awaiting confirmation, Branch sees ready to accept
else if (item.to === '/deliveries') badgeCount = counts.deliveries;

// Discrepancy: Admin sees pending reports
else if (item.to === '/discrepancy' && user.role === 'admin') badgeCount = counts.discrepancies;
```

## Badge Counts by Role

### Admin
- **Messages**: Unread messages
- **Transfers**: Pending transfer requests needing approval
- **Deliveries**: Deliveries awaiting admin confirmation
- **Discrepancy**: Pending shortage/return reports

### Branch Manager
- **Messages**: Unread messages
- **Deliveries**: Deliveries ready to accept (admin_confirmed or in_transit)

### Warehouse
- **Messages**: Unread messages

### Branch Staff
- **Messages**: Unread messages

## Visual Design
- Red circular badge with white text
- Positioned at the right side of navigation items
- Shows "99+" for counts over 99
- Animated pulse effect (existing CSS)
- Auto-updates every 15 seconds

## Database Queries

### Messages Count
```sql
SELECT COUNT(*) FROM messages 
WHERE recipient_id = $1 AND read = false
```

### Transfers Count (Admin)
```sql
SELECT COUNT(*) FROM transfers 
WHERE status = 'pending'
```

### Deliveries Count (Admin)
```sql
SELECT COUNT(*) FROM deliveries 
WHERE status = 'awaiting_admin'
```

### Deliveries Count (Branch Manager)
```sql
SELECT COUNT(*) FROM deliveries 
WHERE to_location_id = $1 
AND status IN ('admin_confirmed', 'in_transit')
```

### Discrepancies Count (Admin)
```sql
SELECT COUNT(*) FROM delivery_discrepancies 
WHERE status = 'pending'
```

## Files Modified
1. `server/routes/counts.js` - New file
2. `server/index.js` - Added counts route
3. `client/src/components/Navbar.js` - Updated to use unified counts

## Testing
- No syntax errors detected
- All diagnostics passed
- Badge styling already exists in CSS
- Auto-refresh every 15 seconds ensures real-time updates
