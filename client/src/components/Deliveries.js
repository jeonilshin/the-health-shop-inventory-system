import { useState, useEffect, useContext } from 'react';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import DiscrepancyModal from './DiscrepancyModal';
import AutocompleteSearch from './AutocompleteSearch';
import {
  FiTruck, FiPackage, FiCheck, FiClock, FiAlertCircle,
  FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiX, FiInfo, FiXCircle, FiChevronDown, FiDownload, FiFilter
} from 'react-icons/fi';

// Each delivery/request form holds an array of item rows so multiple products
// can be moved in one delivery. These factories build blank rows; `uid` gives
// React a stable key when rows are added or removed.
let _uidCounter = 0;
const newUid = () => `row-${++_uidCounter}`;
const blankRequestItem = () => ({ uid: newUid(), description: '', unit: '', quantity: '' });
const blankDeliveryItem = () => ({
  uid: newUid(), description: '', unit: '', unit_cost: '', quantity: '',
  available_quantity: null, cost_batch_id: '', costBatches: []
});

function Deliveries() {
  const { user } = useContext(AuthContext);

  // ── deliveries ──
  const [deliveries, setDeliveries]                 = useState([]);
  const [awaitingAdmin, setAwaitingAdmin]           = useState([]);
  const [incomingDeliveries, setIncomingDeliveries] = useState([]);

  // ── discrepancies ──
  const [discrepancies, setDiscrepancies] = useState([]);
  const [pendingDiscs, setPendingDiscs]   = useState([]);

  // ── modals / inline reject ──
  const [discModal, setDiscModal]         = useState({ open: false, type: null, delivery: null });
  const [rejectState, setRejectState]     = useState({ id: null, note: '' });
  const [rejectDeliveryState, setRejectDeliveryState] = useState({ id: null, reason: '' });
  const [issueMenuDeliveryId, setIssueMenuDeliveryId] = useState(null); // which delivery has the sub-menu open
  const [viewItemsModal, setViewItemsModal] = useState({ open: false, delivery: null });
  const [batchSelectionModal, setBatchSelectionModal] = useState({ open: false, delivery: null, batches: null });
  const [selectedBatches, setSelectedBatches] = useState({}); // { item_id: [{ batch_id, quantity }] }

  // ── history visibility ──
  const [showDiscHistory, setShowDiscHistory] = useState(false);

  // ── warehouse delivery creation ──
  const [showCreateDelivery, setShowCreateDelivery] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [locations, setLocations] = useState([]);

  // ── filters ──
  const [filters, setFilters] = useState({
    productSearch: '',
    fromLocation: '',
    toLocation: '',
    startDate: '',
    endDate: '',
    status: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Multi-item forms: each form holds an array of item rows plus shared fields.
  const [requestItems, setRequestItems] = useState(() => [blankRequestItem()]);
  const [requestNotes, setRequestNotes] = useState('');

  const [deliveryItems, setDeliveryItems] = useState(() => [blankDeliveryItem()]);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryFrom, setDeliveryFrom]   = useState(
    () => (user.role === 'warehouse' ? String(user.location_id ?? '') : '')
  );
  const [deliveryTo, setDeliveryTo]       = useState('');

  useEffect(() => {
    fetchLocations();
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchAll = async () => {
    await Promise.all([fetchDeliveries(), fetchDiscrepancies()]);
  };

  const fetchDeliveries = async () => {
    try {
      const response = await api.get('/deliveries');
      const all = response.data;
      setDeliveries(all);

      if (user.role === 'admin') {
        // 'pending' = directly-created deliveries (Create Delivery / branch
        // requests); 'awaiting_admin' = transfer-shipped. Admin confirms both.
        setAwaitingAdmin(all.filter(d =>
          d.status === 'awaiting_admin' || d.status === 'pending'
        ));
      }
      if (user.role === 'branch_manager') {
        // Get manager's assigned branches
        try {
          const managerBranchesRes = await api.get(`/users/${user.id}/branches`);
          const managerBranchIds = managerBranchesRes.data.map(b => b.location_id);
          const allManagerLocationIds = [...new Set([user.location_id, ...managerBranchIds])];
          
          // Show deliveries for all managed branches
          setIncomingDeliveries(all.filter(d =>
            (d.status === 'admin_confirmed' || d.status === 'in_transit' || d.status === 'pending_manager_confirmation') &&
            allManagerLocationIds.includes(d.to_location_id)
          ));
          
          // Show pending deliveries that need manager confirmation
          setAwaitingAdmin(all.filter(d =>
            (d.status === 'awaiting_admin' || d.status === 'pending') &&
            allManagerLocationIds.includes(d.to_location_id)
          ));
        } catch (error) {
          // Fallback to primary location if can't fetch managed branches
          setIncomingDeliveries(all.filter(d =>
            (d.status === 'admin_confirmed' || d.status === 'in_transit' || d.status === 'pending_manager_confirmation') &&
            d.to_location_id === user.location_id
          ));
        }
      } else if (user.role === 'branch_staff') {
        setIncomingDeliveries(all.filter(d =>
          (d.status === 'admin_confirmed' || d.status === 'in_transit' || d.status === 'pending_manager_confirmation') &&
          d.to_location_id === user.location_id
        ));
      }
    } catch (error) {
      if (error.response?.status === 500) {
        alert('Database error: Please ensure all migrations have been run. Check SETUP_DELIVERY_SYSTEM.md');
      }
    }
  };

  const fetchDiscrepancies = async () => {
    try {
      const res = await api.get('/delivery-discrepancies');
      const all = res.data;
      setDiscrepancies(all);
      if (user.role === 'admin') {
        setPendingDiscs(all.filter(d => d.status === 'pending'));
      }
    } catch {
      // migration may not have run yet — silently skip
    }
  };

  // ── delivery actions ─────────────────────────────────────────────────────
  const handleAdminConfirm = async (id) => {
    if (!window.confirm('Confirm this delivery? The branch will be notified and can accept it.')) return;
    try {
      await api.post(`/deliveries/${id}/admin-confirm`);
      alert('Delivery confirmed! Branch has been notified.');
      fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming delivery');
    }
  };

  const handleBranchAccept = async (id) => {
    if (!window.confirm('Accept this delivery? Items will be added to your inventory.')) return;
    try {
      const response = await api.post(`/deliveries/${id}/accept`);
      alert(response.data.message || 'Delivery accepted! Items have been added to your inventory.');
      // Force a fresh fetch
      await fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error accepting delivery');
    }
  };

  const handleBranchAcceptWithBatchSelection = async (deliveryId) => {
    try {
      // Fetch available batches
      const response = await api.get(`/deliveries/${deliveryId}/available-batches`);
      const batchData = response.data;

      // Block if any item has zero stock in the warehouse
      const noStockItems = batchData.items.filter(item => item.available_batches.length === 0);
      if (noStockItems.length > 0) {
        const names = noStockItems.map(i => `  • ${i.description} (${i.unit})`).join('\n');
        alert(`Cannot accept delivery — the following items have no stock in the warehouse:\n${names}\n\nPlease contact your admin to update this delivery.`);
        return;
      }

      // Block if any item has insufficient total stock
      const shortItems = batchData.items.filter(item => {
        const totalAvail = item.available_batches.reduce((s, b) => s + parseFloat(b.quantity), 0);
        return totalAvail < parseFloat(item.requested_quantity);
      });
      if (shortItems.length > 0) {
        const details = shortItems.map(i => {
          const avail = i.available_batches.reduce((s, b) => s + parseFloat(b.quantity), 0);
          return `  • ${i.description} (${i.unit}): ${avail} available, ${i.requested_quantity} requested`;
        }).join('\n');
        alert(`Cannot accept delivery — insufficient stock:\n${details}\n\nPlease contact your admin.`);
        return;
      }

      // Check if any item has multiple batches (needs manual batch selection)
      const hasMultipleBatches = batchData.items.some(item => item.available_batches.length > 1);

      if (!hasMultipleBatches) {
        // All items have exactly one batch — accept directly via FIFO
        handleBranchAccept(deliveryId);
        return;
      }

      // At least one item has multiple batches — open batch selection modal
      const initialSelections = {};
      batchData.items.forEach(item => {
        // Pre-fill from the first batch, capped at what that batch actually has
        const firstBatch = item.available_batches[0];
        initialSelections[item.item_id] = [{
          batch_id: firstBatch.id,
          quantity: Math.min(parseFloat(item.requested_quantity), parseFloat(firstBatch.quantity))
        }];
      });

      setSelectedBatches(initialSelections);
      setBatchSelectionModal({ open: true, delivery: deliveryId, batches: batchData });
    } catch (error) {
      alert(error.response?.data?.error || 'Error loading batch information');
    }
  };

  const handleConfirmBatchSelection = async () => {
    try {
      // Build batch_selections array
      const batch_selections = Object.entries(selectedBatches).map(([item_id, selections]) => ({
        item_id: parseInt(item_id),
        batch_ids: selections.map(s => s.batch_id),
        quantities: selections.map(s => s.quantity)
      }));
      
      await api.post(`/deliveries/${batchSelectionModal.delivery}/accept`, {
        batch_selections
      });
      
      alert('Delivery accepted with selected batches!');
      setBatchSelectionModal({ open: false, delivery: null, batches: null });
      setSelectedBatches({});
      await fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error accepting delivery');
    }
  };

  const handleManagerConfirm = async (id) => {
    if (!window.confirm('Confirm this staff-accepted delivery? Items will be added to inventory.')) return;
    try {
      const response = await api.post(`/deliveries/${id}/manager-confirm`);
      alert(response.data.message || 'Delivery confirmed! Items have been added to inventory.');
      await fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming delivery');
    }
  };

  const handleRejectDelivery = async () => {
    if (!rejectDeliveryState.reason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    try {
      await api.post(`/deliveries/${rejectDeliveryState.id}/reject`, {
        rejection_reason: rejectDeliveryState.reason.trim()
      });
      alert('Delivery rejected successfully.');
      setRejectDeliveryState({ id: null, reason: '' });
      fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error rejecting delivery');
    }
  };

  // ── discrepancy actions ──────────────────────────────────────────────────
  const handleApprove = async (id) => {
    if (!window.confirm('Approve this request? Inventory will be automatically adjusted.')) return;
    try {
      const res = await api.put(`/delivery-discrepancies/${id}/approve`);
      alert(res.data.message);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Error approving request');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectState.note.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    try {
      await api.put(`/delivery-discrepancies/${rejectState.id}/reject`, {
        admin_note: rejectState.note.trim()
      });
      setRejectState({ id: null, note: '' });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Error rejecting request');
    }
  };

  const openIssueModal = (delivery, issueType) => {
    const hasItems = delivery.items?.length > 0 && delivery.items[0]?.description;
    if (!hasItems) {
      alert('No item data available for this delivery.');
      return;
    }
    setIssueMenuDeliveryId(null);
    setDiscModal({ open: true, type: issueType, delivery });
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const getStatusBadge = (status) => {
    const badges = {
      pending:         { color: '#9ca3af', icon: <FiClock size={12} />,       text: 'Pending' },
      awaiting_admin:  { color: '#f59e0b', icon: <FiClock size={12} />,       text: 'Awaiting Admin' },
      admin_confirmed: { color: '#3b82f6', icon: <FiCheck size={12} />,       text: 'Admin Confirmed' },
      in_transit:      { color: '#8b5cf6', icon: <FiTruck size={12} />,       text: 'Shipped' },
      pending_manager_confirmation: { color: '#f59e0b', icon: <FiClock size={12} />, text: 'Awaiting Manager' },
      delivered:       { color: '#10b981', icon: <FiCheckCircle size={12} />, text: 'Delivered' },
      cancelled:       { color: '#6b7280', icon: <FiAlertCircle size={12} />, text: 'Cancelled' },
      rejected:        { color: '#ef4444', icon: <FiX size={12} />,           text: 'Rejected' }
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className="badge" style={{
        backgroundColor: `${badge.color}20`, color: badge.color,
        display: 'inline-flex', alignItems: 'center', gap: '4px'
      }}>
        {badge.icon}{badge.text}
      </span>
    );
  };

  const getDiscStatusBadge = (status) => {
    const map = {
      pending:   { color: '#f59e0b', text: 'Pending Review' },
      approved:  { color: '#10b981', text: 'Approved' },
      rejected:  { color: '#ef4444', text: 'Rejected' },
      completed: { color: '#6b7280', text: 'Completed' }
    };
    const b = map[status] || map.pending;
    return (
      <span className="badge" style={{
        backgroundColor: `${b.color}20`, color: b.color,
        display: 'inline-flex', alignItems: 'center', gap: '4px'
      }}>
        {b.text}
      </span>
    );
  };

  const getDiscTypeBadge = (type) => {
    const map = {
      shortage: { bg: '#fef3c7', color: '#92400e', icon: <FiAlertTriangle size={11} />, label: 'Shortage' },
      return:   { bg: '#ede9fe', color: '#5b21b6', icon: <FiRefreshCw     size={11} />, label: 'Return'   },
      damage:   { bg: '#fee2e2', color: '#b91c1c', icon: <FiXCircle        size={11} />, label: 'Damage'   },
    };
    const b = map[type] || map.shortage;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: b.bg, color: b.color }}>
        {b.icon}{b.label}
      </span>
    );
  };

  const canReportIssue = (delivery) =>
    delivery.status === 'delivered' &&
    (user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'admin');

  const isBranch = user.role === 'branch_manager' || user.role === 'branch_staff';
  const isAdmin  = user.role === 'admin'; // only admins may see item/batch costs

  const [openReturnId, setOpenReturnId] = useState(null);

  // Returns all approved/completed return discrepancies for a delivery.
  // Standalone returns (no delivery_id) are matched by branch + warehouse + item description
  // because the "Request Return" form never links to a specific delivery.
  const getApprovedReturns = (delivery) =>
    discrepancies.filter(d => {
      if (d.type !== 'return') return false;
      if (d.status !== 'approved' && d.status !== 'completed') return false;
      if (d.delivery_id && d.delivery_id === delivery.id) return true;
      if (!d.delivery_id &&
          d.branch_location_id === delivery.to_location_id &&
          d.warehouse_location_id === delivery.from_location_id &&
          delivery.items?.some(item =>
            item.description?.toLowerCase().trim() === d.item_description?.toLowerCase().trim()
          )
      ) return true;
      return false;
    });

  // ── multi-item form helpers ──────────────────────────────────────────────
  const updateRequestItem = (i, patch) =>
    setRequestItems(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRequestItem = () => setRequestItems(rows => [...rows, blankRequestItem()]);
  const removeRequestItem = (i) =>
    setRequestItems(rows => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));
  const resetRequestForm = () => { setRequestItems([blankRequestItem()]); setRequestNotes(''); };

  const updateDeliveryItem = (i, patch) =>
    setDeliveryItems(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addDeliveryItem = () => setDeliveryItems(rows => [...rows, blankDeliveryItem()]);
  const removeDeliveryItem = (i) =>
    setDeliveryItems(rows => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));
  const resetDeliveryForm = () => {
    setDeliveryItems([blankDeliveryItem()]);
    setDeliveryNotes('');
    setDeliveryTo('');
    if (user.role !== 'warehouse') setDeliveryFrom('');
  };

  // ── filter deliveries ──────────────────────────────────────────────────
  const getFilteredDeliveries = (deliveryList) => {
    return deliveryList.filter(delivery => {
      // Product search
      if (filters.productSearch) {
        const searchLower = filters.productSearch.toLowerCase();
        const hasProduct = delivery.items?.some(item =>
          item.description?.toLowerCase().includes(searchLower)
        );
        if (!hasProduct) return false;
      }

      // From location
      if (filters.fromLocation && delivery.from_location_id !== parseInt(filters.fromLocation)) {
        return false;
      }

      // To location
      if (filters.toLocation && delivery.to_location_id !== parseInt(filters.toLocation)) {
        return false;
      }

      // Date range
      const deliveryDate = new Date(delivery.delivery_date || delivery.created_at);
      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        if (deliveryDate < startDate) return false;
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        if (deliveryDate > endDate) return false;
      }

      // Status
      if (filters.status && delivery.status !== filters.status) {
        return false;
      }

      return true;
    });
  };

  // ── export to XLSX ──────────────────────────────────────────────────────
  const handleDownloadXLSX = (deliveryList) => {
    const filtered = getFilteredDeliveries(deliveryList);
    
    if (filtered.length === 0) {
      alert('No deliveries to export');
      return;
    }

    // Flatten deliveries with items
    const rows = [];
    filtered.forEach(delivery => {
      if (delivery.items && delivery.items.length > 0) {
        delivery.items.forEach((item, idx) => {
          rows.push({
            'Delivery ID': delivery.id,
            'Date': new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString(),
            'From': delivery.from_location_name,
            'To': delivery.to_location_name,
            'Status': delivery.status,
            'Item': item.description,
            'Unit': item.unit,
            'Quantity': parseFloat(item.quantity),
            'Unit Cost': isAdmin ? parseFloat(item.unit_cost || 0) : '',
            'Total Cost': isAdmin ? (parseFloat(item.quantity) * parseFloat(item.unit_cost || 0)) : '',
            'Notes': delivery.notes || '',
            'Created By': delivery.created_by_name || ''
          });
        });
      } else {
        rows.push({
          'Delivery ID': delivery.id,
          'Date': new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString(),
          'From': delivery.from_location_name,
          'To': delivery.to_location_name,
          'Status': delivery.status,
          'Item': '',
          'Unit': '',
          'Quantity': '',
          'Unit Cost': '',
          'Total Cost': '',
          'Notes': delivery.notes || '',
          'Created By': delivery.created_by_name || ''
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Delivery ID
      { wch: 12 }, // Date
      { wch: 20 }, // From
      { wch: 20 }, // To
      { wch: 15 }, // Status
      { wch: 30 }, // Item
      { wch: 10 }, // Unit
      { wch: 10 }, // Quantity
      { wch: 12 }, // Unit Cost
      { wch: 12 }, // Total Cost
      { wch: 30 }, // Notes
      { wch: 20 }  // Created By
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Deliveries');
    
    const fileName = `Deliveries_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const clearFilters = () => {
    setFilters({
      productSearch: '',
      fromLocation: '',
      toLocation: '',
      startDate: '',
      endDate: '',
      status: ''
    });
  };

  return (
    <div className="container">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiTruck size={32} color="#2563eb" />
          <h2 style={{ margin: 0 }}>Warehouse Deliveries</h2>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* Branch: Request from Warehouse */}
          {(user.role === 'branch_manager' || user.role === 'branch_staff') && (
            <>
              <button
                className="btn btn-success"
                onClick={() => setShowRequestForm(!showRequestForm)}
              >
                <FiPackage size={16} />
                {showRequestForm ? 'Cancel' : 'Request from Warehouse'}
              </button>
              <button
                className="btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  backgroundColor: '#8b5cf6', color: '#fff', border: 'none'
                }}
                onClick={() => setDiscModal({ open: true, type: 'return', delivery: null })}
              >
                <FiRefreshCw size={14} />
                Request Return
              </button>
            </>
          )}

          {/* Warehouse/Admin: Create Delivery */}
          {(user.role === 'admin' || user.role === 'warehouse') && (
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateDelivery(!showCreateDelivery)}
            >
              <FiTruck size={16} />
              {showCreateDelivery ? 'Cancel' : 'New Delivery'}
            </button>
          )}
        </div>
      </div>

      {/* Info Alert */}
      <div className="alert alert-info" style={{ marginBottom: '24px' }}>
        <FiAlertCircle size={16} />
        <div>
          <strong>Warehouse Deliveries</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
            This page is for warehouse deliveries to branches. For branch-to-branch transfers, go to the <strong>Transfers</strong> page.
          </p>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button
            className="btn"
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f3f4f6', color: '#374151' }}
          >
            <FiFilter size={16} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {(filters.productSearch || filters.fromLocation || filters.toLocation || filters.startDate || filters.endDate || filters.status) && (
            <button
              className="btn btn-secondary"
              onClick={clearFilters}
              style={{ fontSize: '13px' }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {showFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="form-group">
              <label>Search Product</label>
              <input
                type="text"
                placeholder="Search by product name..."
                value={filters.productSearch}
                onChange={(e) => setFilters({ ...filters, productSearch: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>From Location</label>
              <select
                value={filters.fromLocation}
                onChange={(e) => setFilters({ ...filters, fromLocation: e.target.value })}
              >
                <option value="">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>To Location</label>
              <select
                value={filters.toLocation}
                onChange={(e) => setFilters({ ...filters, toLocation: e.target.value })}
              >
                <option value="">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="awaiting_admin">Awaiting Admin</option>
                <option value="admin_confirmed">Admin Confirmed</option>
                <option value="in_transit">In Transit</option>
                <option value="pending_manager_confirmation">Awaiting Manager</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Request from Warehouse Form (Branch) ──────────────────────────── */}
      {showRequestForm && (user.role === 'branch_manager' || user.role === 'branch_staff') && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #10b981' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '16px' }}>
            <FiPackage size={20} />
            Request from Warehouse
          </h3>
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>
            <FiInfo size={16} />
            Submit a request to the warehouse. They will review and create a delivery if approved.
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();

            if (requestItems.some(it => !it.description || !it.unit || !it.quantity)) {
              alert('Please fill in all required fields for every item');
              return;
            }

            try {
              const warehouse = locations.find(loc => loc.type === 'warehouse');
              if (!warehouse) {
                alert('No warehouse found. Please contact admin.');
                return;
              }

              await api.post('/deliveries', {
                from_location_id: warehouse.id,
                to_location_id: user.location_id,
                notes: requestNotes || null,
                // Cost is re-derived from warehouse inventory server-side;
                // branch users never see or enter it.
                items: requestItems.map(it => ({
                  description: it.description,
                  unit: it.unit,
                  quantity: parseFloat(it.quantity),
                  unit_cost: 0
                }))
              });
              alert('Request submitted to warehouse!');
              setShowRequestForm(false);
              resetRequestForm();
              fetchAll();
            } catch (error) {
              alert(error.response?.data?.error || 'Error submitting request');
            }
          }}>
            {requestItems.map((item, index) => (
              <div key={item.uid} style={{
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: '8px', padding: '12px', marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Item {index + 1}</strong>
                  {requestItems.length > 1 && (
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '2px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                      onClick={() => removeRequestItem(index)}
                    >
                      <FiX size={12} /> Remove
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="form-group">
                    <label>Item Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter item description"
                      value={item.description}
                      onChange={(e) => updateRequestItem(index, { description: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., PC, BOX, BOT"
                      value={item.unit}
                      onChange={(e) => updateRequestItem(index, { unit: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={item.quantity}
                      onChange={(e) => updateRequestItem(index, { quantity: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              style={{ marginBottom: '16px', background: '#ecfdf5', color: '#047857', border: '1px solid #6ee7b7' }}
              onClick={addRequestItem}
            >
              <FiPackage size={14} /> Add Item
            </button>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Notes (Optional)</label>
              <textarea
                rows="3"
                placeholder="Add any notes about this request..."
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
              ></textarea>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-success">
                <FiCheck size={16} />
                Submit Request
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowRequestForm(false);
                resetRequestForm();
              }}>
                <FiX size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── New Delivery Form (Warehouse/Admin) ──────────────────────────── */}
      {showCreateDelivery && (user.role === 'admin' || user.role === 'warehouse') && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #2563eb' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb', marginBottom: '16px' }}>
            <FiTruck size={20} />
            Create New Delivery
          </h3>
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>
            <FiInfo size={16} />
            Create a delivery from warehouse to branch. This will notify the branch when ready.
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();

            const fromId = deliveryFrom || (user.role === 'warehouse' ? user.location_id : '');
            if (!fromId || !deliveryTo) {
              alert('Please select both a warehouse and a branch');
              return;
            }
            // Every row needs an item, a quantity, a batch (when batches exist),
            // and — for admins only — a unit cost.
            if (deliveryItems.some(it =>
              !it.description || !it.unit || !it.quantity ||
              (it.costBatches.length > 0 && !it.cost_batch_id) ||
              (isAdmin && !it.unit_cost)
            )) {
              alert('Please fill in all required fields for every item');
              return;
            }

            try {
              await api.post('/deliveries', {
                from_location_id: parseInt(fromId),
                to_location_id: parseInt(deliveryTo),
                notes: deliveryNotes || null,
                items: deliveryItems.map(it => ({
                  description: it.description,
                  unit: it.unit,
                  quantity: parseFloat(it.quantity),
                  // Server re-derives unit_cost from inventory; this is a hint only.
                  unit_cost: parseFloat(it.unit_cost) || 0
                }))
              });
              alert('Delivery created successfully!');
              setShowCreateDelivery(false);
              resetDeliveryForm();
              fetchAll();
            } catch (error) {
              alert(error.response?.data?.error || 'Error creating delivery');
            }
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>From Warehouse *</label>
                <select
                  required
                  value={deliveryFrom}
                  disabled={user.role === 'warehouse'}
                  onChange={(e) => {
                    setDeliveryFrom(e.target.value);
                    // Items were searched against the old warehouse — reset them.
                    setDeliveryItems([blankDeliveryItem()]);
                  }}
                >
                  <option value="">Select warehouse</option>
                  {locations.filter(loc => loc.type === 'warehouse').map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>To Branch *</label>
                <select
                  required
                  value={deliveryTo}
                  onChange={(e) => setDeliveryTo(e.target.value)}
                >
                  <option value="">Select branch</option>
                  {locations.filter(loc => loc.type === 'branch').map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {deliveryItems.map((item, index) => (
              <div key={item.uid} style={{
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: '8px', padding: '12px', marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Item {index + 1}</strong>
                  {deliveryItems.length > 1 && (
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '2px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                      onClick={() => removeDeliveryItem(index)}
                    >
                      <FiX size={12} /> Remove
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label>Search Item *</label>
                  <AutocompleteSearch
                    placeholder="Search for product..."
                    locationId={user.role === 'warehouse' ? user.location_id : (deliveryFrom || undefined)}
                    onSelect={async (product) => {
                      const fromId = user.role === 'warehouse' ? user.location_id : deliveryFrom;
                      let availableQty = null;
                      let batches = [];
                      if (fromId) {
                        try {
                          // Sum across all batch rows — inventory keeps one row per
                          // cost batch and depleted batches stay as 0-qty rows.
                          const response = await api.get(`/inventory/location/${fromId}`);
                          availableQty = response.data
                            .filter(inv => inv.description === product.description && inv.unit === product.unit)
                            .reduce((sum, inv) => sum + parseFloat(inv.quantity || 0), 0);

                          const batchResponse = await api.get(`/inventory/cost-batches/${fromId}/${encodeURIComponent(product.description)}/${encodeURIComponent(product.unit)}`);
                          batches = batchResponse.data;
                        } catch (error) {
                          console.error('Error fetching inventory:', error);
                        }
                      }
                      updateDeliveryItem(index, {
                        description: product.description,
                        unit: product.unit,
                        unit_cost: product.unit_cost || '',
                        available_quantity: availableQty,
                        cost_batch_id: '',
                        costBatches: batches,
                        quantity: ''
                      });
                    }}
                  />
                  {item.description && (
                    <div style={{
                      marginTop: '8px', padding: '8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: 'var(--radius)', fontSize: '13px',
                      color: 'var(--primary)', border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}>
                      <div>Selected: <strong>{item.description}</strong> ({item.unit})</div>
                      {item.available_quantity !== null && (
                        <div style={{
                          marginTop: '4px', fontSize: '12px', fontWeight: 600,
                          color: item.available_quantity > 0 ? '#10b981' : '#ef4444'
                        }}>
                          Available in warehouse: {formatQuantity(item.available_quantity)} {item.unit}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {item.description && (
                  <>
                    {item.costBatches.length > 0 && (
                      <div className="form-group" style={{ marginTop: '12px' }}>
                        <label>Select Batch *</label>
                        <select
                          required
                          value={item.cost_batch_id}
                          onChange={(e) => {
                            const b = item.costBatches.find(cb => cb.cost_batch_id === e.target.value);
                            updateDeliveryItem(index, {
                              cost_batch_id: e.target.value,
                              unit_cost: b ? b.unit_cost : item.unit_cost,
                              quantity: ''
                            });
                          }}
                        >
                          <option value="">Select batch...</option>
                          {item.costBatches.map((batch, bi) => (
                            <option key={batch.cost_batch_id} value={batch.cost_batch_id}>
                              {[
                                batch.batch_number || `BATCH-${bi + 1}`,
                                `Qty: ${formatQuantity(batch.quantity)}`,
                                ...(isAdmin ? [`Cost: ₱${formatPrice(batch.unit_cost)}`] : []),
                                `Exp: ${batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}`
                              ].join(' - ')}
                            </option>
                          ))}
                        </select>
                        {item.cost_batch_id && (() => {
                          const b = item.costBatches.find(cb => cb.cost_batch_id === item.cost_batch_id);
                          return b ? (
                            <div style={{
                              marginTop: '8px', padding: '8px',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              borderRadius: 'var(--radius)', fontSize: '12px',
                              color: 'var(--primary)', border: '1px solid rgba(59, 130, 246, 0.2)'
                            }}>
                              <strong>Batch Details:</strong> {b.batch_number || 'N/A'} | Available: {formatQuantity(b.quantity)} {item.unit} | Expires: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'N/A'}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                      <div className="form-group">
                        <label>Quantity *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          max={(() => {
                            const b = item.costBatches.find(cb => cb.cost_batch_id === item.cost_batch_id);
                            if (b) return b.quantity;
                            return item.available_quantity || undefined;
                          })()}
                          placeholder={item.costBatches.length > 0 && !item.cost_batch_id ? 'Select batch first' : '0.00'}
                          value={item.quantity}
                          disabled={item.costBatches.length > 0 && !item.cost_batch_id}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value);
                            let maxQty = item.available_quantity;
                            const b = item.costBatches.find(cb => cb.cost_batch_id === item.cost_batch_id);
                            if (b) maxQty = parseFloat(b.quantity);
                            if (maxQty !== null && maxQty !== undefined && qty > maxQty) {
                              alert(`Cannot exceed available quantity: ${formatQuantity(maxQty)} ${item.unit}`);
                              return;
                            }
                            updateDeliveryItem(index, { quantity: e.target.value });
                          }}
                        />
                        {item.available_quantity === 0 && (
                          <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
                            ⚠️ No stock available in warehouse
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="form-group">
                          <label>Unit Cost *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            placeholder="0.00"
                            value={item.unit_cost}
                            disabled={item.costBatches.length > 0 && !item.cost_batch_id}
                            onChange={(e) => updateDeliveryItem(index, { unit_cost: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            <button
              type="button"
              className="btn"
              style={{ marginBottom: '16px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}
              onClick={addDeliveryItem}
            >
              <FiPackage size={14} /> Add Item
            </button>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Notes (Optional)</label>
              <textarea
                rows="3"
                placeholder="Add any notes about this delivery..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
              ></textarea>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                className="btn btn-success"
                disabled={deliveryItems.every(it => !it.description)}
              >
                <FiCheck size={16} />
                Create Delivery
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowCreateDelivery(false);
                resetDeliveryForm();
              }}>
                <FiX size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Admin/Manager: Awaiting Confirmation ─────────────────────────────────── */}
      {(user.role === 'admin' || user.role === 'branch_manager') && awaitingAdmin.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', margin: 0 }}>
              <FiClock size={20} />
              Deliveries Awaiting {user.role === 'admin' ? 'Your' : 'Manager'} Confirmation ({getFilteredDeliveries(awaitingAdmin).length})
            </h3>
            <button
              className="btn btn-success"
              onClick={() => handleDownloadXLSX(awaitingAdmin)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <FiDownload size={14} />
              Export XLSX
            </button>
          </div>
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <FiAlertCircle size={16} />
            These deliveries need {user.role === 'admin' ? 'your' : 'manager'} confirmation before branches can receive and accept them
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>From</th><th>To</th><th>Items</th>
                {user.role === 'admin' && <th>Total Value</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredDeliveries(awaitingAdmin).map((delivery) => (
                <tr key={delivery.id}>
                  <td>{new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}</td>
                  <td>{delivery.from_location_name}</td>
                  <td>{delivery.to_location_name}</td>
                  <td>
                    {delivery.items && delivery.items.length > 0 ? (
                      delivery.items.length <= 3 ? (
                        // Show items directly if 3 or fewer
                        <div>
                          {delivery.items.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '12px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                              <span style={{ fontWeight: 600, flex: 1 }}>{item.description}</span>
                              <span style={{ color: 'var(--text-secondary)', minWidth: '50px' }}>{item.unit}</span>
                              <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>{formatQuantity(item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Show count with View button if more than 3
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>
                            ({delivery.items.length}) items
                          </span>
                          <button
                            className="btn"
                            style={{ 
                              padding: '2px 8px', 
                              fontSize: '11px',
                              backgroundColor: '#3b82f6',
                              color: '#fff',
                              border: 'none'
                            }}
                            onClick={() => setViewItemsModal({ open: true, delivery })}
                          >
                            View
                          </button>
                        </div>
                      )
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No items</span>
                    )}
                  </td>
                  {user.role === 'admin' && (
                    <td style={{ fontWeight: 600 }}>₱{formatPrice(delivery.total_value)}</td>
                  )}
                  <td>
                    {rejectDeliveryState.id === delivery.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                        <textarea
                          rows={2}
                          placeholder="Rejection reason (required)"
                          value={rejectDeliveryState.reason}
                          onChange={e => setRejectDeliveryState(s => ({ ...s, reason: e.target.value }))}
                          style={{
                            width: '100%', padding: '6px 8px', fontSize: '12px',
                            border: '1px solid #d1d5db', borderRadius: '6px',
                            resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn"
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none' }}
                            onClick={handleRejectDelivery}
                          >
                            Confirm Reject
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => setRejectDeliveryState({ id: null, reason: '' })}
                          >
                            <FiX size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-success"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                          onClick={() => handleAdminConfirm(delivery.id)}
                        >
                          <FiCheck size={12} /> Confirm
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                          onClick={() => setRejectDeliveryState({ id: delivery.id, reason: '' })}
                        >
                          <FiX size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Admin: Pending Discrepancy / Return Requests ─────────────────── */}
      {user.role === 'admin' && pendingDiscs.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
            <FiAlertTriangle size={20} />
            Pending Discrepancy / Return Requests ({pendingDiscs.length})
          </h3>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px',
            padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#991b1b'
          }}>
            <FiInfo size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            Shortage: Adds missing qty to warehouse + corrects branch inventory. Damage: Removes damaged qty from branch. Return: Removes from branch, adds to warehouse.
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Branch</th>
                  <th>Expected</th>
                  <th>Received / Return Qty</th>
                  <th>To Adjust</th>
                  <th>Note</th>
                  <th>Reported</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDiscs.map((disc) => {
                  const adjQty = disc.type === 'shortage'
                    ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
                    : parseFloat(disc.received_quantity);

                  return (
                    <tr key={disc.id}>
                      <td>{getDiscTypeBadge(disc.type)}</td>
                      <td>
                        <strong style={{ fontSize: '13px' }}>{disc.item_description}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{disc.unit}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>{disc.branch_name || disc.warehouse_name}</td>
                      <td style={{ fontSize: '13px' }}>
                        {disc.type === 'shortage'
                          ? `${formatQuantity(disc.expected_quantity)} ${disc.unit}`
                          : '—'}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {formatQuantity(disc.received_quantity)} {disc.unit}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '14px' }}>
                          {formatQuantity(adjQty)} {disc.unit}
                        </span>
                      </td>
                      <td style={{ maxWidth: '180px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {disc.note}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(disc.reported_at).toLocaleDateString()}
                        <br />
                        <span style={{ fontSize: '11px' }}>{disc.reported_by_name}</span>
                      </td>
                      <td>
                        {rejectState.id === disc.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                            <textarea
                              rows={2}
                              placeholder="Rejection reason (required)"
                              value={rejectState.note}
                              onChange={e => setRejectState(s => ({ ...s, note: e.target.value }))}
                              style={{
                                width: '100%', padding: '6px 8px', fontSize: '12px',
                                border: '1px solid #d1d5db', borderRadius: '6px',
                                resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                              }}
                            />
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn"
                                style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none' }}
                                onClick={handleRejectSubmit}
                              >
                                Confirm Reject
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                onClick={() => setRejectState({ id: null, note: '' })}
                              >
                                <FiX size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                            <button
                              className="btn btn-success"
                              style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                              onClick={() => handleApprove(disc.id)}
                            >
                              <FiCheckCircle size={12} /> Approve
                            </button>
                            <button
                              className="btn"
                              style={{
                                padding: '4px 10px', fontSize: '12px',
                                background: '#fee2e2', color: '#b91c1c',
                                border: '1px solid #fca5a5', whiteSpace: 'nowrap'
                              }}
                              onClick={() => setRejectState({ id: disc.id, note: '' })}
                            >
                              <FiX size={12} /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Branch: Incoming Deliveries ──────────────────────────────────── */}
      {isBranch && incomingDeliveries.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #3b82f6', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', margin: 0 }}>
              <FiPackage size={20} />
              Incoming Deliveries ({getFilteredDeliveries(incomingDeliveries).length})
            </h3>
            <button
              className="btn btn-success"
              onClick={() => handleDownloadXLSX(incomingDeliveries)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <FiDownload size={14} />
              Export XLSX
            </button>
          </div>
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>
            <FiAlertCircle size={16} />
            These items are ready for delivery. Accept them to add to your inventory.
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>From</th><th>Items</th><th>Status</th>
                {(user.role === 'branch_manager' || user.role === 'branch_staff') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {getFilteredDeliveries(incomingDeliveries).map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    {new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      ID: {delivery.id}
                    </div>
                  </td>
                  <td>{delivery.from_location_name}</td>
                  <td>
                    {delivery.items && delivery.items.length > 0 ? (
                      delivery.items.length <= 3 ? (
                        // Show items directly if 3 or fewer
                        <div>
                          {delivery.items.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '12px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                              <span style={{ fontWeight: 600, flex: 1 }}>{item.description}</span>
                              <span style={{ color: 'var(--text-secondary)', minWidth: '50px' }}>{item.unit}</span>
                              <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>{formatQuantity(item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Show count with View button if more than 3
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>
                            ({delivery.items.length}) items
                          </span>
                          <button
                            className="btn"
                            style={{ 
                              padding: '2px 8px', 
                              fontSize: '11px',
                              backgroundColor: '#3b82f6',
                              color: '#fff',
                              border: 'none'
                            }}
                            onClick={() => setViewItemsModal({ open: true, delivery })}
                          >
                            View
                          </button>
                        </div>
                      )
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No items</span>
                    )}
                  </td>
                  <td>{getStatusBadge(delivery.status)}</td>
                  {(user.role === 'branch_manager' || user.role === 'branch_staff') && (
                    <td>
                      {delivery.status === 'pending_manager_confirmation' ? (
                        user.role === 'branch_manager' ? (
                          rejectDeliveryState.id === delivery.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                              <textarea
                                rows={2}
                                placeholder="Rejection reason (required)"
                                value={rejectDeliveryState.reason}
                                onChange={e => setRejectDeliveryState(s => ({ ...s, reason: e.target.value }))}
                                style={{
                                  width: '100%', padding: '6px 8px', fontSize: '12px',
                                  border: '1px solid #d1d5db', borderRadius: '6px',
                                  resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                                }}
                              />
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="btn"
                                  style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none' }}
                                  onClick={handleRejectDelivery}
                                >
                                  Confirm Reject
                                </button>
                                <button
                                  className="btn"
                                  style={{ padding: '4px 8px', fontSize: '12px' }}
                                  onClick={() => setRejectDeliveryState({ id: null, reason: '' })}
                                >
                                  <FiX size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn btn-success"
                                style={{ padding: '4px 12px', fontSize: '12px' }}
                                onClick={() => handleManagerConfirm(delivery.id)}
                              >
                                <FiCheckCircle size={12} /> Confirm
                              </button>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '4px 12px', fontSize: '12px' }}
                                onClick={() => setRejectDeliveryState({ id: delivery.id, reason: '' })}
                              >
                                <FiX size={12} /> Reject
                              </button>
                            </div>
                          )
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Awaiting manager confirmation
                          </span>
                        )
                      ) : (
                        rejectDeliveryState.id === delivery.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                            <textarea
                              rows={2}
                              placeholder="Rejection reason (required)"
                              value={rejectDeliveryState.reason}
                              onChange={e => setRejectDeliveryState(s => ({ ...s, reason: e.target.value }))}
                              style={{
                                width: '100%', padding: '6px 8px', fontSize: '12px',
                                border: '1px solid #d1d5db', borderRadius: '6px',
                                resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                              }}
                            />
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn"
                                style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none' }}
                                onClick={handleRejectDelivery}
                              >
                                Confirm Reject
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                onClick={() => setRejectDeliveryState({ id: null, reason: '' })}
                              >
                                <FiX size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-success"
                              style={{ padding: '4px 12px', fontSize: '12px' }}
                              onClick={() => handleBranchAcceptWithBatchSelection(delivery.id)}
                            >
                              <FiCheckCircle size={12} /> Accept
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 12px', fontSize: '12px' }}
                              onClick={() => setRejectDeliveryState({ id: delivery.id, reason: '' })}
                            >
                              <FiX size={12} /> Reject
                            </button>
                          </div>
                        )
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delivery History ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FiTruck size={20} />
            {user.role === 'warehouse' ? 'Outgoing Deliveries' : 'Delivery History'} ({getFilteredDeliveries(deliveries).length})
          </h3>
          {deliveries.length > 0 && (
            <button
              className="btn btn-success"
              onClick={() => handleDownloadXLSX(deliveries)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <FiDownload size={14} />
              Export XLSX
            </button>
          )}
        </div>

        {getFilteredDeliveries(deliveries).length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FiTruck /></div>
            <h3>No Deliveries Found</h3>
            <p>{deliveries.length === 0 ? 'Deliveries are automatically created when transfers are shipped' : 'No deliveries match your filters'}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Items</th>
                  {user.role === 'admin' && <th>Total Value</th>}
                  <th>Status</th>
                  <th>Created By</th>
                  {user.role === 'admin' && <th>Confirmed By</th>}
                  {(user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'admin') && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {getFilteredDeliveries(deliveries).map((delivery) => {
                  const approvedReturns = getApprovedReturns(delivery);
                  const isTransferOnly = !!delivery.is_transfer_only;
                  return (
                  <tr key={`${isTransferOnly ? 't' : 'd'}-${delivery.id}`} style={isTransferOnly ? { backgroundColor: 'rgba(16,185,129,0.04)' } : {}}>
                    <td>
                      {new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}
                      {isTransferOnly && (
                        <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
                          via Transfer
                        </div>
                      )}
                    </td>
                    <td>{delivery.from_location_name}</td>
                    <td>{delivery.to_location_name}</td>
                    <td>
                      {delivery.items && delivery.items.length > 0 ? (
                        delivery.items.length <= 3 ? (
                          // Show items directly if 3 or fewer
                          <div>
                            {delivery.items.map((item, idx) => (
                              <div key={idx} style={{ fontSize: '12px', marginBottom: '4px' }}>
                                <strong>{item.description}</strong> - {formatQuantity(item.quantity)} {item.unit}
                              </div>
                            ))}
                          </div>
                        ) : (
                          // Show count with View button if more than 3
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>
                              ({delivery.items.length}) items
                            </span>
                            <button
                              className="btn"
                              style={{ 
                                padding: '2px 8px', 
                                fontSize: '11px',
                                backgroundColor: '#3b82f6',
                                color: '#fff',
                                border: 'none'
                              }}
                              onClick={() => setViewItemsModal({ open: true, delivery })}
                            >
                              View
                            </button>
                          </div>
                        )
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No items</span>
                      )}
                    </td>
                    {user.role === 'admin' && (
                      <td style={{ fontWeight: 600 }}>₱{formatPrice(delivery.total_value)}</td>
                    )}
                    <td>
                      {approvedReturns.length > 0 ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <span
                            onClick={() => setOpenReturnId(openReturnId === delivery.id ? null : delivery.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              backgroundColor: '#fff7ed', color: '#ea580c',
                              padding: '2px 10px', borderRadius: '12px',
                              fontSize: '12px', fontWeight: 700,
                              cursor: 'pointer', border: '1px solid #fb923c',
                              userSelect: 'none'
                            }}
                          >
                            <FiRefreshCw size={12} /> Returned ({approvedReturns.length})
                          </span>
                          {openReturnId === delivery.id && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 200,
                              background: 'var(--bg-card, #fff)',
                              border: '1px solid #fb923c',
                              borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
                              minWidth: '240px', padding: '10px 12px', marginTop: '4px'
                            }}>
                              {approvedReturns.map((r, i) => (
                                <div key={r.id} style={{
                                  paddingBottom: i < approvedReturns.length - 1 ? '8px' : 0,
                                  marginBottom: i < approvedReturns.length - 1 ? '8px' : 0,
                                  borderBottom: i < approvedReturns.length - 1 ? '1px solid #fed7aa' : 'none'
                                }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#ea580c' }}>
                                    {r.item_description} — {formatQuantity(r.received_quantity)} {r.unit}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>
                                    Note: {r.note}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : getStatusBadge(delivery.status)}
                    </td>
                    <td>{delivery.created_by_name}</td>
                    {user.role === 'admin' && (
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {delivery.admin_confirmed_by_name || '-'}
                      </td>
                    )}
                    {(user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'admin') && (
                      <td>
                        {!isTransferOnly && canReportIssue(delivery) && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              className="btn"
                              style={{
                                padding: '4px 10px', fontSize: '12px',
                                background: '#fef3c7', color: '#92400e',
                                border: '1px solid #f59e0b',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                whiteSpace: 'nowrap'
                              }}
                              onClick={() => setIssueMenuDeliveryId(
                                issueMenuDeliveryId === delivery.id ? null : delivery.id
                              )}
                            >
                              <FiAlertTriangle size={11} /> Report Issue <FiChevronDown size={11} />
                            </button>
                            {issueMenuDeliveryId === delivery.id && (
                              <div style={{
                                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                                background: 'var(--bg-card, #fff)',
                                border: '1px solid var(--border-color, #e5e7eb)',
                                borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                minWidth: '170px', overflow: 'hidden', marginTop: '2px'
                              }}>
                                <button
                                  style={{
                                    width: '100%', padding: '10px 14px', textAlign: 'left',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '13px', fontWeight: 600, color: '#92400e',
                                    borderBottom: '1px solid var(--border-color, #f3f4f6)'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  onClick={() => openIssueModal(delivery, 'shortage')}
                                >
                                  <FiAlertTriangle size={13} /> Shortage
                                  <span style={{ fontSize: '11px', color: '#a16207', fontWeight: 400, marginLeft: 'auto' }}>received less</span>
                                </button>
                                <button
                                  style={{
                                    width: '100%', padding: '10px 14px', textAlign: 'left',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '13px', fontWeight: 600, color: '#b91c1c'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  onClick={() => openIssueModal(delivery, 'damage')}
                                >
                                  <FiXCircle size={13} /> Damaged Goods
                                  <span style={{ fontSize: '11px', color: '#991b1b', fontWeight: 400, marginLeft: 'auto' }}>write-off</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Shortage & Return History ─────────────────────────────────────── */}
      {discrepancies.length > 0 && (
        <div className="card">
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowDiscHistory(h => !h)}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <FiAlertTriangle size={20} color="#f59e0b" />
              Shortage &amp; Return History
              <span style={{
                background: '#f3f4f6', borderRadius: '12px',
                padding: '2px 8px', fontSize: '13px', fontWeight: 600, color: '#374151'
              }}>
                {discrepancies.length}
              </span>
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {showDiscHistory ? 'Hide ▲' : 'Show ▼'}
            </span>
          </div>

          {showDiscHistory && (
            <div style={{ marginTop: '16px', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    {user.role === 'admin' && <th>Branch</th>}
                    <th>Expected</th>
                    <th>Received / Return</th>
                    <th>Adjustment</th>
                    <th>Note</th>
                    <th>Status</th>
                    <th>Admin Note</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.map((disc) => {
                    const adjQty = disc.type === 'shortage'
                      ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
                      : parseFloat(disc.received_quantity);

                    return (
                      <tr key={disc.id}>
                        <td>{getDiscTypeBadge(disc.type)}</td>
                        <td>
                          <strong style={{ fontSize: '13px' }}>{disc.item_description}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{disc.unit}</div>
                        </td>
                        {user.role === 'admin' && (
                          <td style={{ fontSize: '13px' }}>{disc.branch_name || disc.warehouse_name}</td>
                        )}
                        <td style={{ fontSize: '13px' }}>
                          {disc.type === 'shortage'
                            ? `${formatQuantity(disc.expected_quantity)} ${disc.unit}`
                            : '—'}
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          {formatQuantity(disc.received_quantity)} {disc.unit}
                        </td>
                        <td style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>
                          {formatQuantity(adjQty)} {disc.unit}
                        </td>
                        <td style={{ maxWidth: '180px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {disc.note}
                        </td>
                        <td>{getDiscStatusBadge(disc.status)}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '160px' }}>
                          {disc.admin_note || '—'}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(disc.reported_at).toLocaleDateString()}
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

      {/* ── Discrepancy / Return Modal ───────────────────────────────────── */}
      {discModal.open && (
        <DiscrepancyModal
          type={discModal.type}
          delivery={discModal.delivery}
          onClose={() => setDiscModal({ open: false, type: null, delivery: null })}
          onSuccess={() => {
            setDiscModal({ open: false, type: null, delivery: null });
            const msgs = {
              shortage: 'Shortage report submitted! Admin will review shortly.',
              damage:   'Damage report submitted! Admin will review shortly.',
              return:   'Return request submitted! Admin will review shortly.'
            };
            alert(msgs[discModal.type] || 'Submitted! Admin will review shortly.');
            fetchAll();
          }}
        />
      )}

      {/* ── View Items Modal ──────────────────────────────────────────────── */}
      {viewItemsModal.open && viewItemsModal.delivery && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #fff)',
            borderRadius: '12px', padding: '24px',
            maxWidth: '800px', width: '90%', maxHeight: '80vh',
            overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiPackage size={20} />
                Delivery Items
              </h3>
              <button
                onClick={() => setViewItemsModal({ open: false, delivery: null })}
                style={{
                  background: 'none', border: 'none', fontSize: '24px',
                  cursor: 'pointer', color: 'var(--text-secondary)', padding: '0'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div>
                  <strong>From:</strong> {viewItemsModal.delivery.from_location_name}
                </div>
                <div>
                  <strong>To:</strong> {viewItemsModal.delivery.to_location_name}
                </div>
                <div>
                  <strong>Date:</strong> {new Date(viewItemsModal.delivery.delivery_date || viewItemsModal.delivery.created_at).toLocaleDateString()}
                </div>
                <div>
                  <strong>Status:</strong> {getStatusBadge(viewItemsModal.delivery.status)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Items ({viewItemsModal.delivery.items?.length || 0})
              </h4>
              <table style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Quantity</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Unit</th>
                    {user.role === 'admin' && (
                      <>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Unit Cost</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {viewItemsModal.delivery.items && viewItemsModal.delivery.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{item.description}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatQuantity(item.quantity)}</td>
                      <td style={{ padding: '8px' }}>{item.unit}</td>
                      {user.role === 'admin' && (
                        <>
                          <td style={{ padding: '8px', textAlign: 'right' }}>₱{formatPrice(item.unit_cost)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                            ₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.unit_cost))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {user.role === 'admin' && (
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 700 }}>
                      <td colSpan={user.role === 'admin' ? 5 : 3} style={{ padding: '8px', textAlign: 'right' }}>
                        Total:
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '16px' }}>
                        ₱{formatPrice(viewItemsModal.delivery.total_value)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setViewItemsModal({ open: false, delivery: null })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Batch Selection Modal ────────────────────────────────────────── */}
      {batchSelectionModal.open && batchSelectionModal.batches && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #fff)',
            borderRadius: '12px', padding: '24px',
            maxWidth: '900px', width: '95%', maxHeight: '85vh',
            overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiPackage size={20} />
                Select Batches to Receive
              </h3>
              <button
                onClick={() => {
                  setBatchSelectionModal({ open: false, delivery: null, batches: null });
                  setSelectedBatches({});
                }}
                style={{
                  background: 'none', border: 'none', fontSize: '24px',
                  cursor: 'pointer', color: 'var(--text-secondary)', padding: '0'
                }}
              >
                ×
              </button>
            </div>

            <div className="alert alert-info" style={{ marginBottom: '20px', fontSize: '13px' }}>
              <FiInfo size={16} />
              <div>
                <strong>Choose which batches to receive</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  Items with multiple batches allow you to select specific batches based on expiry dates or batch numbers.
                </p>
              </div>
            </div>

            {batchSelectionModal.batches.items.map((item, itemIdx) => {
              const itemSelections = selectedBatches[item.item_id] || [];
              const totalSelected = itemSelections.reduce((sum, sel) => sum + parseFloat(sel.quantity || 0), 0);
              const isComplete = Math.abs(totalSelected - parseFloat(item.requested_quantity)) < 0.01;

              return (
                <div key={item.item_id} style={{
                  border: '2px solid ' + (isComplete ? '#10b981' : '#f59e0b'),
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                  backgroundColor: isComplete ? '#f0fdf4' : '#fffbeb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>
                        {item.description} ({item.unit})
                      </h4>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Requested: {formatQuantity(item.requested_quantity)} {item.unit} • 
                        Selected: <strong style={{ color: isComplete ? '#10b981' : '#f59e0b' }}>
                          {formatQuantity(totalSelected)} {item.unit}
                        </strong>
                      </div>
                    </div>
                    {!isComplete && (
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: '#fef3c7',
                        color: '#92400e'
                      }}>
                        {totalSelected < item.requested_quantity ? 'Need more' : 'Too much'}
                      </span>
                    )}
                  </div>

                  {item.available_batches.length === 0 ? (
                    <div style={{ padding: '12px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#b91c1c', fontSize: '13px' }}>
                      ⚠️ No batches available for this item
                    </div>
                  ) : item.available_batches.length === 1 ? (
                    <div style={{ padding: '12px', backgroundColor: '#e0f2fe', borderRadius: '6px', fontSize: '13px' }}>
                      <strong>Single batch available:</strong> {formatQuantity(item.available_batches[0].quantity)} {item.unit}
                      {item.available_batches[0].batch_number && ` • Batch: ${item.available_batches[0].batch_number}`}
                      {item.available_batches[0].expiry_date && ` • Expires: ${new Date(item.available_batches[0].expiry_date).toLocaleDateString()}`}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                        Available Batches ({item.available_batches.length}):
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {item.available_batches.map((batch, batchIdx) => {
                          const isExpired = batch.expiry_status === 'EXPIRED';
                          const isExpiringSoon = batch.expiry_status === 'EXPIRING_SOON';
                          const selectedQty = itemSelections.find(s => s.batch_id === batch.id)?.quantity || 0;

                          return (
                            <div key={batch.id} style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto auto',
                              gap: '12px',
                              alignItems: 'center',
                              padding: '10px',
                              backgroundColor: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px'
                            }}>
                              <div style={{ fontSize: '12px' }}>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                  {batch.batch_number || `Batch ${batchIdx + 1}`}
                                  {isExpired && <span style={{ marginLeft: '8px', color: '#ef4444', fontSize: '11px' }}>⚠️ EXPIRED</span>}
                                  {isExpiringSoon && <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '11px' }}>⏰ Expiring Soon</span>}
                                </div>
                                <div style={{ color: 'var(--text-secondary)' }}>
                                  Available: {formatQuantity(batch.quantity)} {item.unit}
                                  {batch.expiry_date && ` • Exp: ${new Date(batch.expiry_date).toLocaleDateString()}`}
                                </div>
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={batch.quantity}
                                value={selectedQty}
                                onChange={(e) => {
                                  const qty = parseFloat(e.target.value) || 0;
                                  setSelectedBatches(prev => {
                                    const itemSels = prev[item.item_id] || [];
                                    const existingIdx = itemSels.findIndex(s => s.batch_id === batch.id);
                                    
                                    if (qty === 0) {
                                      // Remove this batch
                                      return {
                                        ...prev,
                                        [item.item_id]: itemSels.filter(s => s.batch_id !== batch.id)
                                      };
                                    } else if (existingIdx >= 0) {
                                      // Update existing
                                      const updated = [...itemSels];
                                      updated[existingIdx] = { batch_id: batch.id, quantity: qty };
                                      return { ...prev, [item.item_id]: updated };
                                    } else {
                                      // Add new
                                      return {
                                        ...prev,
                                        [item.item_id]: [...itemSels, { batch_id: batch.id, quantity: qty }]
                                      };
                                    }
                                  });
                                }}
                                style={{
                                  width: '100px',
                                  padding: '6px 8px',
                                  fontSize: '13px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px'
                                }}
                              />
                              <button
                                className="btn"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  backgroundColor: '#3b82f6',
                                  color: '#fff',
                                  border: 'none'
                                }}
                                onClick={() => {
                                  const remaining = parseFloat(item.requested_quantity) - totalSelected + parseFloat(selectedQty);
                                  const maxFromBatch = Math.min(parseFloat(batch.quantity), remaining);
                                  
                                  setSelectedBatches(prev => {
                                    const itemSels = prev[item.item_id] || [];
                                    const existingIdx = itemSels.findIndex(s => s.batch_id === batch.id);
                                    
                                    if (existingIdx >= 0) {
                                      const updated = [...itemSels];
                                      updated[existingIdx] = { batch_id: batch.id, quantity: maxFromBatch };
                                      return { ...prev, [item.item_id]: updated };
                                    } else {
                                      return {
                                        ...prev,
                                        [item.item_id]: [...itemSels, { batch_id: batch.id, quantity: maxFromBatch }]
                                      };
                                    }
                                  });
                                }}
                              >
                                Fill
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button
                className="btn btn-success"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: 600 }}
                onClick={handleConfirmBatchSelection}
                disabled={batchSelectionModal.batches.items.some(item => {
                  if (item.available_batches.length === 0) return false;
                  const itemSelections = selectedBatches[item.item_id] || [];
                  const totalSelected = itemSelections.reduce((sum, sel) => sum + parseFloat(sel.quantity || 0), 0);
                  return Math.abs(totalSelected - parseFloat(item.requested_quantity)) >= 0.01;
                })}
              >
                <FiCheckCircle size={16} /> Confirm & Accept Delivery
              </button>
              <button
                className="btn"
                style={{ padding: '12px 24px', fontSize: '14px' }}
                onClick={() => {
                  setBatchSelectionModal({ open: false, delivery: null, batches: null });
                  setSelectedBatches({});
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Deliveries;
