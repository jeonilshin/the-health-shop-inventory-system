-- Fix foreign key constraints on messages table to handle user deletion
-- This migration adds CASCADE DELETE to automatically remove messages when a user is deleted

-- Drop existing foreign key constraints
ALTER TABLE messages 
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

ALTER TABLE messages 
  DROP CONSTRAINT IF EXISTS messages_recipient_id_fkey;

-- Recreate foreign key constraints with ON DELETE CASCADE
ALTER TABLE messages 
  ADD CONSTRAINT messages_sender_id_fkey 
  FOREIGN KEY (sender_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

ALTER TABLE messages 
  ADD CONSTRAINT messages_recipient_id_fkey 
  FOREIGN KEY (recipient_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- Fix thread-related tables as well
ALTER TABLE message_threads 
  DROP CONSTRAINT IF EXISTS message_threads_created_by_fkey;

ALTER TABLE message_threads 
  ADD CONSTRAINT message_threads_created_by_fkey 
  FOREIGN KEY (created_by) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

ALTER TABLE thread_participants 
  DROP CONSTRAINT IF EXISTS thread_participants_user_id_fkey;

ALTER TABLE thread_participants 
  ADD CONSTRAINT thread_participants_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

ALTER TABLE thread_messages 
  DROP CONSTRAINT IF EXISTS thread_messages_sender_id_fkey;

ALTER TABLE thread_messages 
  ADD CONSTRAINT thread_messages_sender_id_fkey 
  FOREIGN KEY (sender_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- Also fix other tables that reference users
ALTER TABLE transfers 
  DROP CONSTRAINT IF EXISTS transfers_transferred_by_fkey;

ALTER TABLE transfers 
  ADD CONSTRAINT transfers_transferred_by_fkey 
  FOREIGN KEY (transferred_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

ALTER TABLE transfers 
  DROP CONSTRAINT IF EXISTS transfers_approved_by_fkey;

ALTER TABLE transfers 
  ADD CONSTRAINT transfers_approved_by_fkey 
  FOREIGN KEY (approved_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

ALTER TABLE transfers 
  DROP CONSTRAINT IF EXISTS transfers_delivered_by_fkey;

ALTER TABLE transfers 
  ADD CONSTRAINT transfers_delivered_by_fkey 
  FOREIGN KEY (delivered_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

ALTER TABLE sales 
  DROP CONSTRAINT IF EXISTS sales_sold_by_fkey;

ALTER TABLE sales 
  ADD CONSTRAINT sales_sold_by_fkey 
  FOREIGN KEY (sold_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;
