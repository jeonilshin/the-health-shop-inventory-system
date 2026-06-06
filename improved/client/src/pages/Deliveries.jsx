import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

/* ── helpers ─────────────────────────────────────────────────────────────── */
function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' });
}
function fmtCur(n) {
  if (n == null) return '—';
  return `₱${parseFloat(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_MAP = {
  pending:         { cls: 'bg-gray-100 text-gray-600 border border-gray-300',      label: 'Pending'        },
  awaiting_admin:  { cls: 'bg-amber-50 text-amber-700 border border-amber-300',    label: 'Awaiting Admin' },
  admin_confirmed: { cls: 'bg-blue-50 text-blue-700 border border-blue-300',       label: 'Confirmed'      },
  in_transit:      { cls: 'bg-indigo-50 text-indigo-700 border border-indigo-300', label: 'In Transit'     },
  delivered:       { cls: 'bg-green-50 text-green-700 border border-green-300',    label: 'Delivered'      },
  rejected:        { cls: 'bg-red-50 text-red-700 border border-red-300',          label: 'Rejected'       },
};

function StatusBadge({ status }) {
  const b = STATUS_MAP[status] || { cls: 'bg-gray-100 text-gray-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${b.cls}`}>
      {status === 'delivered' && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {b.label.toUpperCase()}
    </span>
  );
}

let _uid = 0;
const uid = () => `r-${++_uid}`;
const blankItem = () => ({
  uid: uid(), product_id: null, inventory_id: null,
  description: '', unit: '', quantity: '', unit_cost: '',
  search: '', batches: [], showDrop: false,
});
const blankReqItem = () => ({ uid: uid(), description: '', unit: '', quantity: '' });

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

/* ── XLSX export ─────────────────────────────────────────────────────────── */
function exportXLSX(deliveries) {
  const rows = deliveries.map(d => {
    const items = (d.items || []).filter(i => i?.description).map(i => `${i.description} - ${i.quantity} ${i.unit || ''}`).join('\n');
    return {
      'Date':         fmt(d.created_at),
      'From':         d.from_location_name || '',
      'To':           d.to_location_name || '',
      'Items':        items,
      'Total Value':  parseFloat(d.total_value || 0),
      'Status':       d.status || '',
      'Created By':   d.created_by_name || '',
      'Confirmed By': d.admin_confirmed_by_name || '',
      'Delivered':    fmt(d.delivered_date),
      'Notes':        d.notes || '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [12, 18, 18, 36, 14, 14, 18, 18, 12, 24].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Deliveries');
  XLSX.writeFile(wb, `Deliveries_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ── ReportIssueDropdown ──────────────────────────────────────────────────── */
function ReportIssueDropdown({ delivery, onShortage, onDamage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-white border border-amber-400 hover:bg-amber-50 rounded-lg transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        Report Issue
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <button
            onClick={() => { setOpen(false); onShortage(delivery); }}
            className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors border-b border-gray-100"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <div className="text-sm font-bold text-amber-800">Shortage</div>
                <div className="text-xs text-gray-500">received less</div>
              </div>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); onDamage(delivery); }}
            className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="text-sm font-bold text-red-800">Damaged Goods</div>
                <div className="text-xs text-gray-500">write-off</div>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function Deliveries() {
  const { user } = useAuth();
  const isAdmin     = user.role === 'admin';
  const isWarehouse = user.role === 'warehouse';
  const isManager   = ['manager', 'branch_manager'].includes(user.role);
  const isStaff     = ['staff', 'branch_staff'].includes(user.role);
  const isBranch    = isManager || isStaff;
  const canCreate   = isAdmin || isWarehouse;

  /* ── data ── */
  const [deliveries, setDeliveries] = useState([]);
  const [locations,  setLocations]  = useState([]);
  const [inventory,  setInventory]  = useState([]);
  const [loading,    setLoading]    = useState(true);

  /* ── filters ── */
  const [showFilters,    setShowFilters]    = useState(false);
  const [filterSearch,   setFilterSearch]   = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterFrom,     setFilterFrom]     = useState('');
  const [filterTo,       setFilterTo]       = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo,   setFilterDateTo]   = useState('');

  /* ── create delivery modal ── */
  const [showCreate,  setShowCreate]  = useState(false);
  const [createFrom,  setCreateFrom]  = useState(isWarehouse ? String(user.location_id || '') : '');
  const [createTo,    setCreateTo]    = useState('');
  const [createItems, setCreateItems] = useState([blankItem()]);
  const [createNotes, setCreateNotes] = useState('');
  const [creating,    setCreating]    = useState(false);

  /* ── branch request modal ── */
  const [showRequest, setShowRequest] = useState(false);
  const [reqFrom,     setReqFrom]     = useState('');
  const [reqItems,    setReqItems]    = useState([blankReqItem()]);
  const [reqNotes,    setReqNotes]    = useState('');
  const [requesting,  setRequesting]  = useState(false);

  /* ── view / reject / batch accept modals ── */
  const [viewModal,   setViewModal]   = useState({ open: false, delivery: null });
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });
  const [batchModal,  setBatchModal]  = useState({ open: false, deliveryId: null, delivery: null, items: [], selections: {}, itemActions: {}, returnReasons: {}, loading: false, submitting: false });

  /* ── report issue modals ── */
  const [shortageModal, setShortageModal] = useState({ open: false, delivery: null, itemId: '', actualQty: '', note: '' });
  const [damageModal,   setDamageModal]   = useState({ open: false, delivery: null, itemId: '', qty: '', note: '' });
  const [submittingIssue, setSubmittingIssue] = useState(false);

  /* ── fetch ── */
  const fetchAll = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true);
      const r = await apiClient.get('/api/deliveries');
      setDeliveries(r.data);
    } catch (_) {}
    finally { if (initial) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll(true);
    apiClient.get('/api/locations').then(r => setLocations(r.data || [])).catch(() => {});
    const iv = setInterval(() => fetchAll(false), 12000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  useEffect(() => {
    if (!createFrom) { setInventory([]); return; }
    apiClient.get('/api/inventory', { params: { location_id: createFrom } })
      .then(r => setInventory(r.data || []))
      .catch(() => setInventory([]));
  }, [createFrom]);

  /* ── derived ── */
  const warehouseLocs = useMemo(() => locations.filter(l => l.type === 'warehouse' || l.type === 'main'), [locations]);
  const branchLocs    = useMemo(() => locations.filter(l => l.type === 'branch'), [locations]);

  const inventoryProducts = useMemo(() => {
    const map = new Map();
    for (const row of inventory) {
      if (!map.has(row.product_id))
        map.set(row.product_id, { product_id: row.product_id, product_name: row.product_name, unit: row.unit });
    }
    return Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [inventory]);

  const filtered = useMemo(() => deliveries.filter(d => {
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterFrom   && String(d.from_location_id) !== filterFrom) return false;
    if (filterTo     && String(d.to_location_id)   !== filterTo)   return false;
    if (filterDateFrom && new Date(d.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo   && new Date(d.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const inLoc   = d.from_location_name?.toLowerCase().includes(q) || d.to_location_name?.toLowerCase().includes(q);
      const inItems = (d.items || []).some(i => i?.description?.toLowerCase().includes(q));
      if (!inLoc && !inItems) return false;
    }
    return true;
  }), [deliveries, filterStatus, filterFrom, filterTo, filterDateFrom, filterDateTo, filterSearch]);

  const pendingForAdmin   = useMemo(() => deliveries.filter(d => ['pending', 'awaiting_admin'].includes(d.status)), [deliveries]);
  const incomingForBranch = useMemo(() => deliveries.filter(d =>
    ['admin_confirmed', 'in_transit'].includes(d.status) && String(d.to_location_id) === String(user.location_id)
  ), [deliveries, user.location_id]);

  const hasActiveFilters = filterSearch || filterStatus || filterFrom || filterTo || filterDateFrom || filterDateTo;

  /* ── actions ── */
  const handleAdminConfirm = async (id) => {
    if (!window.confirm('Confirm this delivery?')) return;
    try { await apiClient.post(`/api/deliveries/${id}/admin-confirm`); fetchAll(false); }
    catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const openBatchAccept = async (delivery) => {
    setBatchModal({ open: true, deliveryId: delivery.id, delivery, items: [], selections: {}, itemActions: {}, returnReasons: {}, loading: true, submitting: false });
    try {
      const r = await apiClient.get(`/api/deliveries/${delivery.id}/available-batches`);
      const items = r.data.items || [];
      const selections = {};
      const itemActions = {};
      const returnReasons = {};
      for (const it of items) {
        if (it.available_batches?.length > 0) selections[it.item_id] = it.available_batches[0].id;
        itemActions[it.item_id] = 'receive';
        returnReasons[it.item_id] = '';
      }
      setBatchModal(prev => ({ ...prev, items, selections, itemActions, returnReasons, loading: false }));
    } catch (_) {
      setBatchModal({ open: false, deliveryId: null, delivery: null, items: [], selections: {}, itemActions: {}, returnReasons: {}, loading: false, submitting: false });
      handleDirectAccept(delivery.id);
    }
  };

  const handleDirectAccept = async (id) => {
    if (!window.confirm('Accept this delivery? Items will be added to your inventory.')) return;
    try { await apiClient.post(`/api/deliveries/${id}/accept`); fetchAll(false); }
    catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleAccept = (delivery) => {
    const items = (delivery.items || []).filter(i => i?.description);
    if (items.length === 0) { handleDirectAccept(delivery.id); return; }
    openBatchAccept(delivery);
  };

  const handleBatchAcceptSubmit = async () => {
    const { deliveryId, delivery, items, selections, itemActions, returnReasons } = batchModal;
    const acceptedItems = items.filter(it => (itemActions[it.item_id] || 'receive') === 'receive');
    const returnedItems = items.filter(it => itemActions[it.item_id] === 'return');

    for (const it of returnedItems) {
      if (!returnReasons[it.item_id]?.trim()) {
        alert(`Please provide a reason for returning "${it.description}".`);
        return;
      }
    }

    setBatchModal(prev => ({ ...prev, submitting: true }));
    try {
      if (acceptedItems.length > 0) {
        const acceptedSelections = {};
        for (const it of acceptedItems) {
          if (selections[it.item_id]) acceptedSelections[it.item_id] = selections[it.item_id];
        }
        await apiClient.post(`/api/deliveries/${deliveryId}/accept`, {
          batch_selections: acceptedSelections,
          accepted_item_ids: acceptedItems.map(it => it.item_id),
        });
      } else {
        await apiClient.post(`/api/deliveries/${deliveryId}/reject`, {
          rejection_reason: 'All items returned to warehouse by branch.',
        });
      }

      if (returnedItems.length > 0 && delivery) {
        const returnNotes = 'RETURN REQUEST: ' + returnedItems.map(it => `${it.description} — ${returnReasons[it.item_id]}`).join('; ');
        await apiClient.post('/api/deliveries', {
          from_location_id: delivery.to_location_id,
          to_location_id: delivery.from_location_id,
          delivery_date: new Date().toISOString().split('T')[0],
          notes: returnNotes,
          status: 'pending',
          items: returnedItems.map(it => ({
            description: it.description,
            unit: it.unit,
            quantity: it.requested_quantity,
            unit_cost: 0,
          })),
        });
      }

      setBatchModal({ open: false, deliveryId: null, delivery: null, items: [], selections: {}, itemActions: {}, returnReasons: {}, loading: false, submitting: false });
      fetchAll(false);
    } catch (err) {
      setBatchModal(prev => ({ ...prev, submitting: false }));
      alert(err.response?.data?.error || 'Error processing delivery');
    }
  };

  const handleRejectSubmit = async () => {
    try {
      await apiClient.post(`/api/deliveries/${rejectModal.id}/reject`, { rejection_reason: rejectModal.reason });
      setRejectModal({ open: false, id: null, reason: '' });
      fetchAll(false);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const valid = createItems.filter(i => i.description && i.unit && parseFloat(i.quantity) > 0);
    if (!valid.length) { alert('Add at least one item.'); return; }
    if (!createFrom || !createTo) { alert('From and To locations required.'); return; }
    setCreating(true);
    try {
      await apiClient.post('/api/deliveries', {
        from_location_id: parseInt(createFrom), to_location_id: parseInt(createTo),
        delivery_date: new Date().toISOString().split('T')[0],
        notes: createNotes, status: 'pending',
        items: valid.map(i => ({
          description: i.description, unit: i.unit,
          quantity: parseFloat(i.quantity), unit_cost: parseFloat(i.unit_cost) || 0,
          product_id: i.product_id || null, inventory_id: i.inventory_id || null,
        })),
      });
      setShowCreate(false);
      setCreateItems([blankItem()]);
      setCreateFrom(isWarehouse ? String(user.location_id || '') : '');
      setCreateTo(''); setCreateNotes('');
      fetchAll(false);
    } catch (err) { alert(err.response?.data?.error || 'Error creating delivery'); }
    finally { setCreating(false); }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    const valid = reqItems.filter(i => i.description && i.unit && parseFloat(i.quantity) > 0);
    if (!valid.length) { alert('Add at least one item.'); return; }
    if (!reqFrom) { alert('Please select a warehouse.'); return; }
    setRequesting(true);
    try {
      await apiClient.post('/api/deliveries', {
        from_location_id: parseInt(reqFrom), to_location_id: user.location_id,
        delivery_date: new Date().toISOString().split('T')[0],
        notes: reqNotes, status: 'pending',
        items: valid.map(i => ({ description: i.description, unit: i.unit, quantity: parseFloat(i.quantity), unit_cost: 0 })),
      });
      setShowRequest(false); setReqItems([blankReqItem()]); setReqFrom(''); setReqNotes('');
      fetchAll(false);
    } catch (err) { alert(err.response?.data?.error || 'Error sending request'); }
    finally { setRequesting(false); }
  };

  const handleShortageSubmit = async () => {
    const { delivery, itemId, actualQty, note } = shortageModal;
    if (!itemId || actualQty === '' || !note.trim()) { alert('Please fill all required fields.'); return; }
    const item = (delivery.items || []).find(i => String(i.id) === itemId);
    if (!item) return;
    setSubmittingIssue(true);
    try {
      await apiClient.post('/api/delivery-discrepancies', {
        type: 'shortage', delivery_id: delivery.id,
        item_description: item.description, unit: item.unit || '',
        unit_cost: item.unit_cost || 0,
        expected_quantity: parseFloat(item.quantity),
        received_quantity: parseFloat(actualQty),
        note: note.trim(),
        branch_location_id: delivery.to_location_id,
        warehouse_location_id: delivery.from_location_id,
      });
      setShortageModal({ open: false, delivery: null, itemId: '', actualQty: '', note: '' });
      alert('Shortage report submitted. Admin will review.');
    } catch (err) { alert(err.response?.data?.error || 'Error submitting report'); }
    finally { setSubmittingIssue(false); }
  };

  const handleDamageSubmit = async () => {
    const { delivery, itemId, qty, note } = damageModal;
    if (!itemId || !qty || !note.trim()) { alert('Please fill all required fields.'); return; }
    const item = (delivery.items || []).find(i => String(i.id) === itemId);
    if (!item) return;
    setSubmittingIssue(true);
    try {
      await apiClient.post('/api/delivery-discrepancies', {
        type: 'damage', delivery_id: delivery.id,
        item_description: item.description, unit: item.unit || '',
        unit_cost: item.unit_cost || 0,
        expected_quantity: parseFloat(item.quantity),
        received_quantity: parseFloat(item.quantity) - parseFloat(qty),
        note: note.trim(),
        branch_location_id: delivery.to_location_id,
        warehouse_location_id: delivery.from_location_id,
      });
      setDamageModal({ open: false, delivery: null, itemId: '', qty: '', note: '' });
      alert('Damage report submitted. Admin will review.');
    } catch (err) { alert(err.response?.data?.error || 'Error submitting report'); }
    finally { setSubmittingIssue(false); }
  };

  /* ── item helpers ── */
  const updateItem = (id, field, val) =>
    setCreateItems(p => p.map(i => i.uid === id ? { ...i, [field]: val } : i));

  const updateDeliveryItemSearch = (id, query) =>
    setCreateItems(p => p.map(i => i.uid !== id ? i : {
      ...i, search: query, description: query, product_id: null, inventory_id: null, batches: [], showDrop: query.length > 0,
    }));

  const selectDeliveryProduct = (id, product) => {
    const batches = inventory.filter(row => row.product_id === product.product_id);
    const first   = batches[0];
    setCreateItems(p => p.map(i => i.uid !== id ? i : {
      ...i, product_id: product.product_id, description: product.product_name,
      unit: product.unit || '', search: product.product_name, showDrop: false,
      batches, inventory_id: first?.id || null,
      unit_cost: first?.unit_cost ? String(parseFloat(first.unit_cost).toFixed(2)) : i.unit_cost,
    }));
  };

  const selectDeliveryBatch = (id, batch) =>
    setCreateItems(p => p.map(i => i.uid !== id ? i : {
      ...i, inventory_id: batch.id,
      unit_cost: batch.unit_cost ? String(parseFloat(batch.unit_cost).toFixed(2)) : i.unit_cost,
    }));

  const updateReqItem = (id, field, val) =>
    setReqItems(p => p.map(i => i.uid === id ? { ...i, [field]: val } : i));

  /* ── render ── */
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Deliveries</h1>
            <p className="text-sm text-gray-500">Warehouse to branch stock deliveries</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isBranch && (
            <button onClick={() => setShowRequest(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Request from Warehouse
            </button>
          )}
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Delivery
            </button>
          )}
        </div>
      </div>

      {/* ── Admin: pending banner ── */}
      {isAdmin && pendingForAdmin.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-bold text-amber-800">{pendingForAdmin.length} Pending Confirmation{pendingForAdmin.length !== 1 ? 's' : ''}</h2>
          </div>
          <div className="space-y-2">
            {pendingForAdmin.slice(0, 4).map(d => {
              const items = (d.items || []).filter(i => i?.description);
              return (
                <div key={d.id} className="bg-white rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm border border-amber-100">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-gray-800">{d.from_location_name}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-gray-800">{d.to_location_name}</span>
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-400 text-xs">{fmt(d.created_at)}</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setViewModal({ open: true, delivery: d })} className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md">View</button>
                    <button onClick={() => handleAdminConfirm(d.id)} className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md">Confirm</button>
                    <button onClick={() => setRejectModal({ open: true, id: d.id, reason: '' })} className="px-2.5 py-1 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-md">Reject</button>
                  </div>
                </div>
              );
            })}
            {pendingForAdmin.length > 4 && <p className="text-xs text-amber-600 text-center">+{pendingForAdmin.length - 4} more in the table below</p>}
          </div>
        </div>
      )}

      {/* ── Branch: incoming banner ── */}
      {isBranch && incomingForBranch.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-bold text-blue-800">{incomingForBranch.length} Incoming Deliver{incomingForBranch.length !== 1 ? 'ies' : 'y'} Ready to Accept</h2>
          </div>
          <div className="space-y-2">
            {incomingForBranch.map(d => {
              const items = (d.items || []).filter(i => i?.description);
              return (
                <div key={d.id} className="bg-white rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm border border-blue-100">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-gray-800">{d.from_location_name}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-gray-800">{d.to_location_name}</span>
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setViewModal({ open: true, delivery: d })} className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md">View Items</button>
                    <button onClick={() => handleAccept(d)} className="px-2.5 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md">Accept</button>
                    {isManager && <button onClick={() => setRejectModal({ open: true, id: d.id, reason: '' })} className="px-2.5 py-1 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-md">Reject</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <button onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button onClick={() => { setFilterSearch(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="text-xs text-blue-600 hover:underline">Clear filters</button>
            )}
            <span className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {showFilters && (
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Search Product</label>
                <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                  placeholder="Search by product name..." className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">From Location</label>
                <select value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={inp}>
                  <option value="">All Locations</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">To Location</label>
                <select value={filterTo} onChange={e => setFilterTo(e.target.value)} className={inp}>
                  <option value="">All Locations</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className={inp} />
              </div>
            </div>
            <div className="w-48">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inp}>
                <option value="">All Statuses</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Delivery History table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* table header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <h2 className="text-base font-bold text-gray-900">Delivery History ({filtered.length})</h2>
            </div>
            <button onClick={() => exportXLSX(filtered)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export XLSX
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <p className="text-sm font-medium">No deliveries found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/70">
                    {['DATE','FROM','TO','ITEMS','TOTAL VALUE','STATUS','CREATED BY','CONFIRMED BY','ACTIONS'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(d => {
                    const items = (d.items || []).filter(i => i?.description);
                    const canAccept = ['admin_confirmed','in_transit'].includes(d.status) &&
                      (isAdmin || (isBranch && String(d.to_location_id) === String(user.location_id)));
                    const canConfirm = isAdmin && ['pending','awaiting_admin'].includes(d.status);
                    const canReject  = (isAdmin || (isManager && String(d.to_location_id) === String(user.location_id))) &&
                      ['pending','admin_confirmed','awaiting_admin','in_transit'].includes(d.status);
                    const canReport  = d.status === 'delivered' && (isBranch || isAdmin);

                    return (
                      <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          <div>{fmt(d.created_at)}</div>
                          {d.delivered_date && <div className="text-green-600 mt-0.5">{fmt(d.delivered_date)}</div>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{d.from_location_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{d.to_location_name || '—'}</td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {items.length === 0 ? <span className="text-gray-300">—</span> : (
                            <div className="space-y-0.5">
                              {items.map((item, idx) => (
                                <div key={idx} className="text-xs text-gray-700">
                                  <span className="font-semibold uppercase">{item.description}</span>
                                  <span className="text-gray-500"> — {item.quantity} {item.unit || 'pc'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                          {parseFloat(d.total_value) > 0 ? fmtCur(d.total_value) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{d.created_by_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{d.admin_confirmed_by_name || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => setViewModal({ open: true, delivery: d })}
                              className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md transition-colors">
                              View
                            </button>
                            {canConfirm && (
                              <button onClick={() => handleAdminConfirm(d.id)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">
                                Confirm
                              </button>
                            )}
                            {canAccept && (
                              <button onClick={() => handleAccept(d)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors">
                                Accept
                              </button>
                            )}
                            {canReject && (
                              <button onClick={() => setRejectModal({ open: true, id: d.id, reason: '' })}
                                className="px-2.5 py-1 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-md transition-colors">
                                Reject
                              </button>
                            )}
                            {canReport && (
                              <ReportIssueDropdown
                                delivery={d}
                                onShortage={(del) => setShortageModal({ open: true, delivery: del, itemId: String((del.items || []).filter(i => i?.description)[0]?.id || ''), actualQty: '', note: '' })}
                                onDamage={(del) => setDamageModal({ open: true, delivery: del, itemId: String((del.items || []).filter(i => i?.description)[0]?.id || ''), qty: '', note: '' })}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── View Items Modal ── */}
      <Modal isOpen={viewModal.open} onClose={() => setViewModal({ open: false, delivery: null })} title="Delivery Details" size="md">
        {viewModal.delivery && (() => {
          const d = viewModal.delivery;
          const items = (d.items || []).filter(i => i?.description);
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={d.status} />
                <span className="text-sm text-gray-500">{d.from_location_name} → {d.to_location_name}</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Item</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Unit</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                    {(isAdmin || isWarehouse) && <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Cost</th>}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2.5 font-semibold text-gray-900 uppercase">{item.description}</td>
                        <td className="px-3 py-2.5 text-gray-500">{item.unit}</td>
                        <td className="px-3 py-2.5 text-right">{item.quantity}</td>
                        {(isAdmin || isWarehouse) && <td className="px-3 py-2.5 text-right text-gray-600">{item.unit_cost ? fmtCur(item.unit_cost) : '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {(isAdmin || isWarehouse) && parseFloat(d.total_value) > 0 && (
                    <tfoot><tr className="border-t border-gray-200">
                      <td colSpan={3} className="px-3 pt-2.5 text-sm font-semibold text-gray-700 text-right">Total:</td>
                      <td className="px-3 pt-2.5 text-right font-bold text-gray-900">{fmtCur(d.total_value)}</td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
              {d.notes && <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5"><span className="font-medium">Notes:</span> {d.notes}</div>}
              {d.rejection_reason && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5"><span className="font-medium">Rejected:</span> {d.rejection_reason}</div>}
            </div>
          );
        })()}
      </Modal>

      {/* ── Create Delivery Modal ── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="" size="xl">
        <form onSubmit={handleCreate}>
          {/* left-border header like the screenshot */}
          <div className="border-l-4 border-blue-500 pl-4 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <h2 className="text-lg font-bold text-blue-600">Create New Delivery</h2>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-blue-700 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Create a delivery from warehouse to branch. This will notify the branch when ready.
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">From Warehouse *</label>
                <select value={createFrom} onChange={e => setCreateFrom(e.target.value)} className={inp} required>
                  <option value="">Select warehouse</option>
                  {(warehouseLocs.length > 0 ? warehouseLocs : locations).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">To Branch *</label>
                <select value={createTo} onChange={e => setCreateTo(e.target.value)} className={inp} required>
                  <option value="">Select branch</option>
                  {(branchLocs.length > 0 ? branchLocs : locations.filter(l => String(l.id) !== createFrom)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            {/* Items */}
            <div>
              {createItems.map((item, idx) => {
                const fp = item.search ? inventoryProducts.filter(p => p.product_name.toLowerCase().includes(item.search.toLowerCase())) : inventoryProducts;
                return (
                  <div key={item.uid} className="border border-gray-200 rounded-xl p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-700">Item {idx + 1}</span>
                      {createItems.length > 1 && (
                        <button type="button" onClick={() => setCreateItems(p => p.filter(i => i.uid !== item.uid))}
                          className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Search Item *</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input type="text"
                          value={item.search !== undefined ? item.search : item.description}
                          onChange={e => updateDeliveryItemSearch(item.uid, e.target.value)}
                          onFocus={() => setCreateItems(p => p.map(i => i.uid === item.uid ? { ...i, showDrop: true } : i))}
                          onBlur={() => setTimeout(() => setCreateItems(p => p.map(i => i.uid === item.uid ? { ...i, showDrop: false } : i)), 150)}
                          placeholder="Search for product..."
                          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          required
                        />
                        {item.showDrop && fp.length > 0 && (
                          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-44 overflow-y-auto">
                            {fp.slice(0, 8).map(p => (
                              <button key={p.product_id} type="button" onMouseDown={() => selectDeliveryProduct(item.uid, p)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between">
                                <span className="font-medium text-gray-800">{p.product_name}</span>
                                <span className="text-xs text-gray-400">{p.unit}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* batch chips */}
                    {item.product_id && item.batches.length > 0 && (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select Batch</label>
                        <div className="flex flex-wrap gap-2">
                          {item.batches.map(batch => {
                            const sel = item.inventory_id === batch.id;
                            const ec  = batch.expiry_status === 'EXPIRED' ? 'text-red-500' : batch.expiry_status === 'EXPIRING_SOON' ? 'text-amber-500' : 'text-gray-400';
                            return (
                              <button key={batch.id} type="button" onClick={() => selectDeliveryBatch(item.uid, batch)}
                                className={`px-3 py-2 rounded-lg border text-left text-xs transition-all ${sel ? 'bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-300' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                                <div className="font-semibold">{batch.batch_number || 'No Batch #'}</div>
                                <div className={`mt-0.5 ${ec}`}>{batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Expiry'}</div>
                                <div className="text-gray-500 mt-0.5">{Math.round(parseFloat(batch.quantity)).toLocaleString()} avail{batch.unit_cost ? ` · ₱${parseFloat(batch.unit_cost).toFixed(2)}` : ''}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Unit *</label>
                        <input type="text" value={item.unit} onChange={e => updateItem(item.uid, 'unit', e.target.value)} placeholder="e.g. PACK" className={inp} required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity *</label>
                        <input type="number" value={item.quantity} onChange={e => updateItem(item.uid, 'quantity', e.target.value)} placeholder="0" min="0.01" step="0.01" className={inp} required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Unit Cost</label>
                        <input type="number" value={item.unit_cost} onChange={e => updateItem(item.uid, 'unit_cost', e.target.value)} placeholder="0.00" min="0" step="0.01" className={inp} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={() => setCreateItems(p => [...p, blankItem()])}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl w-full justify-center transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (Optional)</label>
              <textarea value={createNotes} onChange={e => setCreateNotes(e.target.value)}
                rows={3} className={inp} placeholder="Add any notes about this delivery..." />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition-colors">
                {creating ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {creating ? 'Creating...' : 'Create Delivery'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Branch Request Modal ── */}
      <Modal isOpen={showRequest} onClose={() => setShowRequest(false)} title="Request from Warehouse" size="lg">
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-sm text-purple-700">
            Your request will be sent to the warehouse for admin review before dispatch.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Request From *</label>
            <select value={reqFrom} onChange={e => setReqFrom(e.target.value)} className={inp} required>
              <option value="">Select warehouse...</option>
              {(warehouseLocs.length > 0 ? warehouseLocs : locations).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Requested Items *</label>
              <button type="button" onClick={() => setReqItems(p => [...p, blankReqItem()])} className="text-xs font-medium text-purple-600 hover:text-purple-700">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {reqItems.map(item => (
                <div key={item.uid} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 80px 90px auto' }}>
                  <input type="text" value={item.description} onChange={e => updateReqItem(item.uid, 'description', e.target.value)} placeholder="Item description" className={inp} required />
                  <input type="text" value={item.unit} onChange={e => updateReqItem(item.uid, 'unit', e.target.value)} placeholder="Unit" className={inp} required />
                  <input type="number" value={item.quantity} onChange={e => updateReqItem(item.uid, 'quantity', e.target.value)} placeholder="Qty" min="0.01" step="0.01" className={inp} required />
                  {reqItems.length > 1 && (
                    <button type="button" onClick={() => setReqItems(p => p.filter(i => i.uid !== item.uid))}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={reqNotes} onChange={e => setReqNotes(e.target.value)} rows={2} className={inp} placeholder="Optional notes or urgency..." />
          </div>
          <div className="flex justify-end gap-3 pt-1 border-t border-gray-100">
            <button type="button" onClick={() => setShowRequest(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button type="submit" disabled={requesting}
              className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg flex items-center gap-2">
              {requesting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {requesting ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Batch Accept Modal ── */}
      <Modal isOpen={batchModal.open} onClose={() => !batchModal.submitting && setBatchModal({ open: false, deliveryId: null, delivery: null, items: [], selections: {}, itemActions: {}, returnReasons: {}, loading: false, submitting: false })} title="" size="lg">
        {batchModal.loading ? (
          <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Review Incoming Delivery</h2>
                <p className="text-sm text-gray-500">Select which items to receive or return to warehouse.</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Items marked <strong className="mx-0.5">Receive</strong> will be added to your inventory. Items marked <strong className="mx-0.5">Return</strong> will create a return request to the warehouse (requires a reason).
            </div>

            {batchModal.items.map(it => {
              const action = batchModal.itemActions[it.item_id] || 'receive';
              const isReturn = action === 'return';
              return (
                <div key={it.item_id} className={`border rounded-xl p-4 transition-colors ${isReturn ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200'}`}>
                  {/* Item header + toggle */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 text-sm uppercase leading-tight">{it.description}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{it.unit} · Qty: {it.requested_quantity}</div>
                    </div>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                      <button type="button"
                        onClick={() => setBatchModal(prev => ({ ...prev, itemActions: { ...prev.itemActions, [it.item_id]: 'receive' } }))}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${!isReturn ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        ✓ Receive
                      </button>
                      <button type="button"
                        onClick={() => setBatchModal(prev => ({ ...prev, itemActions: { ...prev.itemActions, [it.item_id]: 'return' } }))}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-gray-200 ${isReturn ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        ↩ Return
                      </button>
                    </div>
                  </div>

                  {/* Batch chips — only shown when receiving */}
                  {!isReturn && (
                    it.available_batches?.length > 0 ? (
                      <div>
                        <div className="text-xs text-gray-500 mb-1.5">Select batch:</div>
                        <div className="flex flex-wrap gap-2">
                          {it.available_batches.map(b => {
                            const sel = batchModal.selections[it.item_id] === b.id;
                            const ec  = b.expiry_status === 'EXPIRED' ? 'text-red-500' : b.expiry_status === 'EXPIRING_SOON' ? 'text-amber-500' : 'text-gray-400';
                            return (
                              <button key={b.id} type="button"
                                onClick={() => setBatchModal(prev => ({ ...prev, selections: { ...prev.selections, [it.item_id]: b.id } }))}
                                className={`px-3 py-2 rounded-lg border text-left text-xs transition-all ${sel ? 'bg-green-50 border-green-400 text-green-700 ring-1 ring-green-300' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                                <div className="font-semibold">{b.batch_number || 'No Batch #'}</div>
                                <div className={`mt-0.5 ${ec}`}>{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Expiry'}</div>
                                <div className="text-gray-500 mt-0.5">{Math.round(parseFloat(b.quantity)).toLocaleString()} avail{b.unit_cost ? ` · ₱${parseFloat(b.unit_cost).toFixed(2)}` : ''}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">No matching inventory found in warehouse.</div>
                    )
                  )}

                  {/* Return reason — only shown when returning */}
                  {isReturn && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for returning <span className="text-red-500">*</span></label>
                      <select
                        value={batchModal.returnReasons[it.item_id] || ''}
                        onChange={e => setBatchModal(prev => ({ ...prev, returnReasons: { ...prev.returnReasons, [it.item_id]: e.target.value } }))}
                        className={inp}>
                        <option value="">Select a reason...</option>
                        <option value="Wrong item received">Wrong item received</option>
                        <option value="Damaged on arrival">Damaged on arrival</option>
                        <option value="Expired or near expiry">Expired or near expiry</option>
                        <option value="Overstocked — not needed">Overstocked — not needed</option>
                        <option value="Quality issue">Quality issue</option>
                        <option value="Other">Other</option>
                      </select>
                      {batchModal.returnReasons[it.item_id] === 'Other' && (
                        <input type="text" placeholder="Specify reason..."
                          className={`${inp} mt-1.5`}
                          onChange={e => setBatchModal(prev => ({ ...prev, returnReasons: { ...prev.returnReasons, [it.item_id]: e.target.value } }))} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Summary */}
            {batchModal.items.length > 0 && (() => {
              const accepted = batchModal.items.filter(it => (batchModal.itemActions[it.item_id] || 'receive') === 'receive').length;
              const returned = batchModal.items.length - accepted;
              return (
                <div className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  <span className="font-semibold text-gray-700">Summary:</span>
                  <span className="text-green-600 font-semibold">{accepted} receiving</span>
                  {returned > 0 && <><span className="text-gray-300">·</span><span className="text-orange-600 font-semibold">{returned} returning</span></>}
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setBatchModal({ open: false, deliveryId: null, delivery: null, items: [], selections: {}, itemActions: {}, returnReasons: {}, loading: false, submitting: false })}
                disabled={batchModal.submitting}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg">
                Cancel
              </button>
              <button onClick={handleBatchAcceptSubmit} disabled={batchModal.submitting}
                className="px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg flex items-center gap-2">
                {batchModal.submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {batchModal.submitting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Report Shortage Modal ── */}
      <Modal isOpen={shortageModal.open} onClose={() => setShortageModal({ open: false, delivery: null, itemId: '', actualQty: '', note: '' })} title="" size="md">
        {shortageModal.delivery && (() => {
          const d = shortageModal.delivery;
          const items = (d.items || []).filter(i => i?.description);
          const selectedItem = items.find(i => String(i.id) === shortageModal.itemId);
          return (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Report Delivery Shortage</h2>
                  <p className="text-sm text-gray-500">Delivery from {d.from_location_name}</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Admin will review and, if approved, add the missing quantity back to the warehouse and correct your branch inventory.
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Which item is short? *</label>
                <select value={shortageModal.itemId} onChange={e => setShortageModal(p => ({ ...p, itemId: e.target.value }))} className={inp} required>
                  {items.map(i => <option key={i.id} value={String(i.id)}>{i.description} — {i.quantity} {i.unit}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Expected (delivery says)</label>
                  <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 font-semibold">
                    {selectedItem ? `${selectedItem.quantity} ${selectedItem.unit}` : '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Actually Received *</label>
                  <input type="number" value={shortageModal.actualQty} onChange={e => setShortageModal(p => ({ ...p, actualQty: e.target.value }))}
                    min="0" step="0.01" placeholder="0" className={inp} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Note / Reason <span className="text-red-500">*</span></label>
                <textarea value={shortageModal.note} onChange={e => setShortageModal(p => ({ ...p, note: e.target.value }))}
                  rows={3} className={inp} placeholder="Explain what happened — e.g. items were missing on arrival, box was open..." required />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setShortageModal({ open: false, delivery: null, itemId: '', actualQty: '', note: '' })}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button onClick={handleShortageSubmit} disabled={submittingIssue}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-lg flex items-center gap-2">
                  {submittingIssue && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Submit Shortage Report
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Report Damage Modal ── */}
      <Modal isOpen={damageModal.open} onClose={() => setDamageModal({ open: false, delivery: null, itemId: '', qty: '', note: '' })} title="" size="md">
        {damageModal.delivery && (() => {
          const d = damageModal.delivery;
          const items = (d.items || []).filter(i => i?.description);
          return (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Report Damaged Goods</h2>
                  <p className="text-sm text-gray-500">Delivery from {d.from_location_name}</p>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Admin will review the write-off request and adjust inventory accordingly.
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Which item is damaged? *</label>
                <select value={damageModal.itemId} onChange={e => setDamageModal(p => ({ ...p, itemId: e.target.value }))} className={inp} required>
                  {items.map(i => <option key={i.id} value={String(i.id)}>{i.description} — {i.quantity} {i.unit}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Damaged Quantity *</label>
                <input type="number" value={damageModal.qty} onChange={e => setDamageModal(p => ({ ...p, qty: e.target.value }))}
                  min="0.01" step="0.01" placeholder="0" className={inp} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Note / Reason <span className="text-red-500">*</span></label>
                <textarea value={damageModal.note} onChange={e => setDamageModal(p => ({ ...p, note: e.target.value }))}
                  rows={3} className={inp} placeholder="Describe the damage — e.g. packaging broken, items crushed, water damage..." required />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setDamageModal({ open: false, delivery: null, itemId: '', qty: '', note: '' })}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button onClick={handleDamageSubmit} disabled={submittingIssue}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg flex items-center gap-2">
                  {submittingIssue && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Submit Damage Report
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Reject Modal ── */}
      <Modal isOpen={rejectModal.open} onClose={() => setRejectModal({ open: false, id: null, reason: '' })} title="Reject Delivery" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Provide a reason for rejecting this delivery (optional).</p>
          <textarea value={rejectModal.reason} onChange={e => setRejectModal(p => ({ ...p, reason: e.target.value }))}
            rows={3} className={inp} placeholder="Rejection reason..." />
          <div className="flex justify-end gap-3">
            <button onClick={() => setRejectModal({ open: false, id: null, reason: '' })} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleRejectSubmit} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg">Confirm Reject</button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
