import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import CdrImportModal from '../components/CdrImportModal';
import ExpressTransferModal from '../components/ExpressTransferModal';

const STATUS_LABELS = {
  pending: 'AWAITING MANAGER',
  approved: 'IN TRANSIT',
  shipped: 'IN TRANSIT',
  received: 'COMPLETED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
};

function StatusBadge({ status }) {
  const map = {
    pending: 'border border-amber-400 text-amber-600 bg-amber-50',
    approved: 'border border-blue-400 text-blue-600 bg-blue-50',
    shipped: 'border border-indigo-400 text-indigo-600 bg-indigo-50',
    received: 'border border-green-400 text-green-700 bg-green-50',
    rejected: 'border border-red-400 text-red-600 bg-red-50',
    cancelled: 'border border-gray-300 text-gray-500 bg-gray-50',
  };
  const isCompleted = status === 'received';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide whitespace-nowrap ${map[status] || map.cancelled}`}>
      {isCompleted && (
        <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {STATUS_LABELS[status] || status.toUpperCase()}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function fmtMoney(v) {
  const n = parseFloat(v) || 0;
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toString();
}

let _ruid = 0;
const ruid = () => `rq-${++_ruid}`;
const blankWReqItem = () => ({ id: ruid(), description: '', unit: '', quantity: '' });

export default function Transfers() {
  const { user, isAdmin, isWarehouse, isManager, isStaff, canEdit } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sourceProducts, setSourceProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showCdrImport, setShowCdrImport] = useState(false);
  const [showExpressTransfer, setShowExpressTransfer] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createFromLocation, setCreateFromLocation] = useState('');
  const [createToLocation, setCreateToLocation] = useState('');
  const [createItems, setCreateItems] = useState([]);
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // History modal
  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState('received');
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  // Receive modal
  const [showReceive, setShowReceive] = useState(false);
  const [receiveTransferId, setReceiveTransferId] = useState(null);
  const [receiveItems, setReceiveItems] = useState([]);
  const [receiving, setReceiving] = useState(false);

  // Confirm action modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Expand/collapse transfer rows
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpand = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Request from Warehouse modal
  const [showWReq, setShowWReq] = useState(false);
  const [wReqFrom, setWReqFrom] = useState('');
  const [wReqItems, setWReqItems] = useState([blankWReqItem()]);
  const [wReqNotes, setWReqNotes] = useState('');
  const [wReqSubmitting, setWReqSubmitting] = useState(false);

  // Request Return modal
  const [showReturnReq, setShowReturnReq] = useState(false);
  const [retDesc, setRetDesc] = useState('');
  const [retSearch, setRetSearch] = useState('');
  const [retShowDrop, setRetShowDrop] = useState(false);
  const [retUnit, setRetUnit] = useState('');
  const [retQty, setRetQty] = useState('');
  const [retWarehouse, setRetWarehouse] = useState('');
  const [retNote, setRetNote] = useState('');
  const [retSubmitting, setRetSubmitting] = useState(false);
  const [deliveredItems, setDeliveredItems] = useState([]);

  useEffect(() => {
    fetchItems();
    fetchLocations();
  }, []);

  useEffect(() => {
    if (!showReturnReq || !user?.location_id) return;
    apiClient.get('/api/deliveries')
      .then(r => {
        const delivered = (r.data || []).filter(d =>
          d.status === 'delivered' && String(d.to_location_id) === String(user.location_id)
        );
        const map = new Map();
        for (const d of delivered) {
          for (const item of (d.items || []).filter(i => i?.description)) {
            const key = item.description.toLowerCase();
            if (!map.has(key)) map.set(key, { description: item.description, unit: item.unit || '' });
          }
        }
        setDeliveredItems(Array.from(map.values()).sort((a, b) => a.description.localeCompare(b.description)));
      })
      .catch(() => {});
  }, [showReturnReq]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/transfers/items');
      setItems(res.data || []);
    } catch {
      showToast('Failed to load transfers.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await apiClient.get('/api/locations');
      setLocations(res.data || []);
    } catch {}
  };

  const fetchSourceProducts = async (locationId) => {
    if (!locationId) return;
    try {
      const res = await apiClient.get('/api/inventory', { params: { location_id: locationId } });
      const map = new Map();
      for (const row of res.data || []) {
        const pid = row.product_id;
        if (!map.has(pid)) {
          map.set(pid, { product_id: pid, product_name: row.product_name, unit: row.unit, available_qty: 0, batches: [] });
        }
        const p = map.get(pid);
        p.available_qty += parseFloat(row.quantity);
        p.batches.push({
          id: row.id,
          batch_number: row.batch_number,
          expiry_date: row.expiry_date,
          quantity: parseFloat(row.quantity),
          unit_cost: row.unit_cost,
          expiry_status: row.expiry_status,
          qty_to_send: '',
        });
      }
      setSourceProducts(Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name)));
    } catch {}
  };

  const fetchTransferDetail = async (transferId) => {
    try {
      const res = await apiClient.get(`/api/transfers/${transferId}`);
      return res.data;
    } catch { return null; }
  };

  // Actions
  const doAction = async (type, transferId, extra = {}) => {
    setConfirming(true);
    try {
      if (type === 'approve') await apiClient.put(`/api/transfers/${transferId}/approve`);
      else if (type === 'reject') await apiClient.put(`/api/transfers/${transferId}/reject`, { reason: confirmReason });
      else if (type === 'ship') await apiClient.put(`/api/transfers/${transferId}/ship`);
      else if (type === 'cancel') await apiClient.put(`/api/transfers/${transferId}/cancel`, { reason: confirmReason });
      else if (type === 'unreceive') await apiClient.put(`/api/transfers/${transferId}/unreceive`);
      showToast(`Transfer ${type}d successfully.`, 'success');
      setShowConfirm(false);
      fetchItems();
    } catch (err) {
      showToast(err.response?.data?.error || `Failed to ${type} transfer.`, 'error');
    } finally {
      setConfirming(false);
    }
  };

  const openConfirm = (type, transferId, fromName, toName) => {
    setConfirmAction({ type, transferId, fromName, toName });
    setConfirmReason('');
    setShowConfirm(true);
  };

  const openReceive = async (transferId) => {
    const detail = await fetchTransferDetail(transferId);
    if (!detail) return;
    setReceiveTransferId(transferId);
    setReceiveItems((detail.items || []).map((item) => {
      const sent = parseFloat(item.quantity_sent) || 0;
      return {
        transfer_item_id: item.id,
        product_name: item.product_name,
        unit: item.unit,
        quantity_sent: sent,
        quantity_received: sent,
        batch_number: item.batch_number,
        selected: true,
      };
    }));
    setShowReceive(true);
  };

  const handleReceive = async () => {
    setReceiving(true);
    try {
      await apiClient.put(`/api/transfers/${receiveTransferId}/receive`, {
        items: receiveItems.filter((i) => i.selected).map((i) => ({
          transfer_item_id: i.transfer_item_id,
          quantity_received: parseFloat(i.quantity_received),
        })),
      });
      showToast('Transfer received successfully.', 'success');
      setShowReceive(false);
      fetchItems();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to receive transfer.', 'error');
    } finally {
      setReceiving(false);
    }
  };

  const openCreate = () => {
    setCreateStep(1);
    setCreateFromLocation(isAdmin ? '' : String(user?.location_id || ''));
    setCreateToLocation('');
    setCreateItems([]);
    setCreateNotes('');
    setSourceProducts([]);
    setProductSearch('');
    setShowCreate(true);
  };

  const addProductItem = (p) => {
    setCreateItems((prev) => prev.find((i) => i.product_id === p.product_id)
      ? prev
      : [...prev, { ...p, batches: p.batches.map(b => ({ ...b, qty_to_send: '' })) }]);
  };
  const removeItem = (pid) => setCreateItems((prev) => prev.filter((i) => i.product_id !== pid));

  const setBatchQty = (productId, batchId, qty) => {
    setCreateItems(prev => prev.map(item =>
      item.product_id !== productId ? item : {
        ...item,
        batches: item.batches.map(b => b.id === batchId ? { ...b, qty_to_send: qty } : b)
      }
    ));
  };

  const handleCreate = async () => {
    const transferItems = createItems.flatMap(p =>
      p.batches
        .filter(b => parseFloat(b.qty_to_send) > 0)
        .map(b => ({ product_id: p.product_id, inventory_id: b.id, quantity: parseFloat(b.qty_to_send) }))
    );
    if (transferItems.length === 0) { showToast('Enter quantity for at least one batch.', 'warning'); return; }

    for (const p of createItems) {
      for (const b of p.batches) {
        const qty = parseFloat(b.qty_to_send) || 0;
        if (qty > b.quantity) {
          showToast(`Qty for "${p.product_name}" batch exceeds available (${b.quantity}).`, 'warning');
          return;
        }
      }
    }

    setCreating(true);
    try {
      const fromLocId = isAdmin ? parseInt(createFromLocation) : user?.location_id;
      await apiClient.post('/api/transfers', {
        to_location_id: parseInt(createToLocation),
        from_location_id: fromLocId,
        items: transferItems,
        notes: createNotes || undefined,
      });
      showToast('Transfer created successfully.', 'success');
      setShowCreate(false);
      fetchItems();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create transfer.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = () => {
    if (!historyTransfers.length) { showToast('No data to export.', 'warning'); return; }
    const header = ['Date', 'Status', 'From', 'To', 'Product', 'Unit', 'Qty', 'Value', 'Requested By'];
    const csvRows = [];
    for (const t of historyTransfers) {
      for (const item of t.items) {
        csvRows.push([
          fmtDate(t.created_at), STATUS_LABELS[t.status] || t.status,
          `"${t.from_location_name}"`, `"${t.to_location_name}"`,
          `"${item.product_name}"`, item.unit, fmtQty(item.quantity_sent),
          parseFloat(item.value || 0).toFixed(2), `"${t.requested_by_name}"`,
        ].join(','));
      }
    }
    const csv = [header.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transfers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const canCreate = isAdmin || isWarehouse || isManager;
  const canApprove = isAdmin || isManager;
  const canShip = isAdmin || isWarehouse;
  const canReceive = isAdmin || isManager || isStaff;
  const canCancel = isAdmin;
  const isBranch = (isManager || isStaff) && !isAdmin && !isWarehouse;
  const warehouseLocs = useMemo(() => locations.filter(l => l.type === 'warehouse' || l.type === 'main'), [locations]);

  const handleWReqSubmit = async (e) => {
    e.preventDefault();
    const valid = wReqItems.filter(i => i.description.trim() && i.unit.trim() && parseFloat(i.quantity) > 0);
    if (!valid.length) { showToast('Add at least one item with description, unit, and quantity.', 'warning'); return; }
    if (!wReqFrom) { showToast('Please select a warehouse.', 'warning'); return; }
    setWReqSubmitting(true);
    try {
      await apiClient.post('/api/deliveries', {
        from_location_id: parseInt(wReqFrom),
        to_location_id: user.location_id,
        delivery_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        notes: wReqNotes.trim() || null,
        items: valid.map(i => ({ description: i.description.trim(), unit: i.unit.trim(), quantity: parseFloat(i.quantity), unit_cost: 0 })),
      });
      showToast('Request submitted successfully. Awaiting admin approval.', 'success');
      setShowWReq(false);
      setWReqItems([blankWReqItem()]);
      setWReqFrom('');
      setWReqNotes('');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit request.', 'error');
    } finally {
      setWReqSubmitting(false);
    }
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!retDesc.trim()) { showToast('Please select an item from the delivered items list.', 'warning'); return; }
    if (!retUnit.trim() || !parseFloat(retQty) || !retWarehouse || !retNote.trim()) {
      showToast('Please fill all required fields.', 'warning');
      return;
    }
    setRetSubmitting(true);
    try {
      await apiClient.post('/api/deliveries', {
        from_location_id: user.location_id,
        to_location_id: parseInt(retWarehouse),
        delivery_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        notes: `RETURN REQUEST: ${retNote.trim()}`,
        items: [{ description: retDesc.trim(), unit: retUnit.trim(), quantity: parseFloat(retQty), unit_cost: 0 }],
      });
      showToast('Return request submitted. Awaiting admin approval.', 'success');
      setShowReturnReq(false);
      setRetDesc(''); setRetUnit(''); setRetQty(''); setRetWarehouse(''); setRetNote('');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit return request.', 'error');
    } finally {
      setRetSubmitting(false);
    }
  };

  // Group flat item rows into transfers with items[]
  const transfers = useMemo(() => {
    const map = new Map();
    for (const row of items) {
      if (!map.has(row.transfer_id)) {
        map.set(row.transfer_id, {
          transfer_id: row.transfer_id,
          status: row.status,
          created_at: row.created_at,
          from_location_id: row.from_location_id,
          to_location_id: row.to_location_id,
          from_location_name: row.from_location_name,
          to_location_name: row.to_location_name,
          requested_by_name: row.requested_by_name,
          items: [],
        });
      }
      if (row.item_id) {
        map.get(row.transfer_id).items.push({
          item_id: row.item_id,
          product_name: row.product_name,
          unit: row.unit,
          quantity_sent: row.quantity_sent,
          quantity_received: row.quantity_received,
          value: row.value,
        });
      }
    }
    for (const t of map.values()) {
      t.total_value = t.items.reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    }
    return Array.from(map.values());
  }, [items]);

  const pendingTransfers = transfers.filter((t) => t.status === 'pending');

  const historyTransfers = useMemo(() => transfers.filter((t) => {
    if (t.status === 'pending') return false;
    if (startDate && new Date(t.created_at) < new Date(startDate)) return false;
    if (endDate && new Date(t.created_at) > new Date(endDate + 'T23:59:59')) return false;
    if (fromLoc && String(t.from_location_id) !== fromLoc) return false;
    if (toLoc && String(t.to_location_id) !== toLoc) return false;
    if (search) {
      const q = search.toLowerCase();
      const inLocations = t.from_location_name.toLowerCase().includes(q) || t.to_location_name.toLowerCase().includes(q);
      const inItems = t.items.some((i) => (i.product_name || '').toLowerCase().includes(q));
      if (!inLocations && !inItems) return false;
    }
    return true;
  }), [transfers, search, startDate, endDate, fromLoc, toLoc]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Branch-to-Branch Transfers</h1>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4" style={{ borderLeft: '4px solid #3b82f6' }}>
        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="font-semibold text-blue-800 text-sm">Branch-to-Branch Transfers Only</p>
          <p className="text-blue-600 text-sm mt-0.5">This page is for transfers between branches. For warehouse deliveries, go to the Deliveries page.</p>
        </div>
      </div>

      {/* Pending Approvals */}
      {canApprove && pendingTransfers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold text-amber-700 text-base">Pending Approvals ({pendingTransfers.length})</span>
            </div>

            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-amber-700">These transfer requests need your approval</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['', 'REQUESTED BY', 'FROM → TO', 'ITEMS', 'TOTAL VALUE', 'STATUS', 'ACTIONS'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingTransfers.map((t) => (
                    <React.Fragment key={t.transfer_id}>
                      <tr className="hover:bg-gray-50 cursor-pointer select-none" onClick={() => toggleExpand(t.transfer_id)}>
                        <td className="px-2 py-3">
                          <div className="w-6 h-6 flex items-center justify-center text-gray-400">
                            <svg className={`w-4 h-4 transition-transform ${expandedIds.has(t.transfer_id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{t.requested_by_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-gray-800">{t.from_location_name}</span>
                          <span className="text-gray-400 mx-1.5">→</span>
                          <span className="font-medium text-gray-800">{t.to_location_name}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{t.items.length} item{t.items.length !== 1 ? 's' : ''}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmtMoney(t.total_value)}</td>
                        <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openConfirm('approve', t.transfer_id, t.from_location_name, t.to_location_name)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                Approve
                              </button>
                              <button
                                onClick={() => openConfirm('reject', t.transfer_id, t.from_location_name, t.to_location_name)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedIds.has(t.transfer_id) && t.items.map((item) => (
                        <tr key={item.item_id} className="bg-amber-50/40">
                          <td className="pl-6 py-2 text-gray-400 text-xs">↳</td>
                          <td className="px-4 py-2 font-semibold text-gray-800 text-xs" colSpan={2}>
                            {item.product_name} <span className="text-gray-400 font-normal">({item.unit})</span>
                          </td>
                          <td className="px-4 py-2 text-gray-700 text-xs">{fmtQty(item.quantity_sent)} {item.unit}</td>
                          <td className="px-4 py-2 text-gray-600 text-xs">{fmtMoney(item.value)}</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Transfer History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span className="font-semibold text-gray-900">Transfer History</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canCreate && canEdit && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                New Transfer
              </button>
            )}
            {(isAdmin || isWarehouse) && canEdit && (
              <button
                onClick={() => setShowExpressTransfer(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Express Transfer
              </button>
            )}
            {(isAdmin || isWarehouse) && canEdit && (
              <button
                onClick={() => setShowCdrImport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CDR Import
              </button>
            )}
            {isBranch && canEdit && (
              <>
                <button
                  onClick={() => { setWReqItems([blankWReqItem()]); setWReqFrom(''); setWReqNotes(''); setShowWReq(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Request from Warehouse
                </button>
                <button
                  onClick={() => { setRetDesc(''); setRetSearch(''); setRetShowDrop(false); setRetUnit(''); setRetQty(''); setRetWarehouse(''); setRetNote(''); setShowReturnReq(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Request Return
                </button>
              </>
            )}
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr auto auto 1fr 1fr auto' }}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Search Product</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product, location..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Location</label>
              <select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
                <option value="">All</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Location</label>
              <select value={toLoc} onChange={(e) => setToLoc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
                <option value="">All</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setSearch(''); setStartDate(''); setEndDate(''); setFromLoc(''); setToLoc(''); }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : historyTransfers.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No transfers found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['', 'DATE', 'STATUS', 'FROM → TO', 'ITEMS', 'TOTAL VALUE', 'REQUESTED BY', 'ACTIONS'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyTransfers.map((t) => (
                  <React.Fragment key={t.transfer_id}>
                    <tr className="hover:bg-gray-50 transition-colors cursor-pointer select-none" onClick={() => toggleExpand(t.transfer_id)}>
                      <td className="px-2 py-3">
                        <div className="w-6 h-6 flex items-center justify-center text-gray-400">
                          <svg className={`w-4 h-4 transition-transform ${expandedIds.has(t.transfer_id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-gray-800">{t.from_location_name}</span>
                        <span className="text-gray-400 mx-1.5">→</span>
                        <span className="font-medium text-gray-800">{t.to_location_name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{t.items.length} item{t.items.length !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmtMoney(t.total_value)}</td>
                      <td className="px-4 py-3 text-gray-600">{t.requested_by_name}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {canEdit && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {t.status === 'shipped' && canReceive && (
                              <button
                                onClick={() => openReceive(t.transfer_id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Receive
                              </button>
                            )}
                            {t.status === 'received' && isAdmin && (
                              <button
                                onClick={() => openConfirm('unreceive', t.transfer_id, t.from_location_name, t.to_location_name)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 text-xs font-semibold rounded-lg transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Unreceive
                              </button>
                            )}
                            {['pending', 'shipped', 'received'].includes(t.status) && canCancel && (
                              <button
                                onClick={() => openConfirm('cancel', t.transfer_id, t.from_location_name, t.to_location_name)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 text-xs font-semibold rounded-lg transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expandedIds.has(t.transfer_id) && t.items.map((item) => (
                      <tr key={item.item_id} className="bg-blue-50/30">
                        <td className="pl-6 py-2 text-gray-400 text-xs">↳</td>
                        <td className="px-4 py-2 text-gray-500 text-xs" colSpan={2} />
                        <td className="px-4 py-2 font-semibold text-gray-800 text-xs" colSpan={2}>
                          {item.product_name} <span className="text-gray-400 font-normal">({item.unit})</span>
                          <span className="ml-2 text-gray-500 font-normal">{fmtQty(item.quantity_sent)} {item.unit}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-600 text-xs">{fmtMoney(item.value)}</td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Transfer Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Transfer" size="xl">
        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3].map((step) => (
            <React.Fragment key={step}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${createStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {step}
              </div>
              {step < 3 && <div className={`flex-1 h-0.5 ${createStep > step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {createStep === 1 && (
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Select Locations</h3>
            {isAdmin ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Transfer From</label>
                <select value={createFromLocation}
                  onChange={(e) => { setCreateFromLocation(e.target.value); setCreateItems([]); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select source location...</option>
                  {locations.filter((l) => l.type === 'branch').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                Source: <strong>{locations.find((l) => l.id === user?.location_id)?.name || 'Your location'}</strong>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Transfer To</label>
              <select value={createToLocation} onChange={(e) => setCreateToLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select destination...</option>
                {locations
                  .filter((l) => l.type === 'branch' && l.id !== (isAdmin ? parseInt(createFromLocation) : user?.location_id))
                  .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  const fromId = isAdmin ? createFromLocation : user?.location_id;
                  if (!fromId) { showToast('Select a source location.', 'warning'); return; }
                  if (!createToLocation) { showToast('Select a destination.', 'warning'); return; }
                  fetchSourceProducts(isAdmin ? createFromLocation : user?.location_id);
                  setCreateStep(2);
                }}
                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Next: Select Products
              </button>
            </div>
          </div>
        )}

        {createStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Select Products & Batches</h3>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              {sourceProducts.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No stock available at source.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Product / Batch</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Expiry</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Available</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Send Qty</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sourceProducts
                      .filter(p => !productSearch || p.product_name.toLowerCase().includes(productSearch.toLowerCase()))
                      .map(p => {
                        const picked = createItems.find(i => i.product_id === p.product_id);
                        return (
                          <React.Fragment key={p.product_id}>
                            <tr className={picked ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                              <td className="px-4 py-2.5 font-semibold text-gray-900">
                                {p.product_name} <span className="text-gray-400 font-normal text-xs">({p.unit})</span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">{p.batches.length} batch{p.batches.length !== 1 ? 'es' : ''}</td>
                              <td className="px-4 py-2.5 text-gray-700">{Math.round(p.available_qty).toLocaleString('en-PH')}</td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">
                                {picked && (() => {
                                  const total = picked.batches.reduce((s, b) => s + (parseFloat(b.qty_to_send) || 0), 0);
                                  return total > 0 ? <span className="font-semibold text-blue-700">{total} {p.unit} selected</span> : <span className="text-gray-400">—</span>;
                                })()}
                              </td>
                              <td className="px-4 py-2.5">
                                {picked
                                  ? <button onClick={() => removeItem(p.product_id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                                  : <button onClick={() => addProductItem(p)} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">+ Add</button>}
                              </td>
                            </tr>
                            {picked && picked.batches.map(batch => {
                              const expiryColor = batch.expiry_status === 'expired' ? 'text-red-500' :
                                batch.expiry_status === 'expiring_soon' ? 'text-amber-500' : 'text-gray-500';
                              return (
                                <tr key={batch.id} className="bg-blue-50/40 border-t border-blue-100">
                                  <td className="pl-8 pr-4 py-2 text-gray-700 text-xs">
                                    <span className="text-blue-400 mr-1">↳</span>
                                    {batch.batch_number || <span className="italic text-gray-400">No batch #</span>}
                                    {batch.unit_cost && <span className="ml-2 text-gray-400">₱{parseFloat(batch.unit_cost).toFixed(2)}</span>}
                                  </td>
                                  <td className={`px-4 py-2 text-xs ${expiryColor}`}>
                                    {batch.expiry_date
                                      ? new Date(batch.expiry_date).toLocaleDateString('en-PH', {month:'short', day:'numeric', year:'numeric'})
                                      : <span className="text-gray-400">No expiry</span>}
                                  </td>
                                  <td className="px-4 py-2 text-gray-700 text-xs">{Math.round(batch.quantity).toLocaleString('en-PH')}</td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max={batch.quantity}
                                      step="0.01"
                                      value={batch.qty_to_send}
                                      onChange={e => setBatchQty(p.product_id, batch.id, e.target.value)}
                                      placeholder="0"
                                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td></td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
            {createItems.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Summary:</p>
                {createItems.map(item => {
                  const batchesWithQty = item.batches.filter(b => parseFloat(b.qty_to_send) > 0);
                  const total = item.batches.reduce((s, b) => s + (parseFloat(b.qty_to_send) || 0), 0);
                  if (total === 0) return null;
                  return (
                    <div key={item.product_id} className="text-xs text-blue-600 space-y-0.5">
                      <div className="font-medium">{item.product_name} — {total} {item.unit} total</div>
                      {batchesWithQty.map(b => (
                        <div key={b.id} className="pl-3 text-blue-500">
                          {b.batch_number || 'No batch#'}: {b.qty_to_send} {item.unit}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setCreateStep(1)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Back</button>
              <button
                onClick={() => {
                  const hasQty = createItems.some(p => p.batches.some(b => parseFloat(b.qty_to_send) > 0));
                  if (!hasQty) { showToast('Enter qty for at least one batch.', 'warning'); return; }
                  setCreateStep(3);
                }}
                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Next: Review
              </button>
            </div>
          </div>
        )}

        {createStep === 3 && (
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Review & Confirm</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <div><span className="text-gray-500">From:</span> <strong>{isAdmin ? locations.find((l) => String(l.id) === String(createFromLocation))?.name : locations.find((l) => l.id === user?.location_id)?.name}</strong></div>
              <div><span className="text-gray-500">To:</span> <strong>{locations.find((l) => String(l.id) === String(createToLocation))?.name}</strong></div>
              <div className="pt-2 border-t border-gray-200 space-y-2">
                {createItems.map(item => {
                  const batchesWithQty = item.batches.filter(b => parseFloat(b.qty_to_send) > 0);
                  const total = batchesWithQty.reduce((s, b) => s + parseFloat(b.qty_to_send), 0);
                  return (
                    <div key={item.product_id} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-gray-700">{item.product_name}</span>
                        <span className="font-semibold">{total} {item.unit}</span>
                      </div>
                      {batchesWithQty.map(b => (
                        <div key={b.id} className="flex justify-between text-xs pl-3 text-gray-500">
                          <span>{b.batch_number || 'No batch#'}{b.expiry_date ? ` · exp ${new Date(b.expiry_date).toLocaleDateString('en-PH',{month:'short',year:'numeric'})}` : ''}</span>
                          <span>{b.qty_to_send} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Add any notes..." />
            </div>
            <div className="flex justify-between">
              <button onClick={() => setCreateStep(2)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Back</button>
              <button onClick={handleCreate} disabled={creating}
                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium flex items-center gap-2">
                {creating && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {creating ? 'Creating...' : 'Create Transfer'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Receive Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title={`Receive Transfer #${receiveTransferId}`} size="lg">
        <p className="text-sm text-gray-500 mb-4">Confirm quantities received. You can adjust if partial receipt.</p>
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['', 'Product', 'Batch', 'Sent', 'Qty Received'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receiveItems.map((item, idx) => (
                <tr key={item.transfer_item_id} className={!item.selected ? 'opacity-40' : ''}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={item.selected}
                      onChange={(e) => setReceiveItems((prev) => prev.map((r, i) => i === idx ? { ...r, selected: e.target.checked } : r))}
                      className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  </td>
                  <td className="px-4 py-2.5 font-medium">{item.product_name} <span className="text-gray-400 text-xs">({item.unit})</span></td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{item.batch_number || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700">{fmtQty(item.quantity_sent)}</td>
                  <td className="px-4 py-2.5">
                    <input type="number" min="0" max={item.quantity_sent} step="0.01"
                      value={item.quantity_received}
                      disabled={!item.selected}
                      onChange={(e) => setReceiveItems((prev) => prev.map((r, i) => i === idx ? { ...r, quantity_received: e.target.value } : r))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowReceive(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
          <button onClick={handleReceive} disabled={receiving}
            className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg font-medium flex items-center gap-2">
            {receiving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {receiving ? 'Processing...' : 'Confirm Receipt'}
          </button>
        </div>
      </Modal>

      {/* Confirm Action Modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)}
        title={`${confirmAction?.type?.charAt(0)?.toUpperCase()}${confirmAction?.type?.slice(1)} Transfer`} size="sm">
        <p className="text-sm text-gray-600 mb-4">
          {confirmAction?.type === 'approve' && `Approve and send transfer from ${confirmAction?.fromName} to ${confirmAction?.toName}? It will immediately be marked as In Transit.`}
          {confirmAction?.type === 'reject' && `Reject this transfer? Inventory will be restored to source.`}
          {confirmAction?.type === 'cancel' && `Cancel this transfer? Inventory will be restored to source.`}
          {confirmAction?.type === 'unreceive' && `Unreceive this transfer? Inventory will be removed from destination.`}
        </p>
        {(confirmAction?.type === 'reject' || confirmAction?.type === 'cancel') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Add a reason..." />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
          <button
            onClick={() => doAction(confirmAction?.type, confirmAction?.transferId)}
            disabled={confirming}
            className={`px-4 py-2 text-sm text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-70 ${
              ['approve', 'ship'].includes(confirmAction?.type) ? 'bg-blue-600 hover:bg-blue-700'
              : confirmAction?.type === 'unreceive' ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {confirming && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {confirming ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </Modal>

      {/* Request from Warehouse Modal */}
      <Modal isOpen={showWReq} onClose={() => setShowWReq(false)} title="" size="lg">
        <form onSubmit={handleWReqSubmit}>
          <div className="border-l-4 border-green-500 pl-4 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <h2 className="text-lg font-bold text-green-600">Request from Warehouse</h2>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 flex items-start gap-2 text-sm text-blue-700">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Submit a request to the warehouse. They will review and create a delivery if approved.
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Request From Warehouse *</label>
            <select value={wReqFrom} onChange={e => setWReqFrom(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option value="">Select warehouse...</option>
              {warehouseLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="space-y-3 mb-4">
            {wReqItems.map((item, idx) => (
              <div key={item.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-gray-700">Item {idx + 1}</span>
                  {wReqItems.length > 1 && (
                    <button type="button" onClick={() => setWReqItems(p => p.filter(i => i.id !== item.id))}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Item Description *</label>
                    <input type="text" value={item.description}
                      onChange={e => setWReqItems(p => p.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                      placeholder="Enter item description" required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Unit *</label>
                    <input type="text" value={item.unit}
                      onChange={e => setWReqItems(p => p.map(i => i.id === item.id ? { ...i, unit: e.target.value } : i))}
                      placeholder="e.g., PC, BOX, BOT" required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity *</label>
                    <input type="number" value={item.quantity}
                      onChange={e => setWReqItems(p => p.map(i => i.id === item.id ? { ...i, quantity: e.target.value } : i))}
                      placeholder="0" min="1" step="1" required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button"
            onClick={() => setWReqItems(p => [...p, blankWReqItem()])}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-green-600 border border-green-400 hover:bg-green-50 rounded-lg mb-5 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Add Item
          </button>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (Optional)</label>
            <textarea value={wReqNotes} onChange={e => setWReqNotes(e.target.value)}
              rows={3} placeholder="Add any notes about this request..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white resize-none" />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={wReqSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition-colors">
              {wReqSubmitting
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              }
              {wReqSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button type="button" onClick={() => setShowWReq(false)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Request Return to Warehouse Modal */}
      <Modal isOpen={showReturnReq} onClose={() => setShowReturnReq(false)} title="" size="md">
        <form onSubmit={handleReturnSubmit}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Request Return to Warehouse</h2>
              <p className="text-sm text-gray-500">Items will be sent back pending admin approval</p>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-2 text-sm text-purple-700">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Admin must approve this request. Once approved, the specified quantity will be removed from your inventory and added back to the warehouse.
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Item Description *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input type="text" value={retSearch}
                  onChange={e => { setRetSearch(e.target.value); setRetDesc(''); setRetUnit(''); setRetShowDrop(true); }}
                  onFocus={() => setRetShowDrop(true)}
                  onBlur={() => setTimeout(() => setRetShowDrop(false), 150)}
                  placeholder="Search delivered items..."
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white" />
                {retShowDrop && (
                  <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-44 overflow-y-auto">
                    {deliveredItems.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No delivered items found for your branch.</div>
                    ) : (() => {
                      const filtered = retSearch
                        ? deliveredItems.filter(i => i.description.toLowerCase().includes(retSearch.toLowerCase()))
                        : deliveredItems;
                      return filtered.length === 0
                        ? <div className="px-4 py-3 text-sm text-gray-400 text-center">No matching items.</div>
                        : filtered.map(item => (
                            <button key={item.description} type="button"
                              onMouseDown={() => { setRetDesc(item.description); setRetSearch(item.description); setRetUnit(item.unit); setRetShowDrop(false); }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-purple-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors">
                              <span className="font-medium text-gray-800">{item.description}</span>
                              {item.unit && <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">{item.unit}</span>}
                            </button>
                          ));
                    })()}
                  </div>
                )}
              </div>
              {retSearch && !retDesc && (
                <p className="text-xs text-amber-600 mt-1">Please select an item from the list.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Unit</label>
                <input type="text" value={retUnit} readOnly
                  placeholder="Auto-filled on selection"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-default" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Quantity to Return *</label>
                <input type="number" value={retQty} onChange={e => setRetQty(e.target.value)}
                  placeholder="0" min="1" step="1" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Return to Warehouse *</label>
              <select value={retWarehouse} onChange={e => setRetWarehouse(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                <option value="">Select warehouse...</option>
                {warehouseLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Note / Reason <span className="text-red-500">*</span>
              </label>
              <textarea value={retNote} onChange={e => setRetNote(e.target.value)}
                rows={3} required
                placeholder="Explain why you are returning this item — e.g. wrong item delivered, excess stock..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white resize-none" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowReturnReq(false)}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={retSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg transition-colors">
              {retSubmitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {retSubmitting ? 'Submitting...' : 'Submit Return Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* History Modal */}
      {showHistory && <HistoryModal
        items={items}
        locations={locations}
        user={user}
        isAdmin={isAdmin}
        onClose={() => setShowHistory(false)}
        tab={historyTab}
        setTab={setHistoryTab}
        historyStart={historyStart} setHistoryStart={setHistoryStart}
        historyEnd={historyEnd} setHistoryEnd={setHistoryEnd}
        historyFrom={historyFrom} setHistoryFrom={setHistoryFrom}
        historyTo={historyTo} setHistoryTo={setHistoryTo}
      />}
    </div>
  );
}

function HistoryModal({ items, locations, user, isAdmin, onClose, tab, setTab, historyStart, setHistoryStart, historyEnd, setHistoryEnd, historyFrom, setHistoryFrom, historyTo, setHistoryTo }) {
  const completed = items.filter((i) => i.status === 'received');

  const applyFilters = (rows) => {
    return rows.filter((r) => {
      if (historyStart && new Date(r.created_at) < new Date(historyStart)) return false;
      if (historyEnd && new Date(r.created_at) > new Date(historyEnd + 'T23:59:59')) return false;
      if (historyFrom && String(r.from_location_id) !== historyFrom) return false;
      if (historyTo && String(r.to_location_id) !== historyTo) return false;
      return true;
    });
  };

  const receivedRows = applyFilters(
    isAdmin ? completed : completed.filter((r) => String(r.to_location_id) === String(user?.location_id))
  );
  const sentRows = applyFilters(
    isAdmin ? completed : completed.filter((r) => String(r.from_location_id) === String(user?.location_id))
  );

  const activeRows = tab === 'received' ? receivedRows : sentRows;

  function fmtDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return (
      <div>
        <div className="text-sm text-gray-800">{dt.toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' })}</div>
        <div className="text-xs text-gray-400">{dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Teal header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0f766e, #0d9488)' }}>
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-white font-bold text-lg">Transfer History (Completed)</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Info banners */}
          <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-1.5 text-green-600 font-semibold text-sm mb-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
                Items Received
              </div>
              <p className="text-xs text-gray-500">Stock that arrived at this location — sent from a warehouse or another outlet.</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-amber-600 font-semibold text-sm mb-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                </svg>
                Items Transferred Out
              </div>
              <p className="text-xs text-gray-500">Stock that left this location — sent to a warehouse or another outlet.</p>
            </div>
          </div>

          {/* Filters */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                <input type="date" value={historyStart} onChange={(e) => setHistoryStart(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                <input type="date" value={historyEnd} onChange={(e) => setHistoryEnd(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
              </div>
              <div className="min-w-[160px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">From Location</label>
                <select value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">All</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">To Location</label>
                <select value={historyTo} onChange={(e) => setHistoryTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">All</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button
                onClick={() => { setHistoryStart(''); setHistoryEnd(''); setHistoryFrom(''); setHistoryTo(''); }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 px-6 border-b border-gray-200 bg-white">
            <button
              onClick={() => setTab('received')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'received' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
              Items Received
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'received' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {receivedRows.length}
              </span>
            </button>
            <button
              onClick={() => setTab('sent')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'sent' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              </svg>
              Items Transferred Out
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'sent' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {sentRows.length}
              </span>
            </button>
          </div>

          {/* Table */}
          {activeRows.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No completed transfers found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['DATE', 'ITEM', 'QTY', 'FROM', 'TO', 'BY'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeRows.map((row) => (
                  <tr key={`${row.transfer_id}-${row.item_id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">{fmtDateTime(row.created_at)}</td>
                    <td className="px-5 py-3">
                      <span className="font-bold text-gray-900">{row.product_name}</span>
                      {row.unit && <span className="text-gray-400 text-xs ml-1">({row.unit})</span>}
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{fmtQty(row.quantity_sent)}</td>
                    <td className="px-5 py-3 text-gray-600">{row.from_location_name}</td>
                    <td className="px-5 py-3 text-gray-600">{row.to_location_name}</td>
                    <td className="px-5 py-3 font-bold text-gray-800">{row.requested_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CdrImportModal
        isOpen={showCdrImport}
        onClose={() => setShowCdrImport(false)}
        locations={locations}
        onImportComplete={() => { showToast('CDR import completed!', 'success'); fetchItems(); }}
      />

      <ExpressTransferModal
        isOpen={showExpressTransfer}
        onClose={() => setShowExpressTransfer(false)}
        locations={locations}
        onTransferComplete={() => { showToast('Express transfer completed!', 'success'); fetchItems(); }}
      />
    </div>
  );
}
