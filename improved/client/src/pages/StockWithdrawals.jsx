import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const TYPE_LABELS = {
  employee_purchase: 'Employee Purchase',
  principal: 'Principal / Owner',
  outside_party: 'Outside Party',
  expired: 'Expired',
  damaged: 'Damaged',
  other: 'Other',
};

const TYPE_COLORS = {
  employee_purchase: 'bg-blue-100 text-blue-800',
  principal: 'bg-purple-100 text-purple-800',
  outside_party: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-red-100 text-red-800',
  damaged: 'bg-orange-100 text-orange-800',
  other: 'bg-gray-100 text-gray-700',
};

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StockWithdrawals() {
  const { user, isAdmin, isManager, canEdit } = useAuth();
  const { showToast } = useToast();

  const [withdrawals, setWithdrawals] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sourceProducts, setSourceProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [showView, setShowView] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [creating, setCreating] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Create form
  const [formLocation, setFormLocation] = useState('');
  const [formType, setFormType] = useState('other');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState([]);

  useEffect(() => {
    fetchWithdrawals();
    fetchLocations();
  }, []);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.withdrawal_type = filterType;
      if (filterFrom) params.from_date = filterFrom;
      if (filterTo) params.to_date = filterTo;
      const res = await apiClient.get('/api/stock-withdrawals', { params });
      setWithdrawals(res.data || []);
    } catch {
      showToast('Failed to load withdrawals.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWithdrawals(); }, [filterType, filterFrom, filterTo]);

  const fetchLocations = async () => {
    try {
      const res = await apiClient.get('/api/locations');
      setLocations(res.data || []);
    } catch {}
  };

  const fetchSourceProducts = async (locationId) => {
    if (!locationId) { setSourceProducts([]); return; }
    try {
      const res = await apiClient.get('/api/inventory', { params: { location_id: locationId } });
      const map = new Map();
      for (const row of res.data || []) {
        const pid = row.product_id;
        if (!map.has(pid)) map.set(pid, { product_id: pid, product_name: row.product_name, unit: row.unit, available_qty: 0 });
        map.get(pid).available_qty += parseFloat(row.quantity);
      }
      setSourceProducts(Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name)));
    } catch {}
  };

  const openCreate = () => {
    const defaultLoc = (isAdmin || isManager) ? '' : String(user?.location_id || '');
    setFormLocation(defaultLoc);
    setFormType('other');
    setFormReason('');
    setFormNotes('');
    setFormItems([]);
    if (defaultLoc) fetchSourceProducts(defaultLoc);
    setShowCreate(true);
  };

  const addItem = (p) => {
    setFormItems((prev) => {
      if (prev.find((i) => i.product_id === p.product_id)) return prev;
      return [...prev, { product_id: p.product_id, quantity: '', product_name: p.product_name, unit: p.unit, available_qty: p.available_qty }];
    });
  };

  const removeItem = (pid) => setFormItems((prev) => prev.filter((i) => i.product_id !== pid));
  const setItemQty = (pid, qty) => setFormItems((prev) => prev.map((i) => i.product_id === pid ? { ...i, quantity: qty } : i));

  const handleCreate = async () => {
    const locId = formLocation || user?.location_id;
    if (!locId) { showToast('Select a location.', 'warning'); return; }
    if (formItems.length === 0) { showToast('Add at least one item.', 'warning'); return; }
    for (const item of formItems) {
      const q = parseFloat(item.quantity);
      if (!q || q <= 0) { showToast(`Enter quantity for ${item.product_name}.`, 'warning'); return; }
      if (q > item.available_qty) { showToast(`Not enough stock for ${item.product_name}. Available: ${Math.round(item.available_qty).toLocaleString('en-PH')}.`, 'warning'); return; }
    }
    setCreating(true);
    try {
      await apiClient.post('/api/stock-withdrawals', {
        location_id: parseInt(locId),
        withdrawal_type: formType,
        reason: formReason || undefined,
        notes: formNotes || undefined,
        items: formItems.map((i) => ({ product_id: i.product_id, quantity: parseFloat(i.quantity) })),
      });
      showToast('Withdrawal recorded.', 'success');
      setShowCreate(false);
      fetchWithdrawals();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create withdrawal.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const openView = async (id) => {
    try {
      const res = await apiClient.get(`/api/stock-withdrawals/${id}`);
      setSelectedDetail(res.data);
      setShowView(true);
    } catch {
      showToast('Failed to load details.', 'error');
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'Location', 'Type', 'Reason', 'Total Value', 'Items', 'By'];
    const rows = withdrawals.map((w) => [
      w.id, fmt(w.created_at), w.location_name, TYPE_LABELS[w.withdrawal_type] || w.withdrawal_type,
      w.reason || '', `₱${parseFloat(w.total_value || 0).toFixed(2)}`, w.item_count, w.withdrawn_by_name,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `withdrawals_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Withdrawals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track items removed for employee use, damage, expiry, etc.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          {canEdit && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Withdrawal
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">From</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">To</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo(''); }} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Clear</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : withdrawals.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">No withdrawals found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  {['ID', 'Date', 'Location', 'Type', 'Items', 'Value', 'By', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">#{w.id}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmt(w.created_at)}</td>
                    <td className="px-5 py-3 text-gray-700">{w.location_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[w.withdrawal_type] || 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABELS[w.withdrawal_type] || w.withdrawal_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{w.item_count}</td>
                    <td className="px-5 py-3 text-gray-700 font-medium">₱{parseFloat(w.total_value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3 text-gray-600">{w.withdrawn_by_name}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => openView(w.id)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* View Modal */}
      <Modal isOpen={showView} onClose={() => setShowView(false)} title={`Withdrawal #${selectedDetail?.id}`} size="lg">
        {selectedDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Location:</span> <strong>{selectedDetail.location_name}</strong></div>
              <div><span className="text-gray-500">Type:</span> <strong>{TYPE_LABELS[selectedDetail.withdrawal_type]}</strong></div>
              <div><span className="text-gray-500">By:</span> <strong>{selectedDetail.withdrawn_by_name}</strong></div>
              <div><span className="text-gray-500">Date:</span> <strong>{fmt(selectedDetail.created_at)}</strong></div>
              {selectedDetail.reason && <div className="col-span-2"><span className="text-gray-500">Reason:</span> {selectedDetail.reason}</div>}
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Product', 'Batch', 'Expiry', 'Qty', 'Unit Cost', 'Subtotal'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(selectedDetail.items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-medium">{item.product_name} <span className="text-gray-400 text-xs">({item.unit})</span></td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{item.batch_number || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-gray-600">{item.unit_cost ? `₱${parseFloat(item.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                      <td className="px-4 py-2.5 font-medium">₱{parseFloat(item.subtotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right text-sm font-bold text-gray-900">Total: ₱{parseFloat(selectedDetail.total_value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Stock Withdrawal" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {(isAdmin || isManager) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={formLocation}
                  onChange={(e) => { setFormLocation(e.target.value); fetchSourceProducts(e.target.value); setFormItems([]); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select location...</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Withdrawal Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input
              type="text"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief reason..."
            />
          </div>

          {/* Product selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Products</label>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
              {sourceProducts.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">{formLocation || !isAdmin ? 'No stock available.' : 'Select a location first.'}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Available</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Qty</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sourceProducts.map((p) => {
                      const picked = formItems.find((i) => i.product_id === p.product_id);
                      return (
                        <tr key={p.product_id} className={picked ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-2 font-medium">{p.product_name} <span className="text-gray-400 text-xs">({p.unit})</span></td>
                          <td className="px-4 py-2 text-gray-700">{Math.round(p.available_qty).toLocaleString('en-PH')}</td>
                          <td className="px-4 py-2">
                            {picked ? (
                              <input
                                type="number" min="0.01" max={p.available_qty} step="0.01"
                                value={picked.quantity}
                                onChange={(e) => setItemQty(p.product_id, e.target.value)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2">
                            {picked ? (
                              <button onClick={() => removeItem(p.product_id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                            ) : (
                              <button onClick={() => addItem(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {formItems.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
              {formItems.map((i) => (
                <div key={i.product_id} className="flex justify-between">
                  <span className="text-gray-700">{i.product_name}</span>
                  <span className="font-medium">{i.quantity || '?'} {i.unit}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium flex items-center gap-2"
            >
              {creating && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {creating ? 'Recording...' : 'Record Withdrawal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
