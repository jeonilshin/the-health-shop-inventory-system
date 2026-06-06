import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ImportModal from '../components/ImportModal';

const LOW_STOCK_THRESHOLD = 10;

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtCurrency(n) {
  if (n == null) return '—';
  return `₱${parseFloat(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtQty(n) {
  return Math.round(parseFloat(n || 0)).toLocaleString('en-PH');
}

function ExpiryBadge({ status }) {
  const map = {
    expired:       { cls: 'bg-red-100 text-red-700',   label: 'Expired' },
    expiring_soon: { cls: 'bg-amber-100 text-amber-700', label: 'Expiring Soon' },
    good:          { cls: 'bg-green-100 text-green-700', label: 'Good' },
  };
  const { cls, label } = map[status] || { cls: 'bg-gray-100 text-gray-500', label: '—' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

function StatCard({ label, value, color, dim }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ borderTop: `3px solid ${color}` }}>
      <div className={`text-2xl font-bold ${dim ? 'text-gray-400' : 'text-gray-900'}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function Inventory() {
  const { user, isAdmin, isManager, isWarehouse, canEdit } = useAuth();
  const { showToast } = useToast();

  const needsPicker = isAdmin || isManager;

  const [selectedLocation, setSelectedLocation] = useState(
    needsPicker ? null : (user?.location_id ? parseInt(user.location_id) : null)
  );
  const [locationSummaries, setLocationSummaries] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [inventory, setInventory]   = useState([]);
  const [products, setProducts]     = useState([]);
  const [locations, setLocations]   = useState([]);
  const [loading, setLoading]       = useState(false);

  const [search, setSearch]               = useState('');
  const [filterExpiry, setFilterExpiry]   = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [showAdd, setShowAdd]         = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [historyItems, setHistoryItems]     = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selected, setSelected]       = useState(null);
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  const [editingBatchId, setEditingBatchId] = useState(null);
  const [batchEditData, setBatchEditData]   = useState({});
  const [editSaving, setEditSaving]         = useState(false);

  const toggleExpand = (productId) => setExpandedProducts(prev => {
    const next = new Set(prev);
    if (next.has(productId)) next.delete(productId); else next.add(productId);
    return next;
  });

  const [addLocation, setAddLocation] = useState('');
  const [addItems, setAddItems]       = useState([{ ...{ product_id: '', quantity: '', unit_cost: '', suggested_selling_price: '', batch_number: '', expiry_date: '' } }]);
  const [addErrors, setAddErrors]     = useState({});
  const [saving, setSaving]           = useState(false);

  const [showPullOut, setShowPullOut] = useState(false);
  const [pullOutGroup, setPullOutGroup] = useState(null);
  const [pullOutBatchId, setPullOutBatchId] = useState('');
  const [pullOutType, setPullOutType] = useState('');
  const [pullOutQty, setPullOutQty] = useState('');
  const [pullOutRecipient, setPullOutRecipient] = useState('');
  const [pullOutNotes, setPullOutNotes] = useState('');
  const [pullOutSaving, setPullOutSaving] = useState(false);

  const [showConvert, setShowConvert] = useState(false);
  const [convertFrom, setConvertFrom] = useState('');
  const [convertTo, setConvertTo] = useState('');
  const [convertUnitsPerPack, setConvertUnitsPerPack] = useState('');
  const [convertPacks, setConvertPacks] = useState('');
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertFromSearch, setConvertFromSearch] = useState('');
  const [convertToSearch, setConvertToSearch] = useState('');
  const [convertFromOpen, setConvertFromOpen] = useState(false);
  const [convertToOpen, setConvertToOpen] = useState(false);
  const [convertAutoFilled, setConvertAutoFilled] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importStep, setImportStep]       = useState(1);
  const [importLocation, setImportLocation] = useState('');
  const [showImportExcel, setShowImportExcel] = useState(false);

  const [showConvHistory, setShowConvHistory] = useState(false);
  const [convHistory, setConvHistory] = useState([]);
  const [convHistoryLoading, setConvHistoryLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchLocations();
    if (needsPicker) fetchLocationSummaries();
  }, []);

  const fetchLocationSummaries = async () => {
    setSummaryLoading(true);
    try {
      const [statsRes, locRes] = await Promise.all([
        apiClient.get('/api/inventory/location-stats'),
        apiClient.get('/api/locations'),
      ]);
      const stats = statsRes.data || [];
      const locs  = locRes.data  || [];

      const byLoc = {};
      for (const s of stats) {
        byLoc[s.location_id] = {
          products: parseInt(s.products || 0),
          totalQty: parseFloat(s.total_qty || 0),
          lowStock: parseInt(s.low_stock || 0),
          expiring: parseInt(s.expiring || 0),
        };
      }

      setLocationSummaries(
        locs.map(loc => ({ ...loc, ...(byLoc[loc.id] || { products: 0, totalQty: 0, lowStock: 0, expiring: 0 }) }))
            .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {}
    finally { setSummaryLoading(false); }
  };

  const fetchAll = useCallback(async () => {
    const locId = selectedLocation || (!needsPicker ? (user?.location_id ? parseInt(user.location_id) : null) : null);
    if (!locId && needsPicker) return;
    setLoading(true);
    try {
      const params = {};
      if (locId) params.location_id = locId;
      if (filterExpiry) params.expiry_status = filterExpiry;
      if (filterLowStock) params.low_stock = true;
      const res = await apiClient.get('/api/inventory', { params });
      setInventory(res.data || []);
    } catch {
      showToast('Failed to load inventory.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, filterExpiry, filterLowStock, needsPicker, user?.location_id]);

  useEffect(() => {
    if (selectedLocation || !needsPicker) fetchAll();
  }, [fetchAll, selectedLocation]);

  const fetchProducts  = async () => { try { const r = await apiClient.get('/api/products');  setProducts(r.data || []);  } catch {} };
  const fetchLocations = async () => { try { const r = await apiClient.get('/api/locations'); setLocations(r.data || []); } catch {} };

  const openAdd = () => {
    setAddLocation(String(selectedLocation || user?.location_id || ''));
    setAddItems([{ product_id: '', quantity: '', unit_cost: '', suggested_selling_price: '', batch_number: '', expiry_date: '' }]);
    setAddErrors({});
    setShowAdd(true);
  };

  const startInlineEdit = (batch) => {
    setEditingBatchId(batch.id);
    setBatchEditData({
      quantity:               batch.quantity,
      unit_cost:              batch.unit_cost || '',
      suggested_selling_price: batch.suggested_selling_price || '',
      batch_number:           batch.batch_number || '',
      expiry_date:            batch.expiry_date ? batch.expiry_date.slice(0, 10) : '',
    });
  };

  const cancelInlineEdit = () => { setEditingBatchId(null); setBatchEditData({}); };

  const saveInlineEdit = async (batch) => {
    if (!batchEditData.quantity || parseFloat(batchEditData.quantity) < 0) { showToast('Valid quantity required.', 'warning'); return; }
    setEditSaving(true);
    try {
      await apiClient.put(`/api/inventory/${batch.id}`, {
        quantity:               parseFloat(batchEditData.quantity),
        unit_cost:              batchEditData.unit_cost ? parseFloat(batchEditData.unit_cost) : undefined,
        suggested_selling_price: batchEditData.suggested_selling_price ? parseFloat(batchEditData.suggested_selling_price) : undefined,
        batch_number:           batchEditData.batch_number || undefined,
        expiry_date:            batchEditData.expiry_date || undefined,
      });
      showToast('Inventory updated.', 'success');
      setEditingBatchId(null);
      setBatchEditData({});
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update.', 'error');
    } finally { setEditSaving(false); }
  };

  const openHistory = async (item) => {
    setHistoryProduct(item);
    setHistoryItems([]);
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const res = await apiClient.get(`/api/history/product/${item.product_id}`);
      setHistoryItems(res.data || []);
    } catch {
      showToast('Failed to load history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAdd = async () => {
    const errs = {};
    if (!addLocation) errs.location = 'Location is required.';
    const validItems = addItems.filter(it => it.product_id && it.quantity && parseFloat(it.quantity) >= 0);
    if (validItems.length === 0) errs.items = 'At least one item with a product and quantity is required.';
    if (Object.keys(errs).length) { setAddErrors(errs); return; }
    setSaving(true);
    let ok = 0, fail = 0;
    for (const it of validItems) {
      try {
        await apiClient.post('/api/inventory', {
          product_id:   it.product_id,
          location_id:  addLocation,
          quantity:     parseFloat(it.quantity),
          unit_cost:    it.unit_cost    ? parseFloat(it.unit_cost)    : undefined,
          suggested_selling_price: it.suggested_selling_price ? parseFloat(it.suggested_selling_price) : undefined,
          batch_number: it.batch_number || undefined,
          expiry_date:  it.expiry_date  || undefined,
        });
        ok++;
      } catch { fail++; }
    }
    showToast(`Added ${ok} item${ok !== 1 ? 's' : ''}${fail > 0 ? `, ${fail} failed` : ''}.`, ok > 0 ? 'success' : 'error');
    setShowAdd(false);
    fetchAll();
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/api/inventory/${selected.id}`);
      showToast('Inventory item deleted.', 'success');
      setShowDelete(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete.', 'error');
    } finally { setSaving(false); }
  };

  const openPullOut = (group) => {
    setPullOutGroup(group);
    setPullOutBatchId(group.batches.length === 1 ? String(group.batches[0].id) : '');
    setPullOutType('');
    setPullOutQty('');
    setPullOutRecipient('');
    setPullOutNotes('');
    setShowPullOut(true);
  };

  const handlePullOut = async () => {
    if (!pullOutBatchId) { showToast('Select a batch.', 'warning'); return; }
    if (!pullOutType) { showToast('Select a pull-out type.', 'warning'); return; }
    if (!pullOutQty || parseFloat(pullOutQty) <= 0) { showToast('Enter a valid quantity.', 'warning'); return; }
    const batch = pullOutGroup.batches.find(b => String(b.id) === String(pullOutBatchId));
    if (!batch) return;
    if (parseFloat(pullOutQty) > parseFloat(batch.quantity)) {
      showToast(`Cannot pull out more than available (${fmtQty(batch.quantity)}).`, 'warning'); return;
    }
    const reason = [pullOutNotes, pullOutRecipient ? `Recipient: ${pullOutRecipient}` : ''].filter(Boolean).join(' | ') || pullOutType;
    setPullOutSaving(true);
    try {
      await apiClient.post('/api/stock-withdrawals', {
        location_id: batch.location_id,
        withdrawal_type: pullOutType,
        reason,
        items: [{ inventory_id: batch.id, product_id: batch.product_id, quantity: parseFloat(pullOutQty) }],
      });
      showToast('Pull out recorded.', 'success');
      setShowPullOut(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to pull out.', 'error');
    } finally { setPullOutSaving(false); }
  };

  const handleConvert = async () => {
    if (!convertFrom || !convertTo || !convertUnitsPerPack || !convertPacks) {
      showToast('All fields required.', 'warning'); return;
    }
    if (convertFrom === convertTo) { showToast('From and To batches must be different.', 'warning'); return; }
    setConvertSaving(true);
    try {
      const res = await apiClient.post('/api/inventory/convert-units', {
        from_inventory_id: convertFrom,
        to_inventory_id: convertTo,
        units_per_pack: parseFloat(convertUnitsPerPack),
        packs_to_convert: parseFloat(convertPacks),
      });
      showToast(res.data.message, 'success');
      setShowConvert(false);
      setConvertFrom(''); setConvertTo(''); setConvertUnitsPerPack(''); setConvertPacks('');
      setConvertFromSearch(''); setConvertToSearch(''); setConvertAutoFilled(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Conversion failed.', 'error');
    } finally { setConvertSaving(false); }
  };

  const handleConvertFromSelect = async (invId) => {
    setConvertFrom(invId);
    setConvertFromOpen(false);
    setConvertAutoFilled(false);
    setConvertUnitsPerPack('');
    const src = inventory.find(i => String(i.id) === String(invId));
    if (!src) return;
    try {
      const res = await apiClient.get(`/api/unit-conversions/product/${src.product_id}`);
      const conversions = res.data || [];
      const match = conversions.find(c =>
        c.from_unit?.toLowerCase() === src.unit?.toLowerCase() ||
        c.base_unit?.toLowerCase() === src.unit?.toLowerCase()
      );
      if (match) {
        setConvertUnitsPerPack(String(match.factor));
        setConvertAutoFilled(true);
      }
    } catch { /* no auto-fill */ }
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(l => l.trim());
      const [header, ...rows] = lines;
      const cols = header.split(',').map(c => c.replace(/"/g, '').trim().toLowerCase());
      const parsed = rows.map(row => {
        const vals = row.split(',').map(v => v.replace(/"/g, '').trim());
        const obj = {};
        cols.forEach((c, i) => { obj[c] = vals[i] || ''; });
        return obj;
      }).filter(r => r.product_id || r.product_name);
      setImportRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (importRows.length === 0) return;
    setImportSaving(true);
    let ok = 0, fail = 0;
    for (const row of importRows) {
      try {
        const prod = products.find(p => String(p.id) === String(row.product_id) || p.name.toLowerCase() === (row.product_name || '').toLowerCase());
        if (!prod) { fail++; continue; }
        await apiClient.post('/api/inventory', {
          product_id: prod.id,
          location_id: importLocation || selectedLocation || user?.location_id,
          quantity: parseFloat(row.quantity) || 0,
          unit_cost: row.unit_cost ? parseFloat(row.unit_cost) : undefined,
          suggested_selling_price: row.suggested_selling_price || row.selling_price ? parseFloat(row.suggested_selling_price || row.selling_price) : undefined,
          batch_number: row.batch_number || row.batch || undefined,
          expiry_date: row.expiry_date || row.expiry || undefined,
        });
        ok++;
      } catch { fail++; }
    }
    showToast(`Imported ${ok} rows${fail > 0 ? `, ${fail} failed` : ''}.`, ok > 0 ? 'success' : 'error');
    setShowImport(false);
    setImportRows([]);
    setImportStep(1);
    fetchAll();
    setImportSaving(false);
  };

  const openConvHistory = async () => {
    setConvHistoryLoading(true);
    setShowConvHistory(true);
    try {
      const locId = selectedLocation || user?.location_id;
      const res = await apiClient.get('/api/history', { params: { location_id: locId, action_type: 'unit_conversion', limit: 50 } });
      setConvHistory(res.data.items || []);
    } catch { showToast('Failed to load history.', 'error'); }
    finally { setConvHistoryLoading(false); }
  };

  const stats = useMemo(() => {
    const productQty = {};
    for (const i of inventory) {
      productQty[i.product_id] = (productQty[i.product_id] || 0) + parseFloat(i.quantity || 0);
    }
    return {
      total:    Object.keys(productQty).length,
      totalQty: inventory.reduce((s, i) => s + parseFloat(i.quantity || 0), 0),
      lowStock: Object.values(productQty).filter(q => q < LOW_STOCK_THRESHOLD).length,
      expiring: inventory.filter(i => ['expiring_soon', 'expired'].includes(i.expiry_status)).length,
    };
  }, [inventory]);

  const filtered = useMemo(() => {
    if (!search) return inventory;
    const q = search.toLowerCase();
    return inventory.filter(i =>
      i.product_name?.toLowerCase().includes(q) ||
      i.batch_number?.toLowerCase().includes(q)
    );
  }, [inventory, search]);

  const grouped = useMemo(() => {
    const map = {};
    for (const item of filtered) {
      if (!map[item.product_id]) {
        map[item.product_id] = { product_id: item.product_id, product_name: item.product_name, unit: item.unit, batches: [] };
      }
      map[item.product_id].batches.push(item);
    }
    for (const g of Object.values(map)) {
      g.batches.sort((a, b) => {
        if (a.expiry_date && b.expiry_date) return new Date(a.expiry_date) - new Date(b.expiry_date);
        if (a.expiry_date) return -1;
        if (b.expiry_date) return 1;
        return new Date(a.created_at) - new Date(b.created_at);
      });
    }
    return Object.values(map).sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [filtered]);

  const selectedLocName = useMemo(() => {
    if (!selectedLocation) return null;
    return (
      locations.find(l => l.id === selectedLocation || l.id === parseInt(selectedLocation))?.name ||
      locationSummaries.find(l => l.id === selectedLocation)?.name ||
      null
    );
  }, [selectedLocation, locations, locationSummaries]);

  const canEditItem = isAdmin || isWarehouse;

  const exportCSV = () => {
    const hdr = ['Product', 'Unit', 'Location', 'Quantity', 'Unit Cost', 'Batch #', 'Expiry Date', 'Status'];
    const rows = filtered.map(i => [i.product_name, i.unit, i.location_name, i.quantity, i.unit_cost || '', i.batch_number || '', i.expiry_date ? fmt(i.expiry_date) : '', i.expiry_status || '']);
    const csv = [hdr, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `inventory-${selectedLocName || 'all'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = (err) => `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${err ? 'border-red-400' : 'border-gray-300'}`;

  /* ─────────────────────── LOCATION PICKER ─────────────────────── */
  if (needsPicker && !selectedLocation) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select a location to view and manage its inventory.</p>
        </div>

        {summaryLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
          </div>
        ) : locationSummaries.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <svg className="w-14 h-14 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <p>No locations found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {locationSummaries.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc.id)}
                className="bg-white rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-lg p-5 text-left transition-all group cursor-pointer"
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${loc.type === 'warehouse' ? 'bg-blue-100' : 'bg-green-100'}`}>
                      {loc.type === 'warehouse' ? (
                        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors leading-tight">{loc.name}</div>
                      <span className={`mt-0.5 inline-flex text-xs px-1.5 py-0.5 rounded-full font-medium ${loc.type === 'warehouse' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {loc.type}
                      </span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-lg font-bold text-gray-900">{loc.products}</div>
                    <div className="text-xs text-gray-500">Products</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-lg font-bold text-gray-900">{fmtQty(loc.totalQty)}</div>
                    <div className="text-xs text-gray-500">Total Units</div>
                  </div>
                  {loc.lowStock > 0 && (
                    <div className="bg-amber-50 rounded-lg p-2.5">
                      <div className="text-lg font-bold text-amber-700">{loc.lowStock}</div>
                      <div className="text-xs text-amber-600">Low Stock</div>
                    </div>
                  )}
                  {loc.expiring > 0 && (
                    <div className="bg-red-50 rounded-lg p-2.5">
                      <div className="text-lg font-bold text-red-700">{loc.expiring}</div>
                      <div className="text-xs text-red-600">Expiring</div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ─────────────────────── INVENTORY TABLE ─────────────────────── */
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {needsPicker && (
            <button
              onClick={() => {
                setSelectedLocation(null);
                setInventory([]);
                setSearch('');
                setFilterExpiry('');
                setFilterLowStock(false);
                fetchLocationSummaries();
              }}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mb-1.5 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              All Locations
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            Inventory
            {selectedLocName && <span className="text-gray-400 font-normal ml-2 text-xl">— {selectedLocName}</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage stock levels and batch information.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={openConvHistory}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Conv. History
          </button>
          {(isAdmin || isManager || isWarehouse || canEdit) && (
            <button
              onClick={() => setShowConvert(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Convert Unit
            </button>
          )}
          {canEditItem && canEdit && (
            <button
              onClick={() => setShowImportExcel(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import Excel
            </button>
          )}
          {canEditItem && canEdit && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Products"            value={stats.total}           color="#2563eb" />
        <StatCard label="Total Units"         value={fmtQty(stats.totalQty)} color="#10b981" />
        <StatCard label="Low Stock Items"     value={stats.lowStock}         color={stats.lowStock > 0 ? '#f59e0b' : '#e5e7eb'} dim={stats.lowStock === 0} />
        <StatCard label="Expiring / Expired"  value={stats.expiring}         color={stats.expiring > 0 ? '#ef4444' : '#e5e7eb'} dim={stats.expiring === 0} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product or batch number..."
            className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterExpiry}
          onChange={e => setFilterExpiry(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Expiry Status</option>
          <option value="good">Good</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50 select-none">
          <input type="checkbox" checked={filterLowStock} onChange={e => setFilterLowStock(e.target.checked)} className="rounded" />
          Low Stock Only
        </label>
        <button
          onClick={() => { setSearch(''); setFilterExpiry(''); setFilterLowStock(false); }}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-14 h-14 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-gray-400 text-sm">{search ? `No items match "${search}"` : 'No inventory items found.'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                  {isAdmin && <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>}
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sell Price</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch #</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.map(group => {
                  const totalQty  = group.batches.reduce((s, b) => s + parseFloat(b.quantity || 0), 0);
                  const isLow     = totalQty < LOW_STOCK_THRESHOLD;
                  const isExpanded = expandedProducts.has(group.product_id);
                  const statusPriority = { expired: 4, expiring_soon: 3, good: 2, no_expiry: 1 };
                  const worstBatch = group.batches.reduce((w, b) =>
                    (statusPriority[b.expiry_status] || 0) > (statusPriority[w?.expiry_status] || 0) ? b : w,
                    group.batches[0]
                  );
                  const earliestExpiry = group.batches.find(b => b.expiry_date)?.expiry_date;
                  const costs   = [...new Set(group.batches.map(b => parseFloat(b.unit_cost || 0)).filter(Boolean))];
                  const costMin = costs.length ? Math.min(...costs) : null;
                  const costMax = costs.length ? Math.max(...costs) : null;
                  const costDisplay = costMin == null ? '—'
                    : costMin === costMax ? fmtCurrency(costMin)
                    : `${fmtCurrency(costMin)} – ${fmtCurrency(costMax)}`;

                  const isSingle = group.batches.length === 1;
                  const singleBatch = isSingle ? group.batches[0] : null;

                  return (
                    <React.Fragment key={group.product_id}>
                      {/* ── Product summary row ── */}
                      {isSingle && editingBatchId === singleBatch?.id ? (
                        <tr className="bg-blue-50/30">
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-4 flex-shrink-0" />
                              <span className="font-semibold text-gray-900 text-sm">{group.product_name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-2.5 text-gray-500 text-sm">{group.unit}</td>
                          <td className="px-3 py-2.5 text-right">
                            <input type="number" min="0" step="1" value={batchEditData.quantity}
                              onChange={e => setBatchEditData(d => ({...d, quantity: e.target.value}))}
                              className="w-20 px-2 py-1 border-2 border-blue-400 rounded text-sm text-right focus:outline-none" />
                          </td>
                          {isAdmin && (
                            <td className="px-3 py-2.5">
                              <input type="number" min="0" step="0.01" value={batchEditData.unit_cost}
                                onChange={e => setBatchEditData(d => ({...d, unit_cost: e.target.value}))}
                                className="w-24 px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none" placeholder="0.00" />
                            </td>
                          )}
                          <td className="px-3 py-2.5">
                            <input type="number" min="0" step="0.01" value={batchEditData.suggested_selling_price}
                              onChange={e => setBatchEditData(d => ({...d, suggested_selling_price: e.target.value}))}
                              className="w-24 px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none" placeholder="0.00" />
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="text" value={batchEditData.batch_number}
                              onChange={e => setBatchEditData(d => ({...d, batch_number: e.target.value}))}
                              className="w-28 px-2 py-1 border-2 border-blue-400 rounded text-xs font-mono focus:outline-none" placeholder="LOT-001" />
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="date" value={batchEditData.expiry_date}
                              onChange={e => setBatchEditData(d => ({...d, expiry_date: e.target.value}))}
                              className="w-36 px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none" />
                          </td>
                          <td className="px-3 py-2.5" />
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button onClick={() => saveInlineEdit(singleBatch)} disabled={editSaving}
                                className="w-7 h-7 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50 transition-colors">
                                {editSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> :
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                              </button>
                              <button onClick={cancelInlineEdit}
                                className="w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                              <span className="text-xs text-gray-400 whitespace-nowrap">Cancel Edit</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                      <tr
                        className={`transition-colors ${isSingle ? '' : 'hover:bg-gray-50 cursor-pointer select-none'} ${isLow ? 'bg-amber-50/40' : ''} ${isExpanded ? 'border-b-0' : ''}`}
                        onClick={isSingle ? undefined : () => toggleExpand(group.product_id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {isSingle
                              ? <span className="w-4 flex-shrink-0" />
                              : (
                                <svg
                                  className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              )
                            }
                            <div>
                              <div className="font-semibold text-gray-900">{group.product_name}</div>
                              {isLow && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-xs text-amber-600 font-medium">Low stock</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-500">{group.unit}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-bold tabular-nums text-base ${isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                            {fmtQty(totalQty)}
                          </span>
                        </td>
                        {isAdmin && <td className="px-5 py-3 text-gray-600 text-sm">{isSingle ? fmtCurrency(singleBatch.unit_cost) : costDisplay}</td>}
                        <td className="px-5 py-3 text-sm">
                          {group.batches[0]?.suggested_selling_price
                            ? <span className="font-semibold text-gray-900">{fmtCurrency(group.batches[0].suggested_selling_price)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {isSingle
                            ? <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{singleBatch.batch_number || '—'}</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                                {group.batches.length} batches
                              </span>
                          }
                        </td>
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-sm">
                          {isSingle ? fmt(singleBatch.expiry_date) : (earliestExpiry ? fmt(earliestExpiry) : '—')}
                        </td>
                        <td className="px-5 py-3"><ExpiryBadge status={isSingle ? singleBatch.expiry_status : worstBatch?.expiry_status} /></td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={e => { e.stopPropagation(); openHistory(group.batches[0]); }}
                              className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                            >
                              History
                            </button>
                            {canEdit && totalQty > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); openPullOut(group); }}
                                className="px-2.5 py-1 text-xs rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium transition-colors"
                              >
                                Pull Out
                              </button>
                            )}
                            {isSingle && canEditItem && canEdit && (
                              <button
                                onClick={e => { e.stopPropagation(); startInlineEdit(singleBatch); }}
                                className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors"
                              >
                                Edit
                              </button>
                            )}
                            {isSingle && isAdmin && (
                              <button
                                onClick={e => { e.stopPropagation(); setSelected(singleBatch); setShowDelete(true); }}
                                className="px-2.5 py-1 text-xs rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      )}

                      {/* ── Batch detail rows ── */}
                      {isExpanded && group.batches.map((batch, idx) => {
                        const bQty = parseFloat(batch.quantity || 0);
                        const bLow = bQty < LOW_STOCK_THRESHOLD;
                        return (
                          editingBatchId === batch.id ? (
                            <tr key={batch.id} className="border-t border-blue-200 bg-blue-50/40">
                              <td className="pl-14 pr-3 py-2.5">
                                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Batch #{idx + 1}</span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-400 text-xs">{group.unit}</td>
                              <td className="px-3 py-2.5 text-right">
                                <input type="number" min="0" step="1" value={batchEditData.quantity}
                                  onChange={e => setBatchEditData(d => ({...d, quantity: e.target.value}))}
                                  className="w-20 px-2 py-1 border-2 border-blue-400 rounded text-sm text-right focus:outline-none" />
                              </td>
                              {isAdmin && (
                                <td className="px-3 py-2.5">
                                  <input type="number" min="0" step="0.01" value={batchEditData.unit_cost}
                                    onChange={e => setBatchEditData(d => ({...d, unit_cost: e.target.value}))}
                                    className="w-24 px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none" placeholder="0.00" />
                                </td>
                              )}
                              <td className="px-3 py-2.5">
                                <input type="number" min="0" step="0.01" value={batchEditData.suggested_selling_price}
                                  onChange={e => setBatchEditData(d => ({...d, suggested_selling_price: e.target.value}))}
                                  className="w-24 px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none" placeholder="0.00" />
                              </td>
                              <td className="px-3 py-2.5">
                                <input type="text" value={batchEditData.batch_number}
                                  onChange={e => setBatchEditData(d => ({...d, batch_number: e.target.value}))}
                                  className="w-28 px-2 py-1 border-2 border-blue-400 rounded text-xs font-mono focus:outline-none" placeholder="LOT-001" />
                              </td>
                              <td className="px-3 py-2.5">
                                <input type="date" value={batchEditData.expiry_date}
                                  onChange={e => setBatchEditData(d => ({...d, expiry_date: e.target.value}))}
                                  className="w-36 px-2 py-1 border-2 border-blue-400 rounded text-sm focus:outline-none" />
                              </td>
                              <td className="px-3 py-2.5" />
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button onClick={() => saveInlineEdit(batch)} disabled={editSaving}
                                    className="w-7 h-7 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50 transition-colors">
                                    {editSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> :
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                                  </button>
                                  <button onClick={cancelInlineEdit}
                                    className="w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                  <span className="text-xs text-gray-400 whitespace-nowrap">Cancel Edit</span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                          <tr key={batch.id} className={`border-t border-blue-100/60 ${bLow ? 'bg-amber-50/20' : 'bg-blue-50/20'}`}>
                            <td className="pl-14 pr-5 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded min-w-[1.5rem] text-center flex-shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="text-xs text-gray-400">Batch #{idx + 1}</span>
                              </div>
                            </td>
                            <td className="px-5 py-2.5 text-gray-400 text-xs">{group.unit}</td>
                            <td className="px-5 py-2.5 text-right">
                              <span className={`font-semibold tabular-nums text-sm ${bLow ? 'text-amber-600' : 'text-gray-700'}`}>
                                {fmtQty(bQty)}
                              </span>
                            </td>
                            {isAdmin && <td className="px-5 py-2.5 text-gray-600 text-xs">{fmtCurrency(batch.unit_cost)}</td>}
                            <td className="px-5 py-2.5 text-gray-600 text-xs">{batch.suggested_selling_price ? fmtCurrency(batch.suggested_selling_price) : '—'}</td>
                            <td className="px-5 py-2.5">
                              <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {batch.batch_number || '—'}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap text-xs">{fmt(batch.expiry_date)}</td>
                            <td className="px-5 py-2.5"><ExpiryBadge status={batch.expiry_status} /></td>
                            <td className="px-5 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {canEditItem && canEdit && (
                                  <button
                                    onClick={() => startInlineEdit(batch)}
                                    className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors"
                                  >
                                    Edit
                                  </button>
                                )}
                                {isAdmin && (
                                  <button
                                    onClick={() => { setSelected(batch); setShowDelete(true); }}
                                    className="px-2.5 py-1 text-xs rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          )
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {grouped.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              {grouped.length} product{grouped.length !== 1 ? 's' : ''}
              {' · '}
              {filtered.length} batch{filtered.length !== 1 ? 'es' : ''}
              {search ? ` matching "${search}"` : ''}
            </span>
            <span>
              Total: <strong className="text-gray-900">{fmtQty(filtered.reduce((s, i) => s + parseFloat(i.quantity || 0), 0))}</strong> units
            </span>
          </div>
        )}
      </div>

      {/* ── ADD MODAL ── */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Inventory Items" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-gray-100">
            <Field label="Location" required error={addErrors.location}>
              <select value={addLocation} onChange={e => setAddLocation(e.target.value)}
                className={inputCls(addErrors.location)} disabled={!isAdmin && !!user?.location_id}>
                <option value="">Select location...</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            {addErrors.items && <p className="text-xs text-red-600 self-end pb-2">{addErrors.items}</p>}
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {addItems.map((item, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    Item {idx + 1}
                  </span>
                  {addItems.length > 1 && (
                    <button onClick={() => setAddItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-3">
                    <Field label="Product" required>
                      <select value={item.product_id}
                        onChange={e => setAddItems(prev => prev.map((it, i) => i === idx ? {...it, product_id: e.target.value} : it))}
                        className={inputCls()}>
                        <option value="">Select product...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Quantity" required>
                    <input type="number" min="0" step="1" placeholder="0"
                      value={item.quantity}
                      onChange={e => setAddItems(prev => prev.map((it, i) => i === idx ? {...it, quantity: e.target.value} : it))}
                      className={inputCls()} />
                  </Field>
                  {isAdmin && (
                    <Field label="Unit Cost (₱)">
                      <input type="number" min="0" step="0.01" placeholder="0.00"
                        value={item.unit_cost}
                        onChange={e => setAddItems(prev => prev.map((it, i) => i === idx ? {...it, unit_cost: e.target.value} : it))}
                        className={inputCls()} />
                    </Field>
                  )}
                  <Field label="Sell Price (₱)">
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={item.suggested_selling_price}
                      onChange={e => setAddItems(prev => prev.map((it, i) => i === idx ? {...it, suggested_selling_price: e.target.value} : it))}
                      className={inputCls()} />
                  </Field>
                  <Field label="Batch Number">
                    <input type="text" placeholder="e.g. LOT-2024-001"
                      value={item.batch_number}
                      onChange={e => setAddItems(prev => prev.map((it, i) => i === idx ? {...it, batch_number: e.target.value} : it))}
                      className={inputCls()} />
                  </Field>
                  <Field label="Expiry Date">
                    <input type="date"
                      value={item.expiry_date}
                      onChange={e => setAddItems(prev => prev.map((it, i) => i === idx ? {...it, expiry_date: e.target.value} : it))}
                      className={inputCls()} />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setAddItems(prev => [...prev, { product_id: '', quantity: '', unit_cost: '', suggested_selling_price: '', batch_number: '', expiry_date: '' }])}
            className="w-full py-2 text-sm text-blue-600 border-2 border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Another Item
          </button>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="px-5 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium transition-colors flex items-center gap-2">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Adding...' : `Add ${addItems.filter(it => it.product_id && it.quantity).length || addItems.length} Item${addItems.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── HISTORY MODAL ── */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title={`History — ${historyProduct?.product_name}`} size="xl">
        {historyLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : historyItems.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No history found for this product.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Action', 'Location', 'Qty Change', 'Performed By'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyItems.map(h => {
                  const change = h.quantity_change != null ? parseFloat(h.quantity_change) : null;
                  return (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(h.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-gray-700 capitalize">{h.action_type.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{h.location_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        {change != null ? (
                          <span className={`font-bold text-xs ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {change > 0 ? '+' : ''}{Math.round(change).toLocaleString('en-PH')}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{h.performer_name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* ── DELETE MODAL ── */}
      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete Inventory Item" size="sm">
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg mb-4">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="text-sm text-red-800">
            Delete <strong>{selected?.product_name}</strong> at <strong>{selected?.location_name}</strong>? This cannot be undone.
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg font-medium transition-colors flex items-center gap-2">
            {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* ── PULL OUT MODAL ── */}
      <Modal isOpen={showPullOut} onClose={() => setShowPullOut(false)} title="Pull Out Stock" size="lg">
        {pullOutGroup && (() => {
          const totalQty = pullOutGroup.batches.reduce((s, b) => s + parseFloat(b.quantity || 0), 0);
          const selectedBatch = pullOutGroup.batches.find(b => String(b.id) === String(pullOutBatchId));
          const maxQty = selectedBatch ? parseFloat(selectedBatch.quantity) : 0;
          const typeDesc = {
            employee_purchase: 'For items used by employees or for internal use.',
            expired: 'Removing expired stock from inventory.',
            damaged: 'Items that are damaged or unusable.',
            promotional: 'Items used for promotions or samples.',
            adjustment: 'Correcting discrepancies in stock count.',
            other: 'Any other reason for stock removal.',
          };
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 -mt-1">Record stock leaving this location for a non-sale reason.</p>

              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-red-700 font-medium">The quantity is removed from inventory immediately and admin is notified.</span>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="font-semibold text-gray-900 text-sm">{pullOutGroup.product_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Total Available: <strong className="text-gray-700">{fmtQty(totalQty)} {pullOutGroup.unit}</strong>
                  {pullOutGroup.batches.length > 1 && ` across ${pullOutGroup.batches.length} batches`}
                </div>
              </div>

              <Field label="Select Batch to Pull From" required>
                <select value={pullOutBatchId} onChange={e => { setPullOutBatchId(e.target.value); setPullOutQty(''); }} className={inputCls()}>
                  {pullOutGroup.batches.length > 1 && <option value="">Choose a batch...</option>}
                  {pullOutGroup.batches.map((b, idx) => (
                    <option key={b.id} value={b.id}>
                      {'Batch #' + (idx + 1) + (b.batch_number ? ' — ' + b.batch_number : '') + ' · ' + fmtQty(b.quantity) + ' ' + pullOutGroup.unit + (b.expiry_date ? ' · Exp: ' + fmt(b.expiry_date) : '')}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Pull-out Type" required>
                <select value={pullOutType} onChange={e => setPullOutType(e.target.value)} className={inputCls()}>
                  <option value="">Select type...</option>
                  <option value="employee_purchase">Employee Purchase</option>
                  <option value="expired">Expired</option>
                  <option value="damaged">Damaged</option>
                  <option value="promotional">Promotional / Sample</option>
                  <option value="adjustment">Inventory Adjustment</option>
                  <option value="other">Other</option>
                </select>
                {pullOutType && typeDesc[pullOutType] && (
                  <p className="mt-1 text-xs text-gray-500">{typeDesc[pullOutType]}</p>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={`Quantity${maxQty ? ' (max ' + fmtQty(maxQty) + ')' : ''}`} required>
                  <input
                    type="number" min="1" step="1"
                    max={maxQty || undefined}
                    value={pullOutQty}
                    onChange={e => setPullOutQty(e.target.value)}
                    disabled={!pullOutBatchId}
                    className={`${inputCls()}${!pullOutBatchId ? ' opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="0"
                  />
                </Field>
                <Field label="Recipient Name">
                  <input
                    type="text" value={pullOutRecipient}
                    onChange={e => setPullOutRecipient(e.target.value)}
                    className={inputCls()}
                    placeholder="e.g. John Doe"
                  />
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  value={pullOutNotes}
                  onChange={e => setPullOutNotes(e.target.value)}
                  rows={2}
                  className={`${inputCls()} resize-none`}
                  placeholder="Optional notes..."
                />
              </Field>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setShowPullOut(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button onClick={handlePullOut} disabled={pullOutSaving} className="px-4 py-2 text-sm text-white bg-red-700 hover:bg-red-800 disabled:bg-red-400 rounded-lg font-medium flex items-center gap-2">
                  {pullOutSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {pullOutSaving ? 'Recording...' : 'Record Pull-out'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── CONVERT UNIT MODAL ── */}
      <Modal isOpen={showConvert} onClose={() => {
        setShowConvert(false);
        setConvertFrom(''); setConvertTo(''); setConvertUnitsPerPack(''); setConvertPacks('');
        setConvertFromSearch(''); setConvertToSearch('');
        setConvertFromOpen(false); setConvertToOpen(false); setConvertAutoFilled(false);
      }} title={
        <span className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Convert Units
        </span>
      } size="lg">
        {(() => {
          const srcItem = inventory.find(i => String(i.id) === String(convertFrom));
          const dstItem = inventory.find(i => String(i.id) === String(convertTo));
          const filteredFrom = inventory.filter(i =>
            !convertFromSearch || `${i.product_name} ${i.unit} ${i.batch_number || ''}`.toLowerCase().includes(convertFromSearch.toLowerCase())
          );
          const filteredTo = inventory.filter(i =>
            String(i.id) !== String(convertFrom) &&
            (!convertToSearch || `${i.product_name} ${i.unit} ${i.batch_number || ''}`.toLowerCase().includes(convertToSearch.toLowerCase()))
          );
          return (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="border-l-4 border-blue-500 bg-blue-50 px-4 py-3 rounded-r-lg">
                <p className="text-sm text-blue-800">
                  Convert any unit to PC (pieces).<br />
                  <span className="font-medium">Example:</span> 1 BOX = 100 PC, 1 BOTTLE = 50 PC, 1 PACK = 24 PC
                </p>
              </div>

              {/* From Item */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Item (Any Unit) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between bg-white hover:border-blue-400 transition-colors"
                    onClick={() => { setConvertFromOpen(v => !v); setConvertToOpen(false); }}
                  >
                    {srcItem ? (
                      <span className="text-gray-900">
                        <span className="font-semibold text-blue-700">[{srcItem.unit}]</span> {srcItem.product_name}
                        {srcItem.batch_number ? ` · ${srcItem.batch_number}` : ''} — <span className="text-gray-500">{fmtQty(srcItem.quantity)} {srcItem.unit}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Search for BOX / BOT / PACK items...</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${convertFromOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {convertFromOpen && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          type="text"
                          value={convertFromSearch}
                          onChange={e => setConvertFromSearch(e.target.value)}
                          placeholder="Search product or unit..."
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredFrom.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-400">No items found</div>
                        ) : filteredFrom.map(i => (
                          <div
                            key={i.id}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex items-center justify-between ${String(i.id) === String(convertFrom) ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                            onClick={() => { handleConvertFromSelect(i.id); setConvertFromSearch(''); }}
                          >
                            <span>
                              <span className="font-semibold text-blue-600">[{i.unit}]</span> {i.product_name}
                              {i.batch_number ? <span className="text-gray-400 ml-1">· {i.batch_number}</span> : ''}
                            </span>
                            <span className="text-gray-400 text-xs ml-2">{fmtQty(i.quantity)} {i.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {srcItem && (
                  <p className="mt-1 text-xs text-gray-500">Available: <strong>{fmtQty(srcItem.quantity)} {srcItem.unit}</strong></p>
                )}
              </div>

              {/* To Item */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Item (PC) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between bg-white hover:border-blue-400 transition-colors"
                    onClick={() => { setConvertToOpen(v => !v); setConvertFromOpen(false); }}
                  >
                    {dstItem ? (
                      <span className="text-gray-900">
                        <span className="font-semibold text-blue-700">[{dstItem.unit}]</span> {dstItem.product_name}
                        {dstItem.batch_number ? ` · ${dstItem.batch_number}` : ''} — <span className="text-gray-500">{fmtQty(dstItem.quantity)} {dstItem.unit}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Search for PC items...</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${convertToOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {convertToOpen && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          type="text"
                          value={convertToSearch}
                          onChange={e => setConvertToSearch(e.target.value)}
                          placeholder="Search product or unit..."
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredTo.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-400">No items found</div>
                        ) : filteredTo.map(i => (
                          <div
                            key={i.id}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex items-center justify-between ${String(i.id) === String(convertTo) ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                            onClick={() => { setConvertTo(i.id); setConvertToOpen(false); setConvertToSearch(''); }}
                          >
                            <span>
                              <span className="font-semibold text-blue-600">[{i.unit}]</span> {i.product_name}
                              {i.batch_number ? <span className="text-gray-400 ml-1">· {i.batch_number}</span> : ''}
                            </span>
                            <span className="text-gray-400 text-xs ml-2">{fmtQty(i.quantity)} {i.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {dstItem && (
                  <p className="mt-1 text-xs text-gray-500">Current stock: <strong>{fmtQty(dstItem.quantity)} {dstItem.unit}</strong></p>
                )}
              </div>

              {/* Units per Unit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Units per Unit <span className="text-red-500">*</span>
                  {convertAutoFilled && (
                    <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Auto-filled</span>
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={convertUnitsPerPack}
                  onChange={e => { setConvertUnitsPerPack(e.target.value); setConvertAutoFilled(false); }}
                  placeholder={`e.g., 100 (1 ${srcItem?.unit || 'UNIT'} = 100 PC)`}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${convertAutoFilled ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'}`}
                />
                <p className="mt-1 text-xs text-gray-400">How many pieces are in one {srcItem?.unit || 'unit'}?</p>
              </div>

              {/* Units to Convert */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Units to Convert <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={convertPacks}
                  onChange={e => setConvertPacks(e.target.value)}
                  placeholder="e.g., 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">How many {srcItem?.unit ? `${srcItem.unit}(s)` : 'boxes/bottles'} do you want to convert?</p>
              </div>

              {/* Conversion preview */}
              {convertFrom && convertTo && convertUnitsPerPack && convertPacks && (() => {
                const packs = parseFloat(convertPacks || 0);
                const upp   = parseFloat(convertUnitsPerPack || 0);
                const pieces = packs * upp;
                return (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <div className="font-semibold text-blue-800 mb-1">Preview</div>
                    <div className="text-blue-700 space-y-0.5">
                      <div>— <strong>{fmtQty(packs)} {srcItem?.unit || 'unit(s)'}</strong> from <em>{srcItem?.product_name}</em></div>
                      <div>+ <strong>{fmtQty(pieces)} {dstItem?.unit || 'PC'}</strong> to <em>{dstItem?.product_name}</em></div>
                      <div className="text-xs text-blue-500 mt-1">1 {srcItem?.unit || 'unit'} = {fmtQty(upp)} {dstItem?.unit || 'PC'}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleConvert}
                  disabled={convertSaving}
                  className="flex-1 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {convertSaving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Converting...</>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Convert Units
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowConvert(false);
                    setConvertFrom(''); setConvertTo(''); setConvertUnitsPerPack(''); setConvertPacks('');
                    setConvertFromSearch(''); setConvertToSearch('');
                    setConvertFromOpen(false); setConvertToOpen(false); setConvertAutoFilled(false);
                  }}
                  className="px-5 py-2.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── IMPORT EXCEL MODAL ── */}
      <ImportModal
        isOpen={showImportExcel}
        onClose={() => setShowImportExcel(false)}
        locations={locations}
        selectedLocation={selectedLocation}
        onImported={() => { fetchAll(); }}
      />

      {/* ── IMPORT CSV MODAL ── */}
      <Modal isOpen={showImport} onClose={() => { setShowImport(false); setImportRows([]); setImportStep(1); }} title="Import Inventory from CSV" size="xl">
        <div className="space-y-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs font-medium">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${importStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
              <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">1</span>
              Upload
            </div>
            <div className={`flex-1 h-px ${importStep >= 2 ? 'bg-blue-400' : 'bg-gray-200'}`} />
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${importStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
              <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">2</span>
              Preview & Import
            </div>
          </div>

          {importStep === 1 && (
            <div className="space-y-4">
              <Field label="Import to Location" required>
                <select value={importLocation || String(selectedLocation || '')}
                  onChange={e => setImportLocation(e.target.value)}
                  className={inputCls()}>
                  <option value="">Select location...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                <div className="font-semibold mb-1">Expected CSV columns (case-insensitive):</div>
                <code className="block text-blue-700">product_id or product_name, quantity, unit_cost, suggested_selling_price, batch_number, expiry_date</code>
                <div className="mt-1 text-blue-600">• Required: product_id or product_name, quantity</div>
                <div className="text-blue-600">• Optional: unit_cost, selling_price, batch_number, expiry_date</div>
              </div>

              <Field label="Select CSV File" required>
                <input type="file" accept=".csv"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const lines = ev.target.result.split('\n').filter(l => l.trim());
                      const [header, ...rows] = lines;
                      const cols = header.split(',').map(c => c.replace(/"/g, '').trim().toLowerCase());
                      const parsed = rows.map(row => {
                        const vals = row.split(',').map(v => v.replace(/"/g, '').trim());
                        const obj = {};
                        cols.forEach((c, i) => { obj[c] = vals[i] || ''; });
                        return obj;
                      }).filter(r => r.product_id || r.product_name);
                      setImportRows(parsed);
                      if (parsed.length > 0) setImportStep(2);
                    };
                    reader.readAsText(file);
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </Field>
            </div>
          )}

          {importStep === 2 && importRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{importRows.length} rows parsed</div>
                    <div className="text-xs text-gray-500">Review before importing</div>
                  </div>
                </div>
                <button onClick={() => { setImportRows([]); setImportStep(1); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  ← Change file
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase tracking-wide">#</th>
                      {Object.keys(importRows[0]).map(k => (
                        <th key={k} className="px-3 py-2 text-left text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{k}</th>
                      ))}
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importRows.slice(0, 50).map((row, i) => {
                      const prod = products.find(p => String(p.id) === String(row.product_id) || p.name.toLowerCase() === (row.product_name || '').toLowerCase());
                      return (
                        <tr key={i} className={prod ? 'hover:bg-gray-50' : 'bg-red-50'}>
                          <td className="px-3 py-1.5 text-gray-400 font-mono">{i + 1}</td>
                          {Object.values(row).map((v, j) => <td key={j} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{v || <span className="text-gray-300">—</span>}</td>)}
                          <td className="px-3 py-1.5">
                            {prod
                              ? <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full text-xs font-medium">✓ Matched</span>
                              : <span className="inline-flex items-center gap-1 text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full text-xs font-medium">✗ Not found</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {importRows.length > 50 && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">...and {importRows.length - 50} more rows</div>
                )}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <strong>{importRows.filter(row => products.find(p => String(p.id) === String(row.product_id) || p.name.toLowerCase() === (row.product_name || '').toLowerCase())).length}</strong> of {importRows.length} rows will be imported (unmatched products will be skipped).
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button onClick={() => { setShowImport(false); setImportRows([]); setImportStep(1); }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            {importStep === 2 && (
              <button onClick={handleImportSubmit} disabled={importSaving || importRows.length === 0}
                className="px-5 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg font-medium flex items-center gap-2">
                {importSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {importSaving ? 'Importing...' : `Import ${importRows.filter(row => products.find(p => String(p.id) === String(row.product_id) || p.name.toLowerCase() === (row.product_name || '').toLowerCase())).length} Rows`}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── CONVERSION HISTORY MODAL ── */}
      <Modal isOpen={showConvHistory} onClose={() => setShowConvHistory(false)} title="Unit Conversion History" size="xl">
        {convHistoryLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : convHistory.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No conversion history found.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                {['Date', 'Product', 'Conversion', 'Performed By'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {convHistory.map(h => {
                  const d = h.details ? (typeof h.details === 'string' ? JSON.parse(h.details) : h.details) : {};
                  return (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(h.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800 font-medium text-xs">{h.product_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {d.packs_converted} {d.from_unit} × {d.units_per_pack} = <strong>{d.pieces_added} {d.to_unit}</strong>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{h.performer_name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

    </div>
  );
}
