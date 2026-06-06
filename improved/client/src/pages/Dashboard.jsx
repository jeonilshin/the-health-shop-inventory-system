import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/* ─── helpers ─── */
function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtPrice(n) {
  if (n == null) return '—';
  const num = parseFloat(n);
  if (num >= 1_000_000) return `₱${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `₱${(num / 1_000).toFixed(1)}K`;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtQty(n) {
  const num = parseFloat(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toLocaleString('en-PH');
}

/* ─── Stat Card ─── */
function StatCard({ label, value, icon, borderColor, valueColor, loading, tooltip }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex justify-between items-start gap-3"
      style={{ borderTop: `3px solid ${borderColor}` }}
      title={tooltip}
    >
      <div className="flex-1 min-w-0">
        {loading ? (
          <>
            <div className="h-8 w-20 bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold truncate" style={{ color: valueColor || '#111827' }}>{value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{label}</div>
          </>
        )}
      </div>
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: borderColor + '1a', color: borderColor }}
      >
        {icon}
      </div>
    </div>
  );
}

/* ─── Section card wrapper ─── */
function Section({ title, icon, badge, badgeColor = 'bg-gray-100 text-gray-700', action, leftBorder, children }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
      style={leftBorder ? { borderLeft: `4px solid ${leftBorder}` } : undefined}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
          {icon}
          {title}
          {badge != null && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>{badge}</span>
          )}
        </h3>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ─── Table shell ─── */
function DataTable({ headers, children, emptyMsg }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {headers.map((h) => (
              <th key={h.label} className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h.right ? 'text-right' : 'text-left'}`}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">{children}</tbody>
      </table>
    </div>
  );
}

/* ─── Quick action button ─── */
function QAction({ to, label, color, icon }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
      style={{ background: color }}
    >
      {icon}
      {label}
    </Link>
  );
}

/* ─── Icons (inline SVG, no deps) ─── */
const Icon = {
  package: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  trending: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  alert: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  clock: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  check: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  cart: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>,
  transfer: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  plus: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  refresh: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  arrow: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
  report: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  dollar: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  cancelReq: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

/* ═══════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user, isAdmin, isAudit, isWarehouse, isManager, isStaff } = useAuth();
  const { showToast } = useToast();

  const [inventoryReport, setInventoryReport]   = useState([]);
  const [locationStats, setLocationStats]       = useState([]);
  const [lowStockItems, setLowStockItems]        = useState([]);
  const [expiringItems, setExpiringItems]        = useState([]);
  const [recentTransfers, setRecentTransfers]    = useState([]);
  const [recentActivity, setRecentActivity]      = useState([]);
  const [salesData, setSalesData]                = useState([]);
  const [salesSummary, setSalesSummary]          = useState({ total_transactions: 0, total_revenue: 0, items_sold: 0, cancel_requests: 0 });
  const [pendingCancelReqs, setPendingCancelReqs] = useState([]);
  const [cancelActionLoading, setCancelActionLoading] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const [invR, locR, lowR, expR, trR, histR, salesR, summR] = await Promise.allSettled([
      apiClient.get('/api/reports/inventory'),
      apiClient.get('/api/inventory/location-stats'),
      apiClient.get('/api/reports/low-stock', { params: { threshold: 10 } }),
      apiClient.get('/api/reports/expiring', { params: { days: 30 } }),
      apiClient.get('/api/transfers', { params: { limit: 10 } }),
      apiClient.get('/api/history', { params: { limit: 8 } }),
      apiClient.get('/api/sales', { params: { limit: 10 } }),
      apiClient.get('/api/reports/sales-summary'),
    ]);

    setInventoryReport(invR.status === 'fulfilled' ? invR.value.data : []);
    setLocationStats(locR.status === 'fulfilled' ? locR.value.data : []);
    setLowStockItems(lowR.status === 'fulfilled' ? lowR.value.data : []);
    setExpiringItems(expR.status === 'fulfilled' ? expR.value.data : []);
    setRecentTransfers(trR.status === 'fulfilled' ? trR.value.data.slice(0, 5) : []);
    setRecentActivity(histR.status === 'fulfilled' ? (histR.value.data.items || []) : []);
    const salesList = salesR.status === 'fulfilled' ? salesR.value.data : [];
    setSalesData(salesList);
    setPendingCancelReqs(salesList.filter((s) => s.status === 'cancel_requested'));
    if (summR.status === 'fulfilled') setSalesSummary(summR.value.data);
    setLastUpdated(new Date());

    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
    const iv = setInterval(() => loadDashboard(), 30000);
    return () => clearInterval(iv);
  }, [loadDashboard]);

  /* ── Derived stats ── */
  const locationSummary = locationStats.map((l) => ({
    location_name: l.location_name,
    location_type: l.location_type,
    total_products: parseInt(l.total_items || 0),
    total_quantity: parseFloat(l.total_qty || 0),
    total_value: parseFloat(l.total_value || 0),
  }));

  const totalValue    = inventoryReport.reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
  const totalProducts = inventoryReport.reduce((s, r) => s + parseFloat(r.total_quantity || 0), 0);
  const pendingTr     = recentTransfers.filter(t => ['pending','approved','shipped'].includes(t.status)).length;

  const hasAlerts = lowStockItems.length > 0 || expiringItems.length > 0;

  const salesStats = {
    revenue: parseFloat(salesSummary.total_revenue || 0),
    transactions: parseInt(salesSummary.total_transactions || 0),
    itemsSold: parseInt(salesSummary.items_sold || 0),
  };

  const handleApproveCancel = async (saleId) => {
    setCancelActionLoading(`approve-${saleId}`);
    try {
      await apiClient.put(`/api/sales/${saleId}/approve-cancel`);
      showToast(`Sale #${saleId} cancelled and inventory restored.`, 'success');
      loadDashboard(true);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to approve cancellation.', 'error');
    } finally { setCancelActionLoading(null); }
  };

  const handleRejectCancel = async (saleId) => {
    setCancelActionLoading(`reject-${saleId}`);
    try {
      await apiClient.put(`/api/sales/${saleId}/reject-cancel`);
      showToast(`Cancellation request for Sale #${saleId} rejected.`, 'info');
      loadDashboard(true);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reject request.', 'error');
    } finally { setCancelActionLoading(null); }
  };

  /* ── Stat card config ── */
  const statCards = [
    isAdmin && {
      label: 'Total Inventory Value',
      value: fmtPrice(totalValue),
      tooltip: `₱${totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      borderColor: '#2563eb',
      icon: Icon.trending,
    },
    {
      label: 'Total Stock Units',
      value: fmtQty(totalProducts),
      tooltip: totalProducts.toLocaleString(),
      borderColor: '#10b981',
      icon: Icon.package,
    },
    {
      label: 'Low Stock Items',
      value: lowStockItems.length,
      borderColor: lowStockItems.length > 0 ? '#f59e0b' : '#10b981',
      valueColor: lowStockItems.length > 0 ? '#d97706' : undefined,
      icon: Icon.alert,
    },
    {
      label: 'Expiring in 30 Days',
      value: expiringItems.length,
      borderColor: expiringItems.length > 0 ? '#f59e0b' : '#10b981',
      valueColor: expiringItems.length > 0 ? '#d97706' : undefined,
      icon: Icon.clock,
    },
    {
      label: 'Pending / In-Transit',
      value: pendingTr,
      borderColor: pendingTr > 0 ? '#8b5cf6' : '#10b981',
      valueColor: pendingTr > 0 ? '#7c3aed' : undefined,
      icon: Icon.transfer,
    },
  ].filter(Boolean);

  const salesCards = [
    !isWarehouse && !isStaff && {
      label: 'Total Sales Revenue',
      value: fmtPrice(salesStats.revenue),
      tooltip: `₱${salesStats.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      borderColor: '#7c3aed',
      icon: Icon.dollar,
    },
    !isWarehouse && !isStaff && {
      label: 'Total Transactions',
      value: salesStats.transactions,
      borderColor: '#2563eb',
      icon: Icon.cart,
    },
    !isWarehouse && !isStaff && {
      label: 'Items Sold',
      value: salesStats.itemsSold.toLocaleString(),
      borderColor: '#10b981',
      icon: Icon.package,
    },
    isAdmin && {
      label: 'Cancel Requests',
      value: salesSummary.cancel_requests || 0,
      borderColor: (salesSummary.cancel_requests || 0) > 0 ? '#f59e0b' : '#d1d5db',
      valueColor: (salesSummary.cancel_requests || 0) > 0 ? '#d97706' : '#9ca3af',
      icon: Icon.cancelReq,
    },
  ].filter(Boolean);

  /* ── Activity helpers ── */
  const actColor = (type) => {
    if (!type) return 'text-gray-500';
    if (type.includes('added') || type.includes('received')) return 'text-green-600';
    if (type.includes('removed') || type.includes('rejected') || type.includes('cancelled')) return 'text-red-600';
    if (type.includes('sent') || type.includes('shipped')) return 'text-orange-600';
    if (type === 'sale') return 'text-purple-600';
    if (type.includes('approved')) return 'text-blue-600';
    if (type === 'stock_withdrawal') return 'text-amber-600';
    return 'text-gray-500';
  };
  const actLabel = (type) => ({
    inventory_added: 'Added',
    inventory_adjusted: 'Adjusted',
    inventory_removed: 'Removed',
    transfer_sent: 'Transfer Out',
    transfer_received: 'Transfer In',
    transfer_approved: 'Approved',
    transfer_rejected: 'Rejected',
    transfer_shipped: 'Shipped',
    transfer_cancelled: 'Cancelled',
    sale: 'Sale',
    sale_cancelled: 'Sale Cancelled',
    stock_withdrawal: 'Withdrawal',
  }[type] || type?.replace(/_/g, ' '));

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    shipped: 'bg-indigo-100 text-indigo-800',
    received: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-700',
  };

  /* ─────────────── RENDER ─────────────── */
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, <strong>{user?.full_name}</strong>
            {isManager && locationSummary.length > 0 && (
              <span className="ml-2 text-blue-600 font-semibold">· {locationSummary.length} location{locationSummary.length !== 1 ? 's' : ''}</span>
            )}
            {isStaff && locationSummary.length > 0 && (
              <span className="ml-2 text-blue-600 font-semibold">· {locationSummary[0]?.location_name}</span>
            )}
            {lastUpdated && (
              <span className="ml-2 text-gray-400 font-normal">· Updated {lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-60 transition-colors"
        >
          <span className={refreshing ? 'animate-spin' : ''}>{Icon.refresh}</span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Inventory Stat Cards ── */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {statCards.map((c) => (
          <StatCard key={c.label} loading={loading} {...c} />
        ))}
      </div>

      {/* ── Sales Stat Cards — hidden for warehouse and staff ── */}
      {!isWarehouse && !isStaff && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
          {salesCards.map((c) => (
            <StatCard key={c.label} loading={loading} {...c} />
          ))}
        </div>
      )}

      {/* ── Alert Banners ── */}
      {!loading && hasAlerts && (
        <div className="flex flex-wrap gap-3">
          {lowStockItems.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex-1 min-w-fit">
              {Icon.alert}
              <span><strong>{lowStockItems.length}</strong> item{lowStockItems.length !== 1 ? 's' : ''} running low on stock</span>
            </div>
          )}
          {expiringItems.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex-1 min-w-fit">
              {Icon.clock}
              <span><strong>{expiringItems.length}</strong> item{expiringItems.length !== 1 ? 's' : ''} expiring within 30 days</span>
            </div>
          )}
        </div>
      )}

      {/* ── Pending Sale Cancellation Requests ── */}
      {isAdmin && !loading && pendingCancelReqs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <h3 className="text-base font-bold text-red-600">
                  Pending Sale Cancellation Requests ({pendingCancelReqs.length})
                </h3>
              </div>
              <Link to="/sales" className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                View all in Sales {Icon.arrow}
              </Link>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Review each request below. Approve to cancel the sale and restore inventory, or reject to keep the sale active.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-t border-b border-gray-200">
                  {['Date', 'Branch', 'Item', 'Qty', 'Total', 'Sold By', 'Reason', 'Requested By', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingCancelReqs.slice(0, 5).map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {new Date(sale.created_at).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{sale.location_name}</td>
                    <td className="px-4 py-3 min-w-[150px]">
                      <div className="font-semibold text-gray-900 uppercase text-xs">{sale.first_product_name || '—'}</div>
                      {sale.first_product_unit && <div className="text-xs text-gray-400 mt-0.5">{sale.first_product_unit}</div>}
                      {parseInt(sale.item_count) > 1 && <div className="text-xs text-blue-500 mt-0.5">+{parseInt(sale.item_count) - 1} more</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {sale.first_item_qty != null ? Math.round(parseFloat(sale.first_item_qty)).toLocaleString('en-PH') : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                      ₱{(Math.max(0, parseFloat(sale.total_amount || 0) - parseFloat(sale.discount_amount || 0))).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{sale.sold_by_name}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[120px]">
                      <span className="line-clamp-2 text-xs">{sale.cancel_request_reason || '—'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 text-xs">{sale.cancel_requested_by_name || '—'}</div>
                      {sale.cancel_requested_at && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(sale.cancel_requested_at).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveCancel(sale.id)}
                          disabled={cancelActionLoading === `approve-${sale.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold transition-colors"
                        >
                          {cancelActionLoading === `approve-${sale.id}`
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          }
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectCancel(sale.id)}
                          disabled={cancelActionLoading === `reject-${sale.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 text-xs font-semibold transition-colors"
                        >
                          {cancelActionLoading === `reject-${sale.id}`
                            ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          }
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pendingCancelReqs.length > 5 && (
            <div className="px-6 py-3 text-xs text-gray-500 text-center border-t border-gray-100">
              +{pendingCancelReqs.length - 5} more requests —{' '}
              <Link to="/sales" className="text-blue-600 font-semibold hover:underline">View all in Sales</Link>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <Section
        title="Quick Actions"
        icon={<svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
      >
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(isAdmin || isWarehouse) && (
            <QAction to="/inventory" label="Add Inventory" color="#2563eb" icon={Icon.plus} />
          )}
          {(isManager || isStaff) && (
            <QAction to="/inventory" label="View Inventory" color="#2563eb" icon={Icon.package} />
          )}
          {(isAdmin || isWarehouse) && (
            <QAction to="/transfers" label="Create Transfer" color="#10b981" icon={Icon.transfer} />
          )}
          {(isAdmin || isManager || isStaff) && (
            <QAction to="/sales" label="Record Sale" color="#8b5cf6" icon={Icon.cart} />
          )}
          {(isAdmin || isWarehouse || isManager || isStaff) && (
            <QAction to="/withdrawals" label="Withdrawal" color="#f59e0b" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>} />
          )}
          {(isAdmin || isAudit) && (
            <QAction to="/reports" label="Reports" color="#6366f1" icon={Icon.report} />
          )}
        </div>
      </Section>

      {/* ── Inventory by Location ── */}
      <Section
        title="Inventory by Location"
        icon={<span style={{ color: '#2563eb' }}>{Icon.package}</span>}
        badge={locationStats.length > 0 ? `${locationStats.length} location${locationStats.length !== 1 ? 's' : ''}` : undefined}
        action={<Link to="/inventory" className="text-sm text-blue-600 hover:underline font-medium">View All</Link>}
      >
        {loading ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : locationSummary.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No inventory data. Start by adding items.</div>
        ) : (
          <DataTable headers={[
            { label: 'Location' },
            { label: 'Type' },
            { label: 'Items', right: true },
            { label: 'Total Qty', right: true },
            ...(isAdmin ? [{ label: 'Total Value', right: true }] : []),
          ]}>
            {locationSummary.map((loc) => (
              <tr key={loc.location_name} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-semibold text-gray-900">{loc.location_name}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${loc.location_type === 'warehouse' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {loc.location_type}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-gray-700">{loc.total_products.toLocaleString()}</td>
                <td className="px-5 py-3 text-right text-gray-700">{fmtQty(loc.total_quantity)}</td>
                {isAdmin && (
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmtPrice(loc.total_value)}</td>
                )}
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      {/* ── Low Stock Alert ── */}
      {!loading && lowStockItems.length > 0 && (
        <Section
          title="Low Stock Alert"
          icon={<span style={{ color: '#d97706' }}>{Icon.alert}</span>}
          badge={lowStockItems.length}
          badgeColor="bg-amber-100 text-amber-800"
          leftBorder="#f59e0b"
          action={lowStockItems.length > 5 && <Link to="/inventory" className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1">View All {Icon.arrow}</Link>}
        >
          <DataTable headers={[
            { label: 'Location' },
            { label: 'Product' },
            { label: 'Unit' },
            { label: 'Qty Left', right: true },
            { label: 'Action' },
          ]}>
            {lowStockItems.slice(0, 5).map((item, i) => (
              <tr key={i} className="hover:bg-amber-50 transition-colors">
                <td className="px-5 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{item.location_name}</span>
                </td>
                <td className="px-5 py-3 font-semibold text-gray-900">{item.product_name}</td>
                <td className="px-5 py-3 text-gray-500">{item.unit}</td>
                <td className="px-5 py-3 text-right">
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">{fmtQty(item.total_qty)}</span>
                </td>
                <td className="px-5 py-3">
                  <Link to="/transfers" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                    {Icon.arrow} Transfer
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        </Section>
      )}

      {/* ── Expiring Soon ── */}
      {!loading && expiringItems.length > 0 && (
        <Section
          title="Expiring Soon"
          icon={<span style={{ color: '#d97706' }}>{Icon.clock}</span>}
          badge={expiringItems.length}
          badgeColor="bg-amber-100 text-amber-800"
          leftBorder="#f59e0b"
          action={expiringItems.length > 5 && <Link to="/inventory" className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1">View All {Icon.arrow}</Link>}
        >
          <DataTable headers={[
            { label: 'Location' },
            { label: 'Product' },
            { label: 'Batch #' },
            { label: 'Qty', right: true },
            { label: 'Expiry Date' },
            { label: 'Status' },
          ]}>
            {expiringItems.slice(0, 5).map((item, i) => {
              const expiry = new Date(item.expiry_date);
              const daysLeft = Math.ceil((expiry - new Date()) / 86_400_000);
              const isExpired  = daysLeft < 0;
              const isCritical = !isExpired && daysLeft <= 7;
              return (
                <tr key={i} className="hover:bg-amber-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{item.location_name}</span>
                  </td>
                  <td className="px-5 py-3 font-semibold text-gray-900">{item.product_name}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{item.batch_number || '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{fmtQty(item.quantity)} {item.unit}</td>
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmt(item.expiry_date)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${isExpired || isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                      {isExpired ? 'EXPIRED' : daysLeft === 0 ? 'TODAY' : `${daysLeft}d left`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Section>
      )}

      {/* ── All Clear ── */}
      {!loading && !hasAlerts && inventoryReport.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-4 bg-white border border-gray-200 rounded-xl shadow-sm" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="text-green-500 flex-shrink-0">{Icon.check}</div>
          <div>
            <div className="font-semibold text-gray-900">All inventory is healthy</div>
            <div className="text-sm text-gray-500">No low stock or expiring items to report.</div>
          </div>
        </div>
      )}

      {/* ── Recent Transfers + Activity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Recent Transfers */}
        <Section
          title="Recent Transfers"
          action={<Link to="/transfers" className="text-sm text-blue-600 hover:underline font-medium">View All</Link>}
        >
          {loading ? (
            <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : recentTransfers.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No transfers yet.</div>
          ) : (
            <DataTable headers={[{ label: '#' }, { label: 'From' }, { label: 'To' }, { label: 'Status' }, { label: 'Date' }]}>
              {recentTransfers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">#{t.id}</td>
                  <td className="px-5 py-3 text-gray-600 max-w-[90px] truncate">{t.from_location_name}</td>
                  <td className="px-5 py-3 text-gray-600 max-w-[90px] truncate">{t.to_location_name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[t.status] || 'bg-gray-100 text-gray-700'}`}>{t.status}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(t.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Section>

        {/* Recent Activity */}
        <Section
          title="Recent Activity"
          action={<Link to="/history" className="text-sm text-blue-600 hover:underline font-medium">View All</Link>}
        >
          {loading ? (
            <div className="p-5 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : recentActivity.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No recent activity.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${actColor(item.action_type).replace('text-', 'bg-')}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">
                      <span className={`font-semibold ${actColor(item.action_type)}`}>{actLabel(item.action_type)}</span>
                      {item.product_name && <span className="text-gray-600"> — {item.product_name}</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {[item.location_name, item.performer_name, new Date(item.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {item.quantity_change != null && (
                    <span className={`text-xs font-bold flex-shrink-0 ${parseFloat(item.quantity_change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {parseFloat(item.quantity_change) > 0 ? '+' : ''}{parseFloat(item.quantity_change).toFixed(0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}
