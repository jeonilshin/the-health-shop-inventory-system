import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const statusColors = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
  cancel_requested: 'bg-amber-100 text-amber-800',
};

const statusLabels = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancel_requested: 'Cancel Requested',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
      {statusLabels[status] || status}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(n) {
  if (n == null || n === '') return '₱0.00';
  return `₱${parseFloat(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Sales() {
  const { user, isAdmin, isManager, isAudit, isStaff, canEdit } = useAuth();
  const { showToast } = useToast();

  const [sales, setSales] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Modals
  const [showView, setShowView] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showRequestCancel, setShowRequestCancel] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);

  // Create sale state
  const [saleDate, setSaleDate] = useState('');
  const [saleLocation, setSaleLocation] = useState('');
  const [saleItems, setSaleItems] = useState([{ product_id: '', product_name: '', unit: '', quantity: 1, unit_price: '', search: '', results: [], showDrop: false, inventory_id: null, batches: [], loadingBatches: false }]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saleCustomer, setSaleCustomer] = useState('');
  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState('');
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [saleNotes, setSaleNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Cancel / request cancel
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchProducts();
    if (user?.location_id) fetchInventory(user.location_id);
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterLocation) params.location_id = filterLocation;
      if (filterFrom) params.from_date = filterFrom;
      if (filterTo) params.to_date = filterTo;
      const res = await apiClient.get('/api/sales', { params });
      setSales(res.data || []);
    } catch {
      showToast('Failed to load sales.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterLocation, filterFrom, filterTo]);

  // Always fetch pending requests independently — never filtered so the section
  // stays visible regardless of what status filter the user has applied
  const fetchPendingRequests = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiClient.get('/api/sales', { params: { status: 'cancel_requested' } });
      setPendingRequests(res.data || []);
    } catch {}
  }, [isAdmin]);

  useEffect(() => { fetchSales(); }, [fetchSales]);
  useEffect(() => { fetchPendingRequests(); }, [fetchPendingRequests]);

  const fetchLocations = async () => {
    try { const res = await apiClient.get('/api/locations'); setLocations(res.data || []); } catch {}
  };

  const fetchProducts = async () => {
    try { const res = await apiClient.get('/api/products'); setProducts(res.data || []); } catch {}
  };

  const fetchInventory = async (locationId) => {
    if (!locationId) return;
    try {
      const res = await apiClient.get('/api/inventory', { params: { location_id: locationId } });
      setInventory(res.data || []);
    } catch {}
  };

  const fetchDetail = async (id) => {
    try {
      const res = await apiClient.get(`/api/sales/${id}`);
      setSelectedDetail(res.data);
      return res.data;
    } catch {
      showToast('Failed to load sale details.', 'error');
      return null;
    }
  };

  const openView = async (sale) => {
    setSelected(sale);
    const detail = await fetchDetail(sale.id);
    if (detail) setShowView(true);
  };

  const openCancel = (sale) => {
    setSelected(sale);
    setCancelReason('');
    setShowCancel(true);
  };

  const openRequestCancel = (sale) => {
    setSelected(sale);
    setRequestReason('');
    setShowRequestCancel(true);
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { showToast('Please provide a cancellation reason.', 'warning'); return; }
    setCancelling(true);
    try {
      await apiClient.put(`/api/sales/${selected.id}/cancel`, { reason: cancelReason });
      showToast('Sale cancelled.', 'success');
      setShowCancel(false);
      fetchSales();
      fetchPendingRequests();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to cancel sale.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleRequestCancel = async () => {
    if (!requestReason.trim()) { showToast('Please provide a reason for cancellation.', 'warning'); return; }
    setRequesting(true);
    try {
      await apiClient.put(`/api/sales/${selected.id}/request-cancel`, { reason: requestReason });
      showToast('Cancellation request submitted. Waiting for admin approval.', 'success');
      setShowRequestCancel(false);
      fetchSales();
      fetchPendingRequests();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit request.', 'error');
    } finally {
      setRequesting(false);
    }
  };

  const handleApproveCancel = async (sale) => {
    setActionLoading(`approve-${sale.id}`);
    try {
      await apiClient.put(`/api/sales/${sale.id}/approve-cancel`);
      showToast(`Sale #${sale.id} cancelled and inventory restored.`, 'success');
      fetchSales();
      fetchPendingRequests();
      fetchInventory(user?.location_id);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to approve cancellation.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectCancel = async (sale) => {
    setActionLoading(`reject-${sale.id}`);
    try {
      await apiClient.put(`/api/sales/${sale.id}/reject-cancel`);
      showToast(`Cancellation request for Sale #${sale.id} rejected.`, 'info');
      fetchSales();
      fetchPendingRequests();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reject request.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openCreate = () => {
    const locId = String(user?.location_id || '');
    setSaleDate(new Date().toISOString().split('T')[0]);
    setSaleLocation(locId);
    setSaleItems([{ product_id: '', product_name: '', unit: '', quantity: 1, unit_price: '', search: '', results: [], showDrop: false, inventory_id: null, batches: [], loadingBatches: false }]);
    setPaymentMethod('cash');
    setSaleCustomer('');
    setDiscountType('none');
    setDiscountValue('');
    setShowDiscountSection(false);
    setSaleNotes('');
    setShowCreate(true);
    if (locId) fetchInventory(locId);
  };

  const addSaleItem = () => setSaleItems((prev) => [...prev, { product_id: '', product_name: '', unit: '', quantity: 1, unit_price: '', search: '', results: [], showDrop: false, inventory_id: null, batches: [], loadingBatches: false }]);
  const removeSaleItem = (idx) => setSaleItems((prev) => prev.filter((_, i) => i !== idx));

  const updateSaleItemSearch = (idx, query) => {
    const lower = query.toLowerCase();
    const results = query.length > 0
      ? products.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 8)
      : [];
    setSaleItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, search: query, results, showDrop: results.length > 0, product_id: '', product_name: '', unit: '' } : item
    ));
  };

  const fetchItemBatches = async (idx, productId) => {
    const locationId = saleLocation || user?.location_id;
    if (!locationId || !productId) return;
    setSaleItems(prev => prev.map((it, i) => i === idx ? { ...it, loadingBatches: true, batches: [] } : it));
    try {
      const res = await apiClient.get('/api/inventory', { params: { product_id: productId, location_id: locationId } });
      const batches = res.data || [];
      setSaleItems(prev => prev.map((it, i) => {
        if (i !== idx) return it;
        const first = batches[0];
        return {
          ...it,
          batches,
          loadingBatches: false,
          inventory_id: first?.id || null,
          unit_price: first?.suggested_selling_price || first?.unit_cost || it.unit_price,
        };
      }));
    } catch {
      setSaleItems(prev => prev.map((it, i) => i === idx ? { ...it, loadingBatches: false } : it));
    }
  };

  const selectSaleProduct = (idx, product) => {
    const inv = inventory.find((iv) => String(iv.product_id) === String(product.id) &&
      (saleLocation ? String(iv.location_id) === String(saleLocation) : true));
    const price = inv?.unit_cost ? parseFloat(inv.unit_cost).toFixed(2) : '';
    setSaleItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, product_id: product.id, product_name: product.name, unit: product.unit || '', search: product.name, results: [], showDrop: false, unit_price: price, inventory_id: null, batches: [], loadingBatches: false } : item
    ));
    fetchItemBatches(idx, product.id);
  };

  const selectBatch = (idx, batch) => {
    setSaleItems(prev => prev.map((it, i) => i !== idx ? it : {
      ...it,
      inventory_id: batch.id,
      unit_price: batch.suggested_selling_price || batch.unit_cost || it.unit_price,
    }));
  };

  const updateSaleItemField = (idx, field, value) => {
    setSaleItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const getSubtotal = (item) => (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  const totalAmount = saleItems.reduce((sum, i) => sum + getSubtotal(i), 0);
  const discountAmt = discountType === 'fixed'
    ? parseFloat(discountValue) || 0
    : discountType === 'percentage'
      ? totalAmount * ((parseFloat(discountValue) || 0) / 100)
      : 0;
  const finalAmount = Math.max(0, totalAmount - discountAmt);

  const completedSales = sales.filter((s) => s.status === 'completed');
  const totalRevenue = completedSales.reduce((sum, s) => sum + Math.max(0, parseFloat(s.total_amount || 0) - parseFloat(s.discount_amount || 0)), 0);
  const totalTransactions = completedSales.length;
  const totalItemsSold = completedSales.reduce((sum, s) => sum + parseInt(s.item_count || 0), 0);
  const pendingCancelCount = pendingRequests.length;

  const handleCreate = async () => {
    const validItems = saleItems.filter((i) => i.product_id);
    if (validItems.length === 0) { showToast('Add at least one item.', 'warning'); return; }
    const invalid = validItems.find((i) => !i.quantity || !i.unit_price || parseFloat(i.unit_price) <= 0 || parseFloat(i.quantity) <= 0);
    if (invalid) { showToast('Fill in quantity and price for all items.', 'warning'); return; }

    setCreating(true);
    try {
      await apiClient.post('/api/sales', {
        location_id: saleLocation ? parseInt(saleLocation) : undefined,
        items: validItems.map((i) => ({
          product_id: parseInt(i.product_id),
          quantity: parseFloat(i.quantity),
          unit_price: parseFloat(i.unit_price),
          inventory_id: i.inventory_id || undefined,
        })),
        payment_method: paymentMethod,
        discount_amount: discountAmt > 0 ? discountAmt : undefined,
        customer_name: saleCustomer || undefined,
        notes: saleNotes || undefined,
      });
      showToast('Sale recorded successfully.', 'success');
      setShowCreate(false);
      fetchSales();
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Failed to record sale.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const canRequestCancel = !isAdmin && !isAudit && canEdit;
  const canDirectCancel = isAdmin && canEdit;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and record sales transactions.</p>
        </div>
        {!isAudit && canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Record Sale
          </button>
        )}
      </div>

      {/* Summary Stats — hidden entirely for staff */}
      {!isStaff && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ borderTop: '3px solid #7c3aed' }}>
            {loading ? <div className="h-8 bg-gray-100 rounded animate-pulse mb-2" /> : (
              <div className="text-2xl font-bold text-gray-900">
                {totalRevenue >= 1_000_000 ? `₱${(totalRevenue / 1_000_000).toFixed(1)}M` : totalRevenue >= 1_000 ? `₱${(totalRevenue / 1_000).toFixed(1)}K` : `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            )}
            <div className="text-sm text-gray-500 mt-0.5">Total Sales</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ borderTop: '3px solid #2563eb' }}>
            {loading ? <div className="h-8 bg-gray-100 rounded animate-pulse mb-2" /> : (
              <div className="text-2xl font-bold text-gray-900">{totalTransactions.toLocaleString()}</div>
            )}
            <div className="text-sm text-gray-500 mt-0.5">Transactions</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ borderTop: '3px solid #10b981' }}>
            {loading ? <div className="h-8 bg-gray-100 rounded animate-pulse mb-2" /> : (
              <div className="text-2xl font-bold text-gray-900">{totalItemsSold.toLocaleString()}</div>
            )}
            <div className="text-sm text-gray-500 mt-0.5">Items Sold</div>
          </div>
          {isAdmin && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ borderTop: `3px solid ${pendingCancelCount > 0 ? '#f59e0b' : '#e5e7eb'}` }}>
              {loading ? <div className="h-8 bg-gray-100 rounded animate-pulse mb-2" /> : (
                <div className={`text-2xl font-bold ${pendingCancelCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{pendingCancelCount}</div>
              )}
              <div className="text-sm text-gray-500 mt-0.5">Cancel Requests</div>
            </div>
          )}
        </div>
      )}

      {/* Pending Sale Cancellation Requests (admin only) */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: '4px solid #ef4444' }}>
          {/* Header */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <h3 className="text-base font-bold text-red-600">
                Pending Sale Cancellation Requests ({pendingRequests.length})
              </h3>
            </div>
            <p className="text-sm text-gray-500">
              Review each request below. Approve to cancel the sale and restore inventory, or reject to keep the sale active.
            </p>
          </div>

          {/* Table */}
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
                {pendingRequests.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {new Date(sale.created_at).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{sale.location_name}</td>
                    <td className="px-4 py-3 min-w-[160px]">
                      <div className="font-semibold text-gray-900 uppercase">{sale.first_product_name || '—'}</div>
                      {sale.first_product_unit && <div className="text-xs text-gray-400 mt-0.5">{sale.first_product_unit}</div>}
                      {parseInt(sale.item_count) > 1 && (
                        <div className="text-xs text-blue-500 mt-0.5">+{parseInt(sale.item_count) - 1} more item{parseInt(sale.item_count) - 1 > 1 ? 's' : ''}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {sale.first_item_qty != null ? Math.round(parseFloat(sale.first_item_qty)).toLocaleString('en-PH') : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                      {formatCurrency(Math.max(0, parseFloat(sale.total_amount || 0) - parseFloat(sale.discount_amount || 0)))}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{sale.sold_by_name}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[140px]">
                      <span className="line-clamp-2">{sale.cancel_request_reason || '—'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800">{sale.cancel_requested_by_name || '—'}</div>
                      {sale.cancel_requested_at && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(sale.cancel_requested_at).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveCancel(sale)}
                          disabled={actionLoading === `approve-${sale.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold transition-colors"
                        >
                          {actionLoading === `approve-${sale.id}`
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          }
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectCancel(sale)}
                          disabled={actionLoading === `reject-${sale.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 text-xs font-semibold transition-colors"
                        >
                          {actionLoading === `reject-${sale.id}`
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
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        {(isAdmin || isManager) && (
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="cancel_requested">Cancel Requested</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => { setFilterStatus(''); setFilterLocation(''); setFilterFrom(''); setFilterTo(''); }}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : sales.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">No sales found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  {['ID', 'Location', 'Customer', ...(!isStaff ? ['Total', 'Discount'] : []), 'Date', 'Sold By', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">#{sale.id}</td>
                    <td className="px-5 py-3 text-gray-700">{sale.location_name}</td>
                    <td className="px-5 py-3 text-gray-600">{sale.customer_name || '—'}</td>
                    {!isStaff && <td className="px-5 py-3 font-semibold text-gray-900">{formatCurrency(sale.total_amount)}</td>}
                    {!isStaff && <td className="px-5 py-3 text-gray-600">{sale.discount_amount > 0 ? formatCurrency(sale.discount_amount) : '—'}</td>}
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(sale.created_at)}</td>
                    <td className="px-5 py-3 text-gray-600">{sale.sold_by_name}</td>
                    <td className="px-5 py-3"><StatusBadge status={sale.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => openView(sale)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium">View</button>
                        {canDirectCancel && sale.status === 'completed' && (
                          <button onClick={() => openCancel(sale)} className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium">Cancel</button>
                        )}
                        {canDirectCancel && sale.status === 'cancel_requested' && (
                          <>
                            <button onClick={() => handleApproveCancel(sale)} disabled={actionLoading === `approve-${sale.id}`} className="text-xs px-2.5 py-1 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 font-medium">Approve</button>
                            <button onClick={() => handleRejectCancel(sale)} disabled={actionLoading === `reject-${sale.id}`} className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium">Reject</button>
                          </>
                        )}
                        {canRequestCancel && sale.status === 'completed' && (
                          <button onClick={() => openRequestCancel(sale)} className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium">Request Cancel</button>
                        )}
                        {canRequestCancel && sale.status === 'cancel_requested' && (
                          <span className="text-xs text-amber-600 font-medium italic">Pending approval</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* View Sale Modal */}
      <Modal isOpen={showView} onClose={() => setShowView(false)} title={`Sale #${selected?.id}`} size="lg">
        {selectedDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Location:</span> <strong>{selectedDetail.location_name}</strong></div>
              <div><span className="text-gray-500">Sold By:</span> <strong>{selectedDetail.sold_by_name}</strong></div>
              <div><span className="text-gray-500">Customer:</span> <strong>{selectedDetail.customer_name || '—'}</strong></div>
              <div><span className="text-gray-500">Date:</span> <strong>{formatDate(selectedDetail.created_at)}</strong></div>
              <div><span className="text-gray-500">Status:</span> <StatusBadge status={selectedDetail.status} /></div>
            </div>

            {selectedDetail.status === 'cancel_requested' && selectedDetail.cancel_request_reason && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-amber-800 mb-1">Cancellation Requested</div>
                <div className="text-amber-700"><span className="font-medium">Reason:</span> {selectedDetail.cancel_request_reason}</div>
                {selectedDetail.cancel_requested_at && (
                  <div className="text-amber-600 text-xs mt-1">{formatDate(selectedDetail.cancel_requested_at)}</div>
                )}
              </div>
            )}

            {selectedDetail.status === 'cancelled' && selectedDetail.cancel_reason && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-gray-700 mb-1">Cancellation Reason</div>
                <div className="text-gray-600">{selectedDetail.cancel_reason}</div>
                {selectedDetail.cancelled_at && <div className="text-gray-400 text-xs mt-1">{formatDate(selectedDetail.cancelled_at)}</div>}
              </div>
            )}

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Product', 'Unit', 'Qty', ...(!isStaff ? ['Unit Price', 'Subtotal'] : [])].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(selectedDetail.items || []).map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2.5 font-medium">{item.product_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{item.unit}</td>
                      <td className="px-4 py-2.5">{item.quantity}</td>
                      {!isStaff && <td className="px-4 py-2.5">{formatCurrency(item.unit_price)}</td>}
                      {!isStaff && <td className="px-4 py-2.5 font-medium">{formatCurrency(item.subtotal)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isStaff && (
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatCurrency(selectedDetail.total_amount)}</span>
                </div>
                {selectedDetail.discount_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount</span>
                    <span>- {formatCurrency(selectedDetail.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                  <span>Total</span>
                  <span>{formatCurrency((parseFloat(selectedDetail.total_amount) || 0) - (parseFloat(selectedDetail.discount_amount) || 0))}</span>
                </div>
              </div>
            )}

            {selectedDetail.notes && (
              <div>
                <span className="text-sm font-medium text-gray-700">Notes: </span>
                <span className="text-sm text-gray-600">{selectedDetail.notes}</span>
              </div>
            )}

            {canDirectCancel && selectedDetail.status === 'completed' && (
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setShowView(false); openCancel(selectedDetail); }}
                  className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded-lg"
                >
                  Cancel Sale
                </button>
              </div>
            )}

            {canDirectCancel && selectedDetail.status === 'cancel_requested' && (
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setShowView(false); handleRejectCancel(selectedDetail); }}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                >
                  Reject Request
                </button>
                <button
                  onClick={() => { setShowView(false); handleApproveCancel(selectedDetail); }}
                  className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg"
                >
                  Approve Cancellation
                </button>
              </div>
            )}

            {canRequestCancel && selectedDetail.status === 'completed' && (
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setShowView(false); openRequestCancel(selectedDetail); }}
                  className="px-4 py-2 text-sm bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg"
                >
                  Request Cancellation
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Record Sale Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Record New Sale" size="xl">
        <div className="space-y-0">

          {/* Section A: Sale Information */}
          <div className="mb-4">
            <div className="bg-blue-600 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-t-lg">
              Sale Information
            </div>
            <div className="border border-blue-200 rounded-b-lg p-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Location <span className="text-red-500">*</span></label>
                {(isAdmin || isManager) ? (
                  <select
                    value={saleLocation}
                    onChange={(e) => { setSaleLocation(e.target.value); if (e.target.value) fetchInventory(e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select location</option>
                    {locations.filter((l) => l.type === 'branch').map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    readOnly
                    value={locations.find((l) => String(l.id) === String(saleLocation))?.name || ''}
                    className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section B: Item Selection */}
          <div className="mb-4">
            <div className="bg-blue-600 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-t-lg">
              Item Selection
            </div>
            <div className="border border-blue-200 rounded-b-lg p-4 space-y-3">
              {saleItems.map((item, idx) => {
                const availQty = item.product_id
                  ? inventory.filter((iv) => String(iv.product_id) === String(item.product_id) &&
                      (!saleLocation || String(iv.location_id) === String(saleLocation)))
                      .reduce((s, iv) => s + parseFloat(iv.quantity || 0), 0)
                  : null;
                return (
                  <div key={idx} className="space-y-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    {/* Search */}
                    <div className="relative">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        Search Item <span className="text-red-500">*</span>
                        {saleItems.length > 1 && (
                          <button onClick={() => removeSaleItem(idx)} className="ml-2 text-red-400 hover:text-red-600 font-normal">
                            (Remove item {idx + 1})
                          </button>
                        )}
                      </label>
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={item.search}
                          onChange={(e) => updateSaleItemSearch(idx, e.target.value)}
                          onFocus={() => {
                            if (item.results.length > 0) setSaleItems((prev) => prev.map((it, i) => i === idx ? { ...it, showDrop: true } : it));
                          }}
                          onBlur={() => setTimeout(() => setSaleItems((prev) => prev.map((it, i) => i === idx ? { ...it, showDrop: false } : it)), 150)}
                          placeholder="Search for item to sell..."
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {item.showDrop && (
                          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                            {item.results.map((p) => (
                              <button
                                key={p.id}
                                onMouseDown={() => selectSaleProduct(idx, p)}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between"
                              >
                                <span className="font-medium text-gray-800">{p.name}</span>
                                <span className="text-xs text-gray-400 ml-2">{p.unit}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {availQty !== null && (
                        <span className={`text-xs mt-0.5 block ${availQty > 0 ? 'text-gray-400' : 'text-red-500 font-medium'}`}>
                          Available: {Math.round(availQty).toLocaleString('en-PH')} {item.unit}
                        </span>
                      )}
                    </div>
                    {/* Batch selector */}
                    {item.product_id && (
                      <div className="mb-2">
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select Batch</label>
                        {item.loadingBatches ? (
                          <div className="text-xs text-gray-400 animate-pulse">Loading batches...</div>
                        ) : item.batches.length === 0 ? (
                          <div className="text-xs text-amber-600">No stock found at this location</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {item.batches.map(batch => {
                              const isSelected = item.inventory_id === batch.id;
                              const expiryColor = batch.expiry_status === 'expired' ? 'text-red-500' : batch.expiry_status === 'expiring_soon' ? 'text-amber-500' : 'text-gray-400';
                              return (
                                <button
                                  key={batch.id}
                                  type="button"
                                  onClick={() => selectBatch(idx, batch)}
                                  className={`px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                                    isSelected
                                      ? 'bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-300'
                                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                                  }`}
                                >
                                  <div className="font-semibold">{batch.batch_number || 'No Batch #'}</div>
                                  <div className={`mt-0.5 ${expiryColor}`}>{batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('en-PH', {month:'short', day:'numeric', year:'numeric'}) : 'No Expiry'}</div>
                                  <div className="text-gray-500 mt-0.5">{Math.round(parseFloat(batch.quantity)).toLocaleString('en-PH')} avail{!isStaff && batch.unit_cost ? ` · ₱${parseFloat(batch.unit_cost).toFixed(2)}` : ''}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {/* 4-column row */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Item Description <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          readOnly
                          value={item.product_name}
                          placeholder="Auto-filled"
                          className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600 cursor-default"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Unit <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          readOnly
                          value={item.unit}
                          placeholder="Auto-filled"
                          className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600 cursor-default"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity Sold <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateSaleItemField(idx, 'quantity', e.target.value)}
                          placeholder="Enter quantity"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Unit Price <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateSaleItemField(idx, 'unit_price', e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {item.product_id && item.unit_price && (
                          <span className="text-xs text-gray-400 mt-0.5 block">
                            Subtotal: {formatCurrency(getSubtotal(item))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add Item button */}
              <button
                onClick={addSaleItem}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add another item
              </button>

              {/* Payment Method + Customer Name */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Method <span className="text-red-500">*</span></label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya / PayMaya</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="check">Check</option>
                    <option value="consignment">Consignment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={saleCustomer}
                    onChange={(e) => setSaleCustomer(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Discount Options */}
          <div className="mb-4">
            <div className="bg-blue-600 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-t-lg flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Discount Options
            </div>
            <div className="border border-blue-200 rounded-b-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => { setDiscountType(e.target.value); setDiscountValue(''); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">No Discount</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {discountType === 'fixed' ? 'Discount Amount (₱)' : discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Value'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : undefined}
                    step="0.01"
                    value={discountValue}
                    disabled={discountType === 'none'}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'fixed' ? '0.00' : discountType === 'percentage' ? '0' : '—'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Totals + Submit */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>
                  Discount
                  {discountType === 'percentage' && discountValue ? ` (${discountValue}%)` : ''}
                </span>
                <span>- {formatCurrency(discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2">
              <span>Total</span>
              <span className="text-green-700">{formatCurrency(finalAmount)}</span>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-6 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-semibold transition-colors"
            >
              {creating && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {creating ? 'Recording...' : 'Record Sale'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Admin: Direct Cancel Modal */}
      <Modal isOpen={showCancel} onClose={() => setShowCancel(false)} title="Cancel Sale" size="sm">
        <p className="text-sm text-gray-600 mb-4">Cancel Sale #{selected?.id}? This will restore inventory.</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
          <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Provide a reason for cancellation..." />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowCancel(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Back</button>
          <button onClick={handleCancel} disabled={cancelling}
            className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg font-medium flex items-center gap-2">
            {cancelling && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {cancelling ? 'Cancelling...' : 'Cancel Sale'}
          </button>
        </div>
      </Modal>

      {/* Staff/Manager: Request Cancel Modal */}
      <Modal isOpen={showRequestCancel} onClose={() => setShowRequestCancel(false)} title="Request Cancellation" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          Request cancellation for Sale #{selected?.id}. An admin will review and approve or reject your request.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
          <textarea value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Why do you need to cancel this sale?" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowRequestCancel(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Back</button>
          <button onClick={handleRequestCancel} disabled={requesting}
            className="px-4 py-2 text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 rounded-lg font-medium flex items-center gap-2">
            {requesting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {requesting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
