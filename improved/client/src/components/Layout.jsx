import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import apiClient from '../api/client';

const roleColors = {
  admin: 'bg-red-100 text-red-700',
  warehouse: 'bg-blue-100 text-blue-700',
  manager: 'bg-purple-100 text-purple-700',
  staff: 'bg-green-100 text-green-700',
  audit: 'bg-gray-100 text-gray-700',
};

function NavItem({ to, icon, label, badge }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));

  return (
    <NavLink
      to={to}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

const icons = {
  dashboard: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  inventory: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  transfers: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  sales: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  history: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  reports: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  withdrawals: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  conversions: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  analysis: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  deliveries: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  discrepancy: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  costs: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  messages: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  admin: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function getMenuItems(user) {
  const role = user?.role;
  const hasLocation = !!user?.location_id;
  const effectiveRole = role === 'branch_manager' ? 'manager' : role === 'branch_staff' ? 'staff' : role;

  const all = [
    { to: '/dashboard', icon: icons.dashboard, label: 'Dashboard', key: 'dashboard' },
    { to: '/sales', icon: icons.sales, label: 'Sales', key: 'sales' },
    { to: '/inventory', icon: icons.inventory, label: 'Inventory', key: 'inventory' },
    { to: '/withdrawals', icon: icons.withdrawals, label: 'Withdrawals', key: 'withdrawals' },
    { to: '/transfers', icon: icons.transfers, label: 'Transfers', key: 'transfers' },
    { to: '/reports', icon: icons.reports, label: 'Reports', key: 'reports' },
    { to: '/analysis', icon: icons.analysis, label: 'Analysis', key: 'analysis' },
    { to: '/deliveries', icon: icons.deliveries, label: 'Deliveries', key: 'deliveries' },
    { to: '/discrepancy', icon: icons.discrepancy, label: 'Discrepancy', key: 'discrepancy' },
    { to: '/costs', icon: icons.costs, label: 'Costs', key: 'costs' },
    { to: '/messages', icon: icons.messages, label: 'Messages', key: 'messages' },
    { to: '/admin', icon: icons.admin, label: 'Admin Panel', key: 'admin' },
    { to: '/history', icon: icons.history, label: 'History', key: 'history' },
    { to: '/unit-conversions', icon: icons.conversions, label: 'Unit Conversions', key: 'unit-conversions' },
  ];

  const menuMap = {
    admin:     ['dashboard', 'sales', 'inventory', 'withdrawals', 'transfers', 'reports', 'analysis', 'deliveries', 'discrepancy', 'costs', 'messages', 'admin', 'history', 'unit-conversions'],
    warehouse: ['dashboard', 'inventory', 'withdrawals', 'transfers', 'deliveries', 'discrepancy', 'messages'],
    manager:   ['dashboard', 'sales', 'inventory', 'withdrawals', 'transfers', 'reports', 'analysis', 'deliveries', 'discrepancy', 'costs', 'messages'],
    staff:     ['dashboard', 'sales', 'inventory', 'withdrawals', 'transfers', 'messages'],
    audit:     ['dashboard', 'sales', 'inventory', 'withdrawals', 'transfers', 'reports', 'analysis', 'deliveries', 'discrepancy', 'messages', 'admin', 'history'],
  };

  let allowed = menuMap[effectiveRole] || ['dashboard'];

  // Staff/manager without a branch assigned: hide branch-specific pages
  if (['manager', 'staff'].includes(effectiveRole) && !hasLocation) {
    const branchOnly = ['deliveries', 'inventory', 'sales', 'withdrawals', 'messages'];
    allowed = allowed.filter(key => !branchOnly.includes(key));
  }

  return all.filter((item) => allowed.includes(item.key));
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [pendingCounts, setPendingCounts] = useState({});
  const notifRef = useRef(null);

  const menuItems = getMenuItems(user);

  const fetchPendingCounts = async () => {
    if (!user?.role) return;
    const counts = {};

    // Unread messages — all roles
    try {
      const msgRes = await apiClient.get('/api/messages/unread-count');
      counts.messages = parseInt(msgRes.data?.count || 0);
    } catch {}

    if (user.role === 'admin') {
      try {
        const [delRes, trRes] = await Promise.all([
          apiClient.get('/api/deliveries'),
          apiClient.get('/api/transfers/items'),
        ]);
        counts.deliveries = (delRes.data || []).filter(d => ['pending', 'awaiting_admin'].includes(d.status)).length;
        const pendingTrIds = new Set((trRes.data || []).filter(r => r.status === 'pending').map(r => r.transfer_id));
        counts.transfers = pendingTrIds.size;
      } catch {}
    } else if (['manager', 'branch_manager'].includes(user.role)) {
      try {
        const trRes = await apiClient.get('/api/transfers/items');
        const pendingTrIds = new Set((trRes.data || []).filter(r => r.status === 'pending').map(r => r.transfer_id));
        counts.transfers = pendingTrIds.size;
      } catch {}
    }
    setPendingCounts(counts);
  };

  useEffect(() => {
    fetchNotifications();
    fetchPendingCounts();
    const ivNotif = setInterval(fetchNotifications, 5000);
    const ivCounts = setInterval(fetchPendingCounts, 10000);
    return () => { clearInterval(ivNotif); clearInterval(ivCounts); };
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/api/notifications');
      const data = res.data || [];
      setNotifications(data.slice(0, 10));
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch {
      // notifications are non-critical
    }
  };

  const markRead = async (id) => {
    try {
      await apiClient.put(`/api/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiClient.put('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const notifTypeColors = {
    info: 'text-blue-500',
    warning: 'text-amber-500',
    success: 'text-green-500',
    error: 'text-red-500',
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static top-0 left-0 h-full w-64 bg-slate-800 z-40 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <div className="text-white text-sm font-bold leading-tight">Health Shop</div>
              <div className="text-slate-400 text-xs">Inventory System</div>
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.full_name}</div>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColors[user?.role] || 'bg-gray-100 text-gray-700'}`}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
          {menuItems.map((item) => (
            <NavItem key={item.to} {...item} badge={pendingCounts[item.key] || 0} />
          ))}
        </nav>

        {/* Bottom links */}
        <div className="px-3 py-3 border-t border-slate-700 space-y-1">
          <NavLink
            to="/change-password"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Change Password
          </NavLink>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-semibold text-gray-700 text-sm">Health Shop Inventory</span>
          </div>

          <div className="flex items-center gap-2" ref={notifRef}>
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifDropdown((v) => !v)}
                className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {showNotifDropdown && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="font-semibold text-gray-900 text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-gray-500 text-sm">No notifications</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 ${notifTypeColors[n.type] || 'text-gray-400'}`}>
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <circle cx="10" cy="10" r="10" opacity="0.2" />
                                <circle cx="10" cy="10" r="4" />
                              </svg>
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">{n.title}</div>
                              <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(n.created_at).toLocaleString()}
                              </div>
                            </div>
                            {!n.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0" />}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User */}
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-gray-900">{user?.full_name}</div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColors[user?.role] || 'bg-gray-100 text-gray-700'}`}>
                  {user?.role}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                {user?.full_name?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
