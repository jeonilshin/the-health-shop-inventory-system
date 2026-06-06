import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

const roleColors = {
  admin: '#ef4444', warehouse: '#3b82f6', manager: '#10b981',
  branch_manager: '#10b981', staff: '#8b5cf6', branch_staff: '#8b5cf6', audit: '#6b7280',
};

function Avatar({ name, role, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      backgroundColor: roleColors[role] || '#6b7280',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 700, fontSize: size * 0.4,
    }}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    fetchUsers();
    fetchUnreadCount();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnreadCount();
      if (selectedUser) fetchMessages(selectedUser.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const r = await apiClient.get('/api/messages/conversations');
      setConversations(r.data);
    } catch {}
  };
  const fetchMessages = async (userId) => {
    try {
      const r = await apiClient.get(`/api/messages/conversation/${userId}`);
      setMessages(r.data);
      fetchConversations();
      fetchUnreadCount();
    } catch {}
  };
  const fetchUsers = async () => {
    try {
      const r = await apiClient.get('/api/messages/users');
      setUsers(r.data);
    } catch {}
  };
  const fetchUnreadCount = async () => {
    try {
      const r = await apiClient.get('/api/messages/unread-count');
      setUnreadCount(r.data.count);
    } catch {}
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || sending) return;
    setSending(true);
    try {
      await apiClient.post('/api/messages/send', { recipient_id: selectedUser.id, message: newMessage.trim() });
      setNewMessage('');
      fetchMessages(selectedUser.id);
      fetchConversations();
    } catch { alert('Error sending message'); }
    finally { setSending(false); }
  };

  const handleSelectConv = (conv) => {
    setSelectedUser({ id: conv.other_user_id, name: conv.other_user_name, role: conv.other_user_role });
    setShowNewMessage(false);
    fetchMessages(conv.other_user_id);
  };

  const handleNewConv = (u) => {
    setSelectedUser({ id: u.id, name: u.full_name, role: u.role });
    setMessages([]);
    setShowNewMessage(false);
  };

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
          {unreadCount > 0 && <p className="text-sm text-blue-600">{unreadCount} unread message{unreadCount !== 1 ? 's' : ''}</p>}
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: '300px 1fr', height: 'calc(100vh - 220px)', minHeight: 500 }}>
        {/* Sidebar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <span className="font-semibold text-gray-900 text-sm">Conversations</span>
            <button
              onClick={() => setShowNewMessage(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>

          {showNewMessage && (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                autoFocus
              />
              <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-100 bg-white">
                {filtered.length === 0
                  ? <div className="px-3 py-3 text-xs text-gray-400 text-center">No users found</div>
                  : filtered.map(u => (
                    <button key={u.id} onClick={() => handleNewConv(u)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-blue-50 transition-colors">
                      <Avatar name={u.full_name} role={u.role} size={28} />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{u.full_name}</div>
                        <div className="text-xs font-semibold" style={{ color: roleColors[u.role] || '#6b7280' }}>
                          {u.role.replace('_', ' ')}
                          {u.location_name && <span className="text-gray-400 font-normal"> · {u.location_name}</span>}
                        </div>
                      </div>
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <svg className="w-12 h-12 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-sm text-gray-500">No conversations yet</p>
                <p className="text-xs text-gray-400 mt-1">Click "New" to start messaging</p>
              </div>
            ) : conversations.map(conv => (
              <button key={conv.other_user_id} onClick={() => handleSelectConv(conv)}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-50 text-left transition-colors ${selectedUser?.id === conv.other_user_id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <Avatar name={conv.other_user_name} role={conv.other_user_role} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${conv.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {conv.other_user_name}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {conv.is_sender ? 'You: ' : ''}{conv.last_message}
                  </p>
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    {new Date(conv.last_message_time).toLocaleString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          {selectedUser ? (
            <>
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                <Avatar name={selectedUser.name} role={selectedUser.role} size={40} />
                <div>
                  <div className="font-semibold text-gray-900">{selectedUser.name}</div>
                  <div className="text-xs font-semibold" style={{ color: roleColors[selectedUser.role] || '#6b7280' }}>
                    {selectedUser.role?.replace('_', ' ')}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                    <svg className="w-12 h-12 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <p className="text-sm">No messages yet. Start the conversation!</p>
                  </div>
                ) : messages.map(msg => {
                  const isOwn = msg.sender_id === user.id;
                  return (
                    <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${isOwn ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'}`}>
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                        <p className={`text-[10px] mt-1 text-right ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-white flex-shrink-0">
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-full transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
              <svg className="w-16 h-16 mb-4 opacity-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <h3 className="font-semibold text-gray-500 mb-1">Select a conversation</h3>
              <p className="text-sm">Choose a conversation from the list or start a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
