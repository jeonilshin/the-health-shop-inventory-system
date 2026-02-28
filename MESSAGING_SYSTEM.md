# Messaging System Setup

## Overview
A real-time internal messaging system for communication between admin, warehouse staff, and branch managers/staff.

## Features
- ✅ Direct messaging between users
- ✅ Conversation list with unread counts
- ✅ Real-time message updates (10-second polling)
- ✅ Role-based access control
- ✅ Clean, modern chat interface
- ✅ Message history
- ✅ User search for new conversations

## Database Setup

Run the SQL migration to create the messaging tables:

```bash
psql -U your_username -d your_database -f server/database/messages.sql
```

Or connect to your database and run:

```sql
-- See server/database/messages.sql for the full schema
```

## Tables Created

1. **messages** - Stores direct messages between users
2. **message_threads** - For future group conversation support
3. **thread_participants** - For future group conversation support
4. **thread_messages** - For future group conversation support

## Access Control

### Admin
- Can message anyone (warehouse, branch managers, branch staff)
- Can see all conversations

### Warehouse Staff
- Can message admins only
- Can see conversations with admins

### Branch Managers
- Can message admins only
- Can see conversations with admins

### Branch Staff
- Can message admins only
- Can see conversations with admins

## Usage

1. Navigate to the "Messages" section in the sidebar
2. Click "New" to start a new conversation
3. Search for a user and click to start messaging
4. Type your message and click "Send"
5. Messages auto-refresh every 10 seconds

## API Endpoints

- `GET /api/messages/conversations` - Get all conversations
- `GET /api/messages/conversation/:userId` - Get messages with specific user
- `POST /api/messages/send` - Send a message
- `GET /api/messages/unread-count` - Get unread message count
- `GET /api/messages/users` - Get list of users to message
- `PUT /api/messages/mark-read/:userId` - Mark conversation as read

## Future Enhancements

- [ ] Group conversations (threads)
- [ ] File attachments
- [ ] Message reactions
- [ ] Push notifications
- [ ] WebSocket for real-time updates (instead of polling)
- [ ] Message search
- [ ] Message deletion
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Message editing

## Technical Details

### Frontend
- Component: `client/src/components/Messages.js`
- Auto-refresh: 10 seconds
- Responsive design with 2-column layout
- Unread message badges
- Role-based color coding

### Backend
- Routes: `server/routes/messages.js`
- Authentication: JWT token required
- Database: PostgreSQL with proper indexes

## Styling

The messaging interface uses the existing design system:
- Primary color for sent messages
- White background for received messages
- Role-based badge colors
- Smooth scrolling to latest message
- Hover effects on conversations

## Testing

1. Login as admin
2. Navigate to Messages
3. Click "New" and select a user
4. Send a test message
5. Login as that user
6. Check if message appears
7. Reply to the message
8. Verify conversation updates

## Troubleshooting

### Messages not appearing
- Check database connection
- Verify messages table exists
- Check browser console for errors

### Can't see users to message
- Verify user roles in database
- Check authentication token
- Ensure users table has full_name column

### Unread count not updating
- Check auto-refresh is working
- Verify mark-read endpoint is called
- Check database indexes

## Security

- All endpoints require authentication
- Users can only message according to role permissions
- SQL injection protection via parameterized queries
- XSS protection via React's built-in escaping

---

**Status**: ✅ Ready to use after running database migration
