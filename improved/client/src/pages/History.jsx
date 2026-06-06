import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'inventory_added', label: 'Inventory Added' },
  { value: 'inventory_adjusted', label: 'Inventory Adjusted' },
  { value: 'inventory_removed', label: 'Inventory Removed' },
  { value: 'transfer_sent', label: 'Transfer Sent' },
  { value: 'transfer_received', label: 'Transfer Received' },
  { value: 'transfer_approved', label: 'Transfer Approved' },
  { value: 'transfer_rejected', label: 'Transfer Rejected' },
  { value: 'transfer_shipped', label: 'Transfer Shipped' },
  { value: 'transfer_cancelled', label: 'Transfer Cancelled' },
  { value: 'sale', label: 'Sale' },
  { value: 'sale_cancelled', label: 'Sale Cancelled' },
  { value: 'stock_withdrawal', label: 'Stock Withdrawal' },
];

const actionConfig = {
  inventory_added:      { label: 'Inventory Added',      color: 'text-green-700',  bg: 'bg-green-50',  icon: '+' },
  inventory_adjusted:   { label: 'Inventory Adjusted',   color: 'text-blue-700',   bg: 'bg-blue-50',   icon: '~' },
  inventory_removed:    { label: 'Inventory Removed',    color: 'text-red-700',    bg: 'bg-red-50',    icon: '-' },
  transfer_sent:        { label: 'Transfer Sent',        color: 'text-orange-700', bg: 'bg-orange-50', icon: '→' },
  transfer_received:    { label: 'Transfer Received',    color: 'text-green-700',  bg: 'bg-green-50',  icon: '←' },
  transfer_approved:    { label: 'Transfer Approved',    color: 'text-blue-700',   bg: 'bg-blue-50',   icon: '✓' },
  transfer_rejected:    { label: 'Transfer Rejected',    color: 'text-red-700',    bg: 'bg-red-50',    icon: '✗' },
  transfer_shipped:     { label: 'Transfer Shipped',     color: 'text-indigo-700', bg: 'bg-indigo-50', icon: '▶' },
  transfer_cancelled:   { label: 'Transfer Cancelled',   color: 'text-gray-700',   bg: 'bg-gray-50',   icon: '⊘' },
  sale:                 { label: 'Sale',                 color: 'text-purple-700', bg: 'bg-purple-50', icon: '$' },
  sale_cancelled:       { label: 'Sale Cancelled',       color: 'text-red-700',    bg: 'bg-red-50',    icon: '✗' },
  stock_withdrawal:     { label: 'Stock Withdrawal',     color: 'text-amber-700',  bg: 'bg-amber-50',  icon: '↓' },
};

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function QtyChange({ change }) {
  if (change == null) return <span className="text-gray-400">—</span>;
  const num = parseFloat(change);
  if (num > 0) return <span className="font-semibold text-green-600">+{Math.round(num).toLocaleString('en-PH')}</span>;
  if (num < 0) return <span className="font-semibold text-red-600">{Math.round(num).toLocaleString('en-PH')}</span>;
  return <span className="text-gray-500">0</span>;
}

function exportToCSV(items) {
  const headers = ['Date', 'Action', 'Product', 'Location', 'Qty Change', 'Before', 'After', 'Performed By', 'Details'];
  const rows = items.map((item) => [
    formatDateTime(item.created_at),
    actionConfig[item.action_type]?.label || item.action_type,
    item.product_name || '',
    item.location_name || '',
    item.quantity_change != null ? item.quantity_change : '',
    item.quantity_before != null ? item.quantity_before : '',
    item.quantity_after != null ? item.quantity_after : '',
    item.performer_name || '',
    item.details ? JSON.stringify(item.details).replace(/"/g, '""') : '',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `history_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 50;

export default function History() {
  const { user, isAdmin, isAudit } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);

  // Filters
  const [filterLocation, setFilterLocation] = useState((!isAdmin && !isAudit && user?.location_id) ? user.location_id : '');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Expanded row
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchProducts();
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (filterLocation) params.location_id = filterLocation;
      if (filterProduct) params.product_id = filterProduct;
      if (filterAction) params.action_type = filterAction;
      if (filterFrom) params.from_date = filterFrom;
      if (filterTo) params.to_date = filterTo;

      const res = await apiClient.get('/api/history', { params });
      const data = res.data || {};
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      showToast('Failed to load history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterLocation, filterProduct, filterAction, filterFrom, filterTo, page]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const fetchLocations = async () => {
    try { const res = await apiClient.get('/api/locations'); setLocations(res.data || []); } catch {}
  };

  const fetchProducts = async () => {
    try { const res = await apiClient.get('/api/products'); setProducts(res.data || []); } catch {}
  };

  const clearFilters = () => {
    setFilterLocation((!isAdmin && !isAudit && user?.location_id) ? user.location_id : '');
    setFilterProduct('');
    setFilterAction('');
    setFilterFrom('');
    setFilterTo('');
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity History</h1>
          <p className="text-sm text-gray-500 mt-0.5">Full audit trail of all inventory movements.</p>
        </div>
        <button
          onClick={() => exportToCSV(items)}
          disabled={items.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Action type */}
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>

          {/* Location (admin/audit see all) */}
          {(isAdmin || isAudit) && (
            <select
              value={filterLocation}
              onChange={(e) => { setFilterLocation(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}

          {/* Product */}
          <select
            value={filterProduct}
            onChange={(e) => { setFilterProduct(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Date range */}
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="From date"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => { setFilterTo(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="To date"
          />

          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Total count */}
      {!loading && (
        <p className="text-sm text-gray-500">
          Showing {items.length} of {total} records
          {total > 0 && ` (page ${page + 1} of ${totalPages || 1})`}
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-14 h-14 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 font-medium">No history records found.</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  {['Date / Time', 'Action', 'Product', 'Location', 'Qty Change', 'Before → After', 'Performed By'].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const cfg = actionConfig[item.action_type] || { label: item.action_type, color: 'text-gray-700', bg: 'bg-gray-50', icon: '•' };
                  const isExpanded = expandedId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDateTime(item.created_at)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                            <span className="font-mono text-xs">{cfg.icon}</span>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-800 font-medium">{item.product_name || '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{item.location_name || '—'}</td>
                        <td className="px-5 py-3"><QtyChange change={item.quantity_change} /></td>
                        <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {item.quantity_before != null && item.quantity_after != null ? (
                            <span>
                              <span className="text-gray-500">{Math.round(parseFloat(item.quantity_before)).toLocaleString('en-PH')}</span>
                              <span className="mx-1 text-gray-300">→</span>
                              <span className="font-medium text-gray-800">{Math.round(parseFloat(item.quantity_after)).toLocaleString('en-PH')}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-gray-800 text-xs">{item.performer_name}</div>
                          <div className="text-gray-400 text-xs capitalize">{item.performer_role}</div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-gray-200 bg-slate-50">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Full Details</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                              {item.unit_cost != null && (
                                <div>
                                  <span className="text-gray-400 text-xs block">Unit Cost</span>
                                  <span className="text-gray-800 font-medium">₱{parseFloat(item.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                            </div>
                            {item.details && (
                              <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700 max-h-48">
                                {typeof item.details === 'string'
                                  ? item.details
                                  : JSON.stringify(item.details, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page <strong>{page + 1}</strong> of <strong>{totalPages}</strong>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Next
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
