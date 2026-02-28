import { useState, useEffect, useContext, useRef } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { FiMessageSquare, FiSend, FiUser, FiSearch, FiX, FiEdit } from 'react-icons/fi';

function Messages() {
  const { user } = useContext(AuthContext);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    fetchUsers();
    fetchUnreadCount();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnreadCount();
      if (selectedUser) {
        fetchMessages(selectedUser.id);
      }
    }, 10000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const response = await api.get('/messages/conversations');
      setConversations(response.data);
    } catch (error) {
      // Error fetching conversations
    }
  };

  const fetchMessages = async (userId) => {
    try {
      const response = await api.get(`/messages/conversation/${userId}`);
      setMessages(response.data);
      
      // Mark as read
      await api.put(`/messages/mark-read/${userId}`);
      fetchConversations();
      fetchUnreadCount();
    } catch (error) {
      // Error fetching messages
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/messages/users');
      setUsers(response.data);
    } catch (error) {
      // Error fetching users
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/messages/unread-count');
      setUnreadCount(response.data.count);
    } catch (error) {
      // Error fetching unread count
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !selectedUser) return;
    
    try {
      await api.post('/messages/send', {
        recipient_id: selectedUser.id,
        message: newMessage.trim()
      });
      
      setNewMessage('');
      fetchMessages(selectedUser.id);
      fetchConversations();
    } catch (error) {
      alert('Error sending message');
    }
  };

  const handleSelectUser = (userId, userName, userRole) => {
    setSelectedUser({ id: userId, name: userName, role: userRole });
    setShowNewMessage(false);
    fetchMessages(userId);
  };

  const handleNewConversation = (userId, userName, userRole) => {
    setSelectedUser({ id: userId, name: userName, role: userRole });
    setMessages([]);
    setShowNewMessage(false);
  };

  const filteredUsers = users.filter(u => 
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: '#ef4444',
      warehouse: '#3b82f6',
      branch_manager: '#10b981',
      branch_staff: '#8b5cf6'
    };
    return colors[role] || '#6b7280';
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiMessageSquare size={32} color="#2563eb" />
        <div>
          <h2 style={{ margin: 0 }}>Messages</h2>
          {unreadCount > 0 && (
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '320px 1fr', 
        gap: '20px',
        height: 'calc(100vh - 200px)',
        minHeight: '500px'
      }}>
        {/* Conversations List */}
        <div className="card" style={{ 
          padding: 0, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ 
            padding: '16px', 
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Conversations</h3>
            <button
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={() => setShowNewMessage(!showNewMessage)}
            >
              <FiEdit size={14} />
              New
            </button>
          </div>

          {showNewMessage && (
            <div style={{ 
              padding: '12px', 
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)'
            }}>
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <FiSearch 
                  size={16} 
                  style={{ 
                    position: 'absolute', 
                    left: '10px', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)'
                  }} 
                />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ 
                    width: '100%', 
                    paddingLeft: '35px',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div style={{ 
                maxHeight: '200px', 
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'white'
              }}>
                {filteredUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => handleNewConversation(u.id, u.full_name, u.role)}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <FiUser size={14} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{u.full_name}</div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: getRoleBadgeColor(u.role),
                        textTransform: 'uppercase',
                        fontWeight: 600
                      }}>
                        {u.role.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ 
                padding: '40px 20px', 
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>
                <FiMessageSquare size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ margin: 0, fontSize: '14px' }}>No conversations yet</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                  Click "New" to start messaging
                </p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.other_user_id}
                  onClick={() => handleSelectUser(conv.other_user_id, conv.other_user_name, conv.other_user_role)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: selectedUser?.id === conv.other_user_id ? 'var(--bg-secondary)' : 'white',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedUser?.id !== conv.other_user_id) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedUser?.id !== conv.other_user_id) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ 
                      fontWeight: conv.unread_count > 0 ? 600 : 400,
                      fontSize: '14px'
                    }}>
                      {conv.other_user_name}
                    </div>
                    {conv.unread_count > 0 && (
                      <span style={{
                        backgroundColor: '#ef4444',
                        color: 'white',
                        borderRadius: '10px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {conv.is_sender ? 'You: ' : ''}{conv.last_message}
                  </div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-secondary)',
                    marginTop: '4px'
                  }}>
                    {new Date(conv.last_message_time).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="card" style={{ 
          padding: 0, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedUser ? (
            <>
              <div style={{ 
                padding: '16px', 
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: getRoleBadgeColor(selectedUser.role),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600
                  }}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>{selectedUser.name}</div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: getRoleBadgeColor(selectedUser.role),
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}>
                      {selectedUser.role?.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '20px',
                backgroundColor: '#f9fafb'
              }}>
                {messages.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px',
                    color: 'var(--text-secondary)'
                  }}>
                    <FiMessageSquare size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                    <p style={{ margin: 0 }}>No messages yet</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px' }}>
                      Start the conversation below
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender_id === user.id;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          justifyContent: isOwn ? 'flex-end' : 'flex-start',
                          marginBottom: '16px'
                        }}
                      >
                        <div style={{
                          maxWidth: '70%',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          backgroundColor: isOwn ? '#2563eb' : 'white',
                          color: isOwn ? 'white' : 'var(--text-primary)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                          <div style={{ marginBottom: '4px' }}>{msg.message}</div>
                          <div style={{ 
                            fontSize: '11px', 
                            opacity: 0.7,
                            textAlign: 'right'
                          }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} style={{ 
                padding: '16px', 
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'white'
              }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!newMessage.trim()}
                    style={{ 
                      padding: '10px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <FiSend size={16} />
                    Send
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <FiMessageSquare size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <h3 style={{ margin: '0 0 8px 0' }}>Select a conversation</h3>
                <p style={{ margin: 0, fontSize: '14px' }}>
                  Choose a conversation from the list or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Messages;
