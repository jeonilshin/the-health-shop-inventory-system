-- Messages System for Internal Communication

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);

-- Create message threads table for group conversations
CREATE TABLE IF NOT EXISTS message_threads (
  id SERIAL PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create thread participants table
CREATE TABLE IF NOT EXISTS thread_participants (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  last_read_at TIMESTAMP,
  UNIQUE(thread_id, user_id)
);

-- Create thread messages table
CREATE TABLE IF NOT EXISTS thread_messages (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for threads
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_created ON thread_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_participants_user ON thread_participants(user_id);
