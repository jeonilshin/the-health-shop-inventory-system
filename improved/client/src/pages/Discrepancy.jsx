import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtGroupDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

/* ── Type badge ── */
function TypeBadge({ type }) {
  const map = {
    shortage: { cls: 'bg-amber-100 text-amber-800 border border-amber-200',  icon: '⚠', label: 'Shortage' },
    overage:  { cls: 'bg-blue-100 text-blue-800 border border-blue-200',     icon: '+', label: 'Overage'  },
    return:   { cls: 'bg-purple-100 text-purple-800 border border-purple-200', icon: '↩', label: 'Return'  },
    damage:   { cls: 'bg-red-100 text-red-800 border border-red-200',        icon: '✕', label: 'Damage'   },
  };
  const b = map[type] || map.damage;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${b.cls}`}>
      <span className="text-[10px]">{b.icon}</span> {b.label}
    </span>
  );
}

/* ── Status badge ── */
function StatusBadge({ status, type }) {
  const completedLabel = type === 'damage' ? 'Written Off' : 'Corrected';
  const map = {
    pending:   { cls: 'bg-gray-100 text-gray-600 border border-gray-200',    label: 'Pending'     },
    approved:  { cls: 'bg-sky-100 text-sky-700 border border-sky-200',       label: 'Approved'    },
    completed: { cls: 'bg-green-100 text-green-700 border border-green-200', label: completedLabel },
    rejected:  { cls: 'bg-red-100 text-red-700 border border-red-200',       label: 'Rejected'    },
  };
  const b = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${b.cls}`}>{b.label}</span>
  );
}

/* ── Export helpers ── */
function exportCSV(rows) {
  const header = ['Date','Type','Item','Unit','Expected','Received','Adjust','Branch','Warehouse','Reported By','Status','Note'];
  const lines = [header, ...rows.map(d => {
    const adj = d.type === 'shortage'
      ? parseFloat(d.expected_quantity) - parseFloat(d.received_quantity)
      : parseFloat(d.received_quantity);
    return [fmt(d.reported_at), d.type, d.item_description, d.unit, d.expected_quantity, d.received_quantity, adj,
      d.branch_name||'', d.warehouse_name||'', d.reported_by_name||'', d.status, d.note||''];
  })];
  const csv = lines.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `Discrepancies_${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

function exportXLSX(rows) {
  const data = rows.map(d => {
    const adj = d.type === 'shortage'
      ? parseFloat(d.expected_quantity) - parseFloat(d.received_quantity)
      : parseFloat(d.received_quantity);
    return {
      Date: fmt(d.reported_at), Type: d.type, Item: d.item_description, Unit: d.unit,
      Expected: parseFloat(d.expected_quantity), Received: parseFloat(d.received_quantity),
      Adjustment: adj, Branch: d.branch_name||'', Warehouse: d.warehouse_name||'',
      'Reported By': d.reported_by_name||'', Status: d.status, Note: d.note||'',
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [12,10,24,8,10,10,10,20,20,16,12,30].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Discrepancies');
  XLSX.writeFile(wb, `Discrepancies_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ── Report form modal (used for manual damage/shortage reports) ── */
function ReportModal({ type, onClose, onSuccess }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    item_description: '', unit: '', unit_cost: '',
    expected_quantity: '', received_quantity: '', note: '',
    branch_location_id: String(user.location_id || ''),
    warehouse_location_id: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/api/locations').then(r => setLocations(r.data || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post('/api/delivery-discrepancies', {
        ...form, type,
        unit_cost: parseFloat(form.unit_cost) || 0,
        expected_quantity: parseFloat(form.expected_quantity) || 0,
        received_quantity: parseFloat(form.received_quantity) || 0,
      });
      onSuccess();
    } catch (err) {
      alert(err.response?.data?.error || 'Error submitting report');
    } finally { setSaving(false); }
  };

  const typeConfig = {
    damage:   { color: 'red',   title: 'Report Damaged Goods',  info: 'Report damaged items to be written off from inventory.' },
    shortage: { color: 'amber', title: 'Report Delivery Shortage', info: 'Report items received less than expected.' },
    return:   { color: 'purple',title: 'Return Request',         info: 'Request to return items from branch back to warehouse.' },
    overage:  { color: 'blue',  title: 'Report Overage',         info: 'Report items received more than expected.' },
  };
  const cfg = typeConfig[type] || typeConfig.damage;

  return (
    <Modal isOpen onClose={onClose} title="" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={`border-l-4 border-${cfg.color}-500 pl-4 mb-1`}>
          <h2 className={`text-lg font-bold text-${cfg.color}-700`}>{cfg.title}</h2>
        </div>
        <div className={`bg-${cfg.color}-50 border border-${cfg.color}-100 rounded-lg px-3 py-2.5 text-sm text-${cfg.color}-700`}>
          {cfg.info}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Item Description *</label>
            <input type="text" value={form.item_description} onChange={e => setForm({...form, item_description:e.target.value})} className={inp} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Unit *</label>
            <input type="text" value={form.unit} onChange={e => setForm({...form, unit:e.target.value})} className={inp} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Unit Cost</label>
            <input type="number" value={form.unit_cost} onChange={e => setForm({...form, unit_cost:e.target.value})} className={inp} min="0" step="0.01" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{type === 'damage' ? 'Damage Qty' : 'Expected Qty'} *</label>
            <input type="number" value={form.expected_quantity} onChange={e => setForm({...form, expected_quantity:e.target.value})} className={inp} min="0" step="0.01" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{type === 'damage' ? 'Confirmed Qty' : 'Received Qty'} *</label>
            <input type="number" value={form.received_quantity} onChange={e => setForm({...form, received_quantity:e.target.value})} className={inp} min="0" step="0.01" required />
          </div>
        </div>
        {['admin','warehouse'].includes(user.role) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Warehouse *</label>
              <select value={form.warehouse_location_id} onChange={e => setForm({...form, warehouse_location_id:e.target.value})} className={inp} required>
                <option value="">Select...</option>
                {locations.filter(l => l.type === 'warehouse' || l.type === 'main').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Branch</label>
              <select value={form.branch_location_id} onChange={e => setForm({...form, branch_location_id:e.target.value})} className={inp}>
                <option value="">Select...</option>
                {locations.filter(l => l.type === 'branch').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Note / Reason *</label>
          <textarea value={form.note} onChange={e => setForm({...form, note:e.target.value})} rows={3} required className={inp}
            placeholder="Describe what happened..." />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className={`px-5 py-2 text-sm font-semibold text-white bg-${cfg.color}-600 hover:bg-${cfg.color}-700 disabled:opacity-60 rounded-lg flex items-center gap-2`}>
            {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Main page ── */
export default function Discrepancy() {
  const { user } = useAuth();
  const isAdmin   = user.role === 'admin';
  const canReport = ['warehouse','branch_manager','branch_staff','staff','manager'].includes(user.role);

  const [discrepancies, setDiscrepancies] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filterType,    setFilterType]    = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');
  const [rejectState,   setRejectState]   = useState({ id: null, note: '' });
  const [reportModal,   setReportModal]   = useState(null); // 'damage' | 'shortage' | etc.

  const fetchData = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true);
      const r = await apiClient.get('/api/delivery-discrepancies');
      setDiscrepancies(r.data || []);
    } catch {}
    finally { if (initial) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData(true);
    const iv = setInterval(() => fetchData(false), 8000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this discrepancy?')) return;
    try { await apiClient.put(`/api/delivery-discrepancies/${id}/approve`); fetchData(false); }
    catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleAddToInventory = async (disc) => {
    const label = disc.type === 'shortage' ? 'Confirm Shortage' : disc.type === 'damage' ? 'Write Off' : 'Adjust Inventory';
    if (!window.confirm(`${label} and adjust inventory?`)) return;
    try {
      const r = await apiClient.put(`/api/delivery-discrepancies/${disc.id}/add-to-inventory`);
      alert(r.data.message);
      fetchData(false);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleRejectSubmit = async () => {
    if (!rejectState.note.trim()) { alert('Please enter a rejection reason.'); return; }
    try {
      await apiClient.put(`/api/delivery-discrepancies/${rejectState.id}/reject`, { admin_note: rejectState.note });
      setRejectState({ id: null, note: '' });
      fetchData(false);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const filtered = useMemo(() => discrepancies.filter(d => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (startDate && new Date(d.reported_at) < new Date(startDate)) return false;
    if (endDate   && new Date(d.reported_at) > new Date(endDate + 'T23:59:59')) return false;
    return true;
  }), [discrepancies, filterType, filterStatus, startDate, endDate]);

  const grouped = useMemo(() => {
    const map = {};
    for (const d of filtered) {
      const key = fmtGroupDate(d.reported_at);
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [filtered]);

  const sortedDates = useMemo(() =>
    Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)),
  [grouped]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Discrepancy Records</h1>
            <p className="text-sm text-gray-500">Track shortage reports, return requests and damage write-offs</p>
          </div>
        </div>
        {canReport && (
          <div className="flex gap-2">
            <button onClick={() => setReportModal('shortage')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Shortage
            </button>
            <button onClick={() => setReportModal('damage')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Damage
            </button>
          </div>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-500 font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters:
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Type:</span>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">All Types</option>
              <option value="shortage">Shortage</option>
              <option value="overage">Overage</option>
              <option value="return">Return</option>
              <option value="damage">Damage</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Status:</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">From:</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">To:</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>

          <div className="flex-1" />

          <span className="text-xs text-gray-400">Showing {filtered.length} of {discrepancies.length} records</span>

          {(filterType !== 'all' || filterStatus !== 'all' || startDate || endDate) && (
            <button onClick={() => { setFilterType('all'); setFilterStatus('all'); setStartDate(''); setEndDate(''); }}
              className="text-xs text-blue-600 hover:underline">Clear</button>
          )}

          <button onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV
          </button>
          <button onClick={() => exportXLSX(filtered)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            XLSX
          </button>
        </div>
      </div>

      {/* ── Records ── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm font-medium">No discrepancy records found</p>
          <p className="text-xs mt-1">Try adjusting your filters</p>
        </div>
      ) : sortedDates.map(date => (
        <div key={date} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Date group header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-base font-bold text-gray-900">{date}</span>
            <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              {grouped[date].length} item{grouped[date].length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Records in this group */}
          <div className="divide-y divide-gray-100">
            {grouped[date].map(disc => {
              const adjQty = disc.type === 'shortage'
                ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
                : parseFloat(disc.received_quantity);
              const adjLabel = disc.type === 'shortage' ? 'Missing' : disc.type === 'damage' ? 'Damaged' : disc.type === 'return' ? 'Returning' : 'Extra';
              const adjColor = disc.type === 'shortage' ? 'text-green-600' : disc.type === 'damage' ? 'text-red-600' : disc.type === 'return' ? 'text-purple-600' : 'text-blue-600';

              const actionLabel =
                disc.type === 'shortage' ? '+ Confirm Shortage' :
                disc.type === 'damage'   ? '✕ Write Off'        :
                disc.type === 'return'   ? '↩ Process Return'   : '+ Confirm Overage';

              return (
                <div key={disc.id} className="px-6 py-5">
                  <div className="flex items-start gap-4">

                    {/* Type badge — left column */}
                    <div className="flex-shrink-0 pt-0.5">
                      <TypeBadge type={disc.type} />
                    </div>

                    {/* Item info — main column */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm uppercase tracking-wide">{disc.item_description}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Expected: {disc.expected_quantity} {disc.unit} · Received: {disc.received_quantity} {disc.unit}
                      </div>
                      {disc.note && <div className="text-xs text-gray-400 italic mt-0.5">Note: {disc.note}</div>}
                      {disc.admin_note && <div className="text-xs text-red-500 italic mt-0.5">Admin: {disc.admin_note}</div>}
                    </div>

                    {/* Location column */}
                    <div className="w-44 flex-shrink-0 hidden sm:block">
                      {disc.branch_name && (
                        <div>
                          <div className="text-sm font-semibold text-gray-800 leading-tight">{disc.branch_name}</div>
                          {disc.reported_by_name && <div className="text-xs text-gray-400 mt-0.5">{disc.reported_by_name}</div>}
                        </div>
                      )}
                      {!disc.branch_name && disc.reported_by_name && (
                        <div className="text-xs text-gray-500">{disc.reported_by_name}</div>
                      )}
                    </div>

                    {/* Quantity display */}
                    <div className="w-28 flex-shrink-0 text-right hidden md:block">
                      <div className="text-xs text-gray-400 mb-0.5">{adjLabel}</div>
                      <div className={`text-lg font-extrabold leading-tight ${adjColor}`}>
                        {Math.abs(adjQty)}× <span className="text-sm font-bold">{disc.unit?.toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Status + action — right column */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <StatusBadge status={disc.status} type={disc.type} />
                      {isAdmin && disc.status === 'pending' && (
                        <div className="flex gap-1.5">
                          <button onClick={() => handleApprove(disc.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                            Approve
                          </button>
                          <button onClick={() => setRejectState({ id: disc.id, note: '' })}
                            className="px-2.5 py-1 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors">
                            Reject
                          </button>
                        </div>
                      )}
                      {isAdmin && disc.status === 'approved' && (
                        <button onClick={() => handleAddToInventory(disc)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap">
                          {actionLabel}
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Inline reject form */}
                  {rejectState.id === disc.id && (
                    <div className="mt-4 ml-[calc(theme(spacing.16)+theme(spacing.4))] p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-sm font-semibold text-red-700 mb-2">Rejection Reason *</p>
                      <textarea value={rejectState.note} onChange={e => setRejectState({...rejectState, note:e.target.value})}
                        rows={2} className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
                        placeholder="Explain why this is being rejected..." />
                      <div className="flex gap-2 mt-2">
                        <button onClick={handleRejectSubmit}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg">
                          Confirm Reject
                        </button>
                        <button onClick={() => setRejectState({ id: null, note: '' })}
                          className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Report modals ── */}
      {reportModal && (
        <ReportModal
          type={reportModal}
          onClose={() => setReportModal(null)}
          onSuccess={() => { setReportModal(null); fetchData(false); }}
        />
      )}
    </div>
  );
}
