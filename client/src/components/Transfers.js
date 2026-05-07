import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import AutocompleteSearch from './AutocompleteSearch';
import CdrImportModal from './CdrImportModal';
import ExpressTransferModal from './ExpressTransferModal';
import { FiSend, FiPackage, FiAlertCircle, FiCheck, FiX, FiTruck, FiClock, FiCheckCircle, FiXCircle, FiTrash2, FiRefreshCw, FiDownload } from 'react-icons/fi';

function Transfers() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [costBatches, setCostBatches] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCdrImport, setShowCdrImport] = useState(false);
  const [showExpressTransfer, setShowExpressTransfer] = useState(false);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [selectedTransferGroup, setSelectedTransferGroup] = useState([]);
  const [rejectTransferId, setRejectTransferId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    from_location_id: '',
    to_location_id: '',
    notes: '',
    items: [{ inventory_item_id: '', cost_batch_id: '', quantity: '', selectedItem: null }]
  });
  const [requestFormData, setRequestFormData] = useState({
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    notes: ''
  });
  const [dateFilter, setDateFilter] = useState({
    startDate: '',
    endDate: ''
  });
  const [locationFilter, setLocationFilter] = useState({ from: '', to: '' });
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [historyTab, setHistoryTab] = useState('received');
  const [historyModalFilter, setHistoryModalFilter] = useState({ startDate: '', endDate: '', from: '', to: '' });
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportData, setExportData] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [openReturnId, setOpenReturnId] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchLocations();
    fetchDiscrepancies();
    if (user.role === 'admin' || user.role === 'branch_manager') {
      fetchPendingApprovals();
    }

    // Real-time updates every 5 seconds
    const interval = setInterval(() => {
      fetchTransfers();
      fetchDiscrepancies();
      if (user.role === 'admin' || user.role === 'branch_manager') {
        fetchPendingApprovals();
      }
    }, 5000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch transfers after locations are loaded
  useEffect(() => {
    if (locations.length > 0) {
      fetchTransfers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  useEffect(() => {
    if (formData.from_location_id) {
      fetchInventory(formData.from_location_id);
    } else {
      setInventory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.from_location_id]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      let availableLocations = response.data;
      
      // For branch managers, get their managed branches
      if (user.role === 'branch_manager') {
        try {
          const managerBranchesRes = await api.get(`/users/${user.id}/branches`);
          const managerBranchIds = managerBranchesRes.data.map(b => b.location_id);
          
          // Include primary location and managed branches
          const allManagerLocationIds = [...new Set([user.location_id, ...managerBranchIds])];
          availableLocations = response.data.filter(loc => allManagerLocationIds.includes(loc.id));
        } catch (error) {
          // Fallback to primary location if can't fetch managed branches
          availableLocations = response.data.filter(loc => loc.id === user.location_id);
        }
      }
      
      setLocations(availableLocations);
      
      if (user.location_id) {
        setFormData(prev => ({ ...prev, from_location_id: user.location_id }));
      }
    } catch (error) {
      // Error fetching locations
    }
  };

  const fetchInventory = async (locationId) => {
    try {
      setLoading(true);
      const response = await api.get(`/inventory/location/${locationId}`);
      setInventory(response.data);
    } catch (error) {
      // Error fetching inventory
    } finally {
      setLoading(false);
    }
  };

  const fetchTransfers = async () => {
    try {
      const response = await api.get('/transfers');
      // Filter based on user role
      let filteredTransfers = response.data;
      
      // Only filter if locations are loaded
      if (locations.length > 0) {
        if (user.role === 'warehouse') {
          // Warehouse: Show warehouse-to-warehouse transfers only
          filteredTransfers = response.data.filter(transfer => {
            const fromLoc = locations.find(loc => loc.id === transfer.from_location_id);
            const toLoc = locations.find(loc => loc.id === transfer.to_location_id);
            return fromLoc?.type === 'warehouse' && toLoc?.type === 'warehouse';
          });
        } else {
          // Admin, Manager, Staff: Show branch-to-branch transfers only
          filteredTransfers = response.data.filter(transfer => {
            const fromLoc = locations.find(loc => loc.id === transfer.from_location_id);
            const toLoc = locations.find(loc => loc.id === transfer.to_location_id);
            return fromLoc?.type === 'branch' && toLoc?.type === 'branch';
          });
        }
      }
      
      setTransfers(filteredTransfers);
    } catch (error) {
      // Set empty array on error to prevent crashes
      setTransfers([]);
      if (error.response?.status === 500) {
        const errorMsg = error.response?.data?.error || 'Unknown database error';
        console.error('Transfers fetch error:', errorMsg);
        console.error('Full error:', error.response?.data);
        alert(`Database error: ${errorMsg}\n\nPlease check the browser console and server logs for details.`);
      }
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      const response = await api.get('/transfers/pending');
      setPendingApprovals(response.data);
    } catch (error) {
      // Error fetching pending approvals
    }
  };

  const fetchDiscrepancies = async () => {
    try {
      const res = await api.get('/delivery-discrepancies');
      setDiscrepancies(res.data);
    } catch {
      // silently skip if migration not run yet
    }
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      // Find warehouse location
      const warehouse = locations.find(loc => loc.type === 'warehouse');
      if (!warehouse) {
        alert('No warehouse found. Please contact admin.');
        return;
      }

      await api.post('/transfers', {
        from_location_id: warehouse.id,
        to_location_id: user.location_id,
        description: requestFormData.description,
        unit: requestFormData.unit,
        quantity: requestFormData.quantity,
        unit_cost: requestFormData.unit_cost,
        notes: requestFormData.notes
      });
      
      setShowRequestForm(false);
      setRequestFormData({
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        notes: ''
      });
      fetchTransfers();
      alert('Request submitted to warehouse! Awaiting approval.');
    } catch (error) {
      alert(error.response?.data?.error || 'Error submitting request');
    } finally {
      setLoading(false);
    }
  };

  const handleItemSelect = async (index, itemId) => {
    const newItems = [...formData.items];
    newItems[index].inventory_item_id = itemId;
    
    if (itemId) {
      const item = inventory.find(inv => inv.id === parseInt(itemId));
      newItems[index].selectedItem = item;
      newItems[index].quantity = '';
      newItems[index].cost_batch_id = '';
      
      // Fetch cost batches for this item
      try {
        const response = await api.get(`/inventory/cost-batches/${formData.from_location_id}/${encodeURIComponent(item.description)}/${encodeURIComponent(item.unit)}`);
        setCostBatches(prev => ({
          ...prev,
          [`${item.description}-${item.unit}`]: response.data
        }));
      } catch (error) {
        console.error('Error fetching cost batches:', error);
      }
    } else {
      newItems[index].selectedItem = null;
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const handleBatchSelect = (index, batchId) => {
    const newItems = [...formData.items];
    newItems[index].cost_batch_id = batchId;
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { inventory_item_id: '', cost_batch_id: '', quantity: '', selectedItem: null }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItemQuantity = (index, quantity) => {
    const newItems = [...formData.items];
    newItems[index].quantity = quantity;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all items
    for (const item of formData.items) {
      if (!item.selectedItem) {
        alert('Please select an item for all rows');
        return;
      }
      if (!item.cost_batch_id) {
        alert('Please select a cost batch for all items');
        return;
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        alert('Please enter valid quantities for all items');
        return;
      }
      
      // Get the selected batch quantity
      const selectedBatch = costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`]?.find(
        b => b.cost_batch_id === item.cost_batch_id
      );
      
      if (!selectedBatch) {
        alert(`Cost batch not found for ${item.selectedItem.description}`);
        return;
      }
      
      if (parseFloat(item.quantity) > parseFloat(selectedBatch.quantity)) {
        alert(`Insufficient quantity for ${item.selectedItem.description}. Available in selected batch: ${selectedBatch.quantity}`);
        return;
      }
    }
    
    try {
      setLoading(true);
      
      // Create transfer for each item (skip individual notifications)
      const createdTransfers = [];
      for (let i = 0; i < formData.items.length; i++) {
        const item = formData.items[i];
        const response = await api.post('/transfers', {
          from_location_id: formData.from_location_id,
          to_location_id: formData.to_location_id,
          description: item.selectedItem.description,
          unit: item.selectedItem.unit,
          quantity: item.quantity,
          unit_cost: item.selectedItem.unit_cost,
          notes: formData.notes,
          skip_notification: true // Always skip individual notifications
        });
        createdTransfers.push(response.data);
      }
      
      // Send ONE batch notification after all transfers created
      if (createdTransfers.length > 0 && createdTransfers[0].status === 'pending') {
        await api.post('/transfers/batch-notify', {
          transfer_ids: createdTransfers.map(t => t.id),
          item_count: createdTransfers.length,
          to_location_id: formData.to_location_id
        });
      }
      
      setShowForm(false);
      setFormData({
        from_location_id: user.location_id || '',
        to_location_id: '',
        notes: '',
        items: [{ inventory_item_id: '', quantity: '', selectedItem: null }]
      });
      fetchTransfers();
      if (user.role === 'admin' || user.role === 'warehouse') {
        fetchPendingApprovals();
      }
      alert(formData.items.length > 1
        ? `Successfully created ${formData.items.length} transfers!`
        : user.role === 'branch_staff'
          ? 'Transfer request submitted! Awaiting manager approval.'
          : user.role === 'branch_manager'
            ? 'Transfer request submitted! Awaiting approval from warehouse.'
            : 'Transfer created successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error creating transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this transfer request?')) return;
    try {
      await api.post(`/transfers/${id}/approve`);
      await fetchTransfers();
      await fetchPendingApprovals();
      alert('Transfer approved successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error approving transfer');
    }
  };

  const handleReject = async (id) => {
    setRejectTransferId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectTransferId) return;
    
    try {
      await api.post(`/transfers/${rejectTransferId}/reject`, { 
        rejection_reason: rejectionReason.trim() || null 
      });
      await fetchTransfers();
      await fetchPendingApprovals();
      setShowRejectModal(false);
      setRejectTransferId(null);
      setRejectionReason('');
      alert('Transfer rejected');
    } catch (error) {
      alert(error.response?.data?.error || 'Error rejecting transfer');
    }
  };

  const handleDeliver = async (id) => {
    if (!window.confirm('Confirm that you have received this transfer? Inventory will be added to your location.')) return;
    try {
      await api.post(`/transfers/${id}/deliver`);
      await fetchTransfers();
      alert('Transfer received! Inventory has been added to your location.');
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Error confirming receipt';
      if (errorMsg.includes('Deliveries page')) {
        alert(errorMsg + '\n\nPlease go to the Deliveries page to accept this transfer.');
      } else {
        alert(errorMsg);
      }
    }
  };

  const handleUnreceive = async (id) => {
    if (!window.confirm('Are you sure you want to unreceive this transfer? This will remove the inventory from the destination and return it to the source location.')) return;
    try {
      await api.post(`/transfers/${id}/unreceive`);
      await fetchTransfers();
      alert('Transfer unreceived! Inventory has been returned to the source location.');
    } catch (error) {
      alert(error.response?.data?.error || 'Error unreceiving transfer');
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this transfer?')) return;
    try {
      await api.post(`/transfers/${id}/cancel`);
      fetchTransfers();
      if (user.role === 'admin' || user.role === 'warehouse') {
        fetchPendingApprovals();
      }
      alert('Transfer cancelled');
    } catch (error) {
      alert(error.response?.data?.error || 'Error cancelling transfer');
    }
  };

  const getApprovedReturnsForTransfer = (transfer) =>
    discrepancies.filter(d => {
      if (d.type !== 'return') return false;
      if (d.status !== 'approved' && d.status !== 'completed') return false;
      if (d.branch_location_id !== transfer.to_location_id) return false;
      if (d.warehouse_location_id !== transfer.from_location_id) return false;
      // Match by item description when available
      if (transfer.description && d.item_description) {
        return d.item_description.toLowerCase().trim() === transfer.description.toLowerCase().trim();
      }
      return true;
    });

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: '#f59e0b', icon: <FiClock size={12} />, text: 'Pending' },
      approved: { color: '#3b82f6', icon: <FiCheck size={12} />, text: 'Approved' },
      in_transit: { color: '#8b5cf6', icon: <FiTruck size={12} />, text: 'In Transit' },
      delivered: { color: '#10b981', icon: <FiCheckCircle size={12} />, text: 'Completed' },
      rejected: { color: '#ef4444', icon: <FiXCircle size={12} />, text: 'Rejected' },
      cancelled: { color: '#6b7280', icon: <FiX size={12} />, text: 'Cancelled' }
    };
    
    const badge = badges[status] || badges.pending;
    
    return (
      <span className="badge" style={{ 
        backgroundColor: `${badge.color}20`, 
        color: badge.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  const canApprove = (transfer) => {
    if (transfer.status !== 'pending') return false;
    if (user.role === 'admin') return true;
    // Managers can approve transfers from their managed branches
    if (user.role === 'branch_manager') {
      // For staff transfers requiring manager approval
      if (transfer.requires_manager_approval && !transfer.manager_approved_by) {
        return true; // Backend will check if manager has access to the branch
      }
      // For regular transfers from managed branches
      return true; // Backend will check if manager has access to the branch
    }
    return false;
  };

  const canDeliver = (transfer) => {
    // Staff, Managers, and Admin can receive transfers to their location
    // Transfer must be approved (not in_transit anymore - simplified workflow)
    if (transfer.status !== 'approved') return false;
    
    if (user.role === 'admin') return true;
    
    if (user.role === 'branch_manager') {
      // Check if this transfer is going to one of manager's branches
      const managerLocationIds = locations.map(loc => loc.id);
      return managerLocationIds.includes(transfer.to_location_id);
    }
    
    if (user.role === 'branch_staff') {
      // Staff can receive transfers to their own branch
      return transfer.to_location_id === user.location_id;
    }
    
    return false;
  };

  const canUnreceive = (transfer) => {
    return user.role === 'admin' && transfer.status === 'delivered';
  };

  // Group transfers by notes and date for multi-item transfers
  const groupTransfers = (transfers) => {
    const groups = {};
    const ungrouped = [];

    transfers.forEach(transfer => {
      // Group by notes and date if notes exist and contain "CDR Import" or multiple items with same notes/date
      const groupKey = transfer.notes && transfer.notes.includes('CDR Import') 
        ? `${transfer.notes}-${new Date(transfer.transfer_date).toDateString()}`
        : null;

      if (groupKey) {
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(transfer);
      } else {
        ungrouped.push(transfer);
      }
    });

    // Convert groups to array format and filter out single-item groups
    const groupedTransfers = Object.entries(groups)
      .filter(([key, items]) => items.length > 1) // Only show groups with multiple items
      .map(([key, items]) => ({
        isGroup: true,
        groupKey: key,
        items: items,
        // Use first item's data for display
        id: `group-${key}`,
        transfer_date: items[0].transfer_date,
        status: items[0].status,
        from_location_name: items[0].from_location_name,
        to_location_name: items[0].to_location_name,
        transferred_by_name: items[0].transferred_by_name,
        notes: items[0].notes,
        // Calculate totals
        totalItems: items.length,
        totalValue: items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_cost)), 0)
      }));

    // Add single items from groups that were filtered out
    Object.entries(groups)
      .filter(([key, items]) => items.length === 1)
      .forEach(([key, items]) => {
        ungrouped.push(items[0]);
      });

    return [...groupedTransfers, ...ungrouped];
  };

  const handleViewItems = (transfer) => {
    // For batch transfers, fetch the transfer_items
    if (transfer.description && transfer.description.includes('Batch Transfer')) {
      fetchTransferItems(transfer.id);
    } else if (transfer.isGroup) {
      // For grouped transfers
      setSelectedTransferGroup(transfer.items);
      setShowItemsModal(true);
    }
  };

  const fetchTransferItems = async (transferId) => {
    try {
      setLoading(true);
      const response = await api.get(`/transfers/${transferId}/items`);
      setSelectedTransferGroup(response.data);
      setShowItemsModal(true);
    } catch (error) {
      alert('Error loading transfer items: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const canCancel = (transfer) => {
    // Admin can cancel any status except already cancelled or rejected
    return user.role === 'admin' && 
           transfer.status !== 'cancelled' && 
           transfer.status !== 'rejected';
  };

  const canDelete = (transfer) => {
    return user.role === 'admin' && 
           (transfer.status === 'cancelled' || transfer.status === 'rejected');
  };

  const canUndoCancel = (transfer) => {
    return user.role === 'admin' && transfer.status === 'cancelled';
  };

  const handleDelete = async (id) => {
    if (!window.confirm('⚠️ Permanently delete this transfer? This action cannot be undone.')) return;
    try {
      await api.delete(`/transfers/${id}`);
      await fetchTransfers();
      alert('Transfer deleted successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting transfer');
    }
  };

  const handleUndoCancel = async (id) => {
    if (!window.confirm('Restore this cancelled transfer back to In Transit status?')) return;
    try {
      await api.post(`/transfers/${id}/undo-cancel`);
      await fetchTransfers();
      alert('Transfer restored to In Transit status');
    } catch (error) {
      alert(error.response?.data?.error || 'Error restoring transfer');
    }
  };

  const getFilteredTransfers = () => {
    let filtered = transfers.filter(transfer => {
      // For admin and managers, exclude pending transfers from history (they go in Pending Approvals section)
      if ((user.role === 'admin' || user.role === 'branch_manager') && transfer.status === 'pending') {
        return false;
      }
      
      // For branch managers, only show transfers involving their managed branches
      if (user.role === 'branch_manager') {
        const managerLocationIds = locations.map(loc => loc.id);
        const isFromManagerBranch = managerLocationIds.includes(transfer.from_location_id);
        const isToManagerBranch = managerLocationIds.includes(transfer.to_location_id);
        
        // Show transfer if either from or to location is one of manager's branches
        if (!isFromManagerBranch && !isToManagerBranch) {
          return false;
        }
      }
      
      return true;
    });

    // Apply date filters
    if (dateFilter.startDate) {
      filtered = filtered.filter(t => new Date(t.transfer_date) >= new Date(dateFilter.startDate));
    }
    if (dateFilter.endDate) {
      filtered = filtered.filter(t => new Date(t.transfer_date) <= new Date(dateFilter.endDate + 'T23:59:59'));
    }

    // Apply from/to location filters
    if (locationFilter.from) {
      filtered = filtered.filter(t => String(t.from_location_id) === String(locationFilter.from));
    }
    if (locationFilter.to) {
      filtered = filtered.filter(t => String(t.to_location_id) === String(locationFilter.to));
    }

    return filtered;
  };

  const handleExportPreview = () => {
    const filtered = getFilteredTransfers();
    const data = [];

    filtered.forEach(transfer => {
      if (transfer.isGroup) {
        // For grouped transfers, add each item
        transfer.items.forEach(item => {
          data.push({
            date: new Date(item.transfer_date).toLocaleDateString(),
            status: item.status,
            from: item.from_location_name,
            to: item.to_location_name,
            item: item.description,
            quantity: `${formatQuantity(item.quantity)} ${item.unit}`,
            value: user.role === 'admin' ? formatPrice(parseFloat(item.quantity) * parseFloat(item.unit_cost)) : 'N/A',
            requestedBy: item.transferred_by_name,
            notes: item.notes || ''
          });
        });
      } else {
        data.push({
          date: new Date(transfer.transfer_date).toLocaleDateString(),
          status: transfer.status,
          from: transfer.from_location_name,
          to: transfer.to_location_name,
          item: transfer.description || 'Multiple Items',
          quantity: transfer.description && transfer.description.includes('Batch Transfer') ? '—' : `${formatQuantity(transfer.quantity)} ${transfer.unit}`,
          value: user.role === 'admin' ? formatPrice(parseFloat(transfer.quantity || 0) * parseFloat(transfer.unit_cost || 0)) : 'N/A',
          requestedBy: transfer.transferred_by_name,
          notes: transfer.notes || ''
        });
      }
    });

    setExportData(data);
    setShowExportPreview(true);
  };

  const handleDownloadCSV = () => {
    const headers = user.role === 'admin' 
      ? ['Date', 'Status', 'From', 'To', 'Item', 'Quantity', 'Value', 'Requested By', 'Notes']
      : ['Date', 'Status', 'From', 'To', 'Item', 'Quantity', 'Requested By', 'Notes'];
    
    const rows = exportData.map(row => 
      user.role === 'admin'
        ? [row.date, row.status, row.from, row.to, row.item, row.quantity, row.value, row.requestedBy, row.notes]
        : [row.date, row.status, row.from, row.to, row.item, row.quantity, row.requestedBy, row.notes]
    );
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transfers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadXLSX = () => {
    // Create a simple HTML table that Excel can open
    const headers = user.role === 'admin' 
      ? ['Date', 'Status', 'From', 'To', 'Item', 'Quantity', 'Value', 'Requested By', 'Notes']
      : ['Date', 'Status', 'From', 'To', 'Item', 'Quantity', 'Requested By', 'Notes'];
    
    const rows = exportData.map(row => 
      user.role === 'admin'
        ? [row.date, row.status, row.from, row.to, row.item, row.quantity, row.value, row.requestedBy, row.notes]
        : [row.date, row.status, row.from, row.to, row.item, row.quantity, row.requestedBy, row.notes]
    );
    
    let html = '<table><thead><tr>';
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => html += `<td>${cell}</td>`);
      html += '</tr>';
    });
    html += '</tbody></table>';
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transfers_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getHistoryModalRows = () => {
    const applyFilter = (list) => list.filter(t => {
      if (historyModalFilter.startDate && new Date(t.transfer_date) < new Date(historyModalFilter.startDate)) return false;
      if (historyModalFilter.endDate && new Date(t.transfer_date) > new Date(historyModalFilter.endDate + 'T23:59:59')) return false;
      if (historyModalFilter.from && String(t.from_location_id) !== String(historyModalFilter.from)) return false;
      if (historyModalFilter.to && String(t.to_location_id) !== String(historyModalFilter.to)) return false;
      return true;
    });
    const delivered = transfers.filter(t => t.status === 'delivered');
    if (historyTab === 'received') {
      return applyFilter(delivered.filter(t => {
        if (user.role === 'warehouse') return false;
        if (user.role === 'branch_manager') return String(t.to_location_id) === String(user.location_id);
        return true;
      }));
    }
    return applyFilter(delivered.filter(t => {
      if (user.role === 'warehouse') return String(t.from_location_id) === String(user.location_id);
      if (user.role === 'branch_manager') return String(t.from_location_id) === String(user.location_id);
      return true;
    }));
  };

  const downloadHistoryFile = (format) => {
    const rows = getHistoryModalRows();
    const tabLabel = historyTab === 'received' ? 'received' : 'transferred_out';
    const headers = ['Date', 'Item', 'Unit', 'Qty', 'From', 'To', 'By'];
    const data = rows.map(t => [
      new Date(t.transfer_date).toLocaleDateString(),
      t.description || 'Multiple Items',
      t.unit || '',
      t.quantity ? formatQuantity(t.quantity) : '—',
      t.from_location_name || '—',
      t.to_location_name || '—',
      t.transferred_by_name || '—'
    ]);
    const filename = `transfer_history_${tabLabel}_${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') {
      const csv = [headers, ...data].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click();
      window.URL.revokeObjectURL(url);
    } else {
      let html = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
      data.forEach(r => { html += '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>'; });
      html += '</tbody></table>';
      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename + '.xls'; a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiSend size={32} color="#2563eb" />
          <h2 style={{ margin: 0 }}>
            {user.role === 'warehouse' ? 'Warehouse-to-Warehouse Transfers' : 'Branch-to-Branch Transfers'}
          </h2>
        </div>
      </div>

      {/* Info Alert */}
      <div className="alert alert-info" style={{ marginBottom: '24px' }}>
        <FiAlertCircle size={16} />
        <div>
          <strong>{user.role === 'warehouse' ? 'Warehouse-to-Warehouse Transfers' : 'Branch-to-Branch Transfers Only'}</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
            {user.role === 'warehouse' 
              ? 'This page is for transfers between warehouse locations. For deliveries to branches, go to the Deliveries page.'
              : 'This page is for transfers between branches. For warehouse deliveries, go to the Deliveries page.'
            }
          </p>
        </div>
      </div>

      {/* Pending Approvals Section */}
      {(user.role === 'admin' || user.role === 'branch_manager') && pendingApprovals.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
            <FiClock size={20} />
            Pending Approvals ({pendingApprovals.length})
          </h3>
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <FiAlertCircle size={16} />
            These transfer requests need your approval
          </div>
          <table>
            <thead>
              <tr>
                <th>Requested By</th>
                <th>From</th>
                <th>To</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map((transfer) => (
                <tr key={transfer.id}>
                  <td>{transfer.transferred_by_name}</td>
                  <td>{transfer.from_location_name}</td>
                  <td>{transfer.to_location_name}</td>
                  <td style={{ fontWeight: 600 }}>{transfer.description}</td>
                  <td>{formatQuantity(transfer.quantity)} {transfer.unit}</td>
                  <td>₱{formatPrice(parseFloat(transfer.quantity) * parseFloat(transfer.unit_cost))}</td>
                  <td>
                    {transfer.requires_manager_approval && transfer.manager_approved_by ? (
                      <span className="badge badge-success" style={{ fontSize: '11px' }}>
                        ✓ Manager Approved
                      </span>
                    ) : transfer.requires_manager_approval ? (
                      <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                        Awaiting Manager
                      </span>
                    ) : (
                      <span className="badge badge-info" style={{ fontSize: '11px' }}>
                        Ready for Admin
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {canApprove(transfer) && (
                        <button
                          className="btn btn-success"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                          onClick={() => handleApprove(transfer.id)}
                        >
                          <FiCheck size={12} />
                          Approve
                        </button>
                      )}
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleReject(transfer.id)}
                      >
                        <FiX size={12} />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiPackage size={20} />
            {user.role === 'branch_manager' ? 'Transfer Requests' : 'Transfer History'}
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {(user.role === 'admin' || user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'warehouse') && (
              <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); }}>
                <FiSend size={16} />
                {showForm ? 'Cancel' : (user.role === 'branch_staff' ? 'Request Transfer' : 'New Transfer')}
              </button>
            )}
            <button className="btn btn-success" onClick={handleExportPreview}>
              <FiPackage size={16} />
              Download
            </button>
            <button className="btn" style={{ backgroundColor: '#0891b2', color: 'white' }} onClick={() => { setHistoryModalFilter({ startDate: '', endDate: '', from: '', to: '' }); setShowTransferHistoryModal(true); }}>
              <FiClock size={16} />
              History
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          marginBottom: '20px',
          padding: '16px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Start Date</label>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter({...dateFilter, startDate: e.target.value})}
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>End Date</label>
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter({...dateFilter, endDate: e.target.value})}
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>From Location</label>
              <select
                value={locationFilter.from}
                onChange={(e) => setLocationFilter({ ...locationFilter, from: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="">All</option>
                {locations
                  .filter(loc =>
                    user.role === 'admin' ||
                    user.role === 'branch_manager' ||
                    loc.id === user.location_id
                  )
                  .map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>To Location</label>
              <select
                value={locationFilter.to}
                onChange={(e) => setLocationFilter({ ...locationFilter, to: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="">All</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => { setDateFilter({ startDate: '', endDate: '' }); setLocationFilter({ from: '', to: '' }); }}
              style={{ height: 'fit-content' }}
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Request from Warehouse Form (Branch Managers Only) */}
        {showRequestForm && user.role === 'branch_manager' && (
          <form onSubmit={handleRequestSubmit} style={{ marginBottom: '20px', padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '2px solid var(--primary)' }}>
            <h4 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
              <FiPackage size={18} />
              Request Item from Warehouse
            </h4>
            
            <div className="alert alert-info" style={{ marginBottom: '16px' }}>
              <FiAlertCircle size={16} />
              Search for items from inventory history to request from warehouse.
            </div>

            <div className="form-group">
              <label>Search Item *</label>
              <AutocompleteSearch
                placeholder="Search for product to request..."
                onSelect={(item) => {
                  setRequestFormData({
                    ...requestFormData,
                    description: item.description,
                    unit: item.unit
                  });
                }}
              />
            </div>

            {requestFormData.description && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="form-group">
                    <label>Description</label>
                    <input
                      type="text"
                      value={requestFormData.description}
                      disabled
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      value={requestFormData.unit}
                      disabled
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Quantity Needed *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={requestFormData.quantity}
                      onChange={(e) => setRequestFormData({ ...requestFormData, quantity: e.target.value })}
                      required
                      min="0.01"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <textarea
                    value={requestFormData.notes}
                    onChange={(e) => setRequestFormData({ ...requestFormData, notes: e.target.value })}
                    rows="3"
                    placeholder="Add any special instructions or notes..."
                  />
                </div>

                <button type="submit" className="btn btn-success" disabled={loading}>
                  <FiPackage size={16} />
                  {loading ? 'Submitting...' : 'Submit Request to Warehouse'}
                </button>
              </>
            )}
          </form>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)' }}>
            <h4 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiSend size={18} />
              {(user.role === 'branch_manager' || user.role === 'branch_staff') ? 'Request Transfer' : 'Create Transfer'}
            </h4>
            
            <div className="form-group">
              <label>From Location (Source {user.role === 'warehouse' ? 'Warehouse' : 'Branch'})</label>
              <select
                value={formData.from_location_id}
                onChange={(e) => setFormData({ ...formData, from_location_id: e.target.value, items: [{ inventory_item_id: '', quantity: '', selectedItem: null }] })}
                disabled={user.role !== 'admin' && user.location_id}
                required
              >
                <option value="">Select source {user.role === 'warehouse' ? 'warehouse' : 'branch'}</option>
                {locations
                  .filter(loc => user.role === 'warehouse' ? loc.type === 'warehouse' : loc.type === 'branch')
                  .filter(loc =>
                    user.role === 'admin' ||
                    user.role === 'branch_manager' ||
                    user.role === 'warehouse' ||
                    loc.id === user.location_id
                  )
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>To Location (Destination {user.role === 'warehouse' ? 'Warehouse' : 'Branch'})</label>
              <select
                value={formData.to_location_id}
                onChange={(e) => setFormData({ ...formData, to_location_id: e.target.value })}
                required
              >
                <option value="">Select destination {user.role === 'warehouse' ? 'warehouse' : 'branch'}</option>
                {locations
                  .filter(loc => user.role === 'warehouse' ? loc.type === 'warehouse' : loc.type === 'branch')
                  .filter(loc => loc.id !== parseInt(formData.from_location_id))
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
            </div>

            {formData.from_location_id && (
              <>
                {loading ? (
                  <div className="spinner" style={{ width: '24px', height: '24px', margin: '20px 0' }}></div>
                ) : inventory.length === 0 ? (
                  <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
                    <FiAlertCircle size={16} />
                    No inventory items available at this location
                  </div>
                ) : (
                  <>
                    <h5 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiPackage size={16} />
                      Items to Transfer
                    </h5>
                    
                    {formData.items.map((item, index) => (
                      <div key={index} style={{ 
                        padding: '16px', 
                        backgroundColor: item.selectedItem?.is_new_item ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-secondary)', 
                        borderRadius: 'var(--radius)', 
                        marginBottom: '12px',
                        border: item.selectedItem?.is_new_item ? '2px solid #f59e0b' : '1px solid var(--border)'
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Search Item</label>
                            <AutocompleteSearch
                              locationId={formData.from_location_id}
                              placeholder="Search for product..."
                              onSelect={(invItem) => handleItemSelect(index, invItem.id.toString())}
                            />
                            {item.selectedItem && (
                              <div style={{ 
                                marginTop: '8px', 
                                padding: '8px', 
                                backgroundColor: item.selectedItem.is_new_item ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.1)', 
                                borderRadius: 'var(--radius)',
                                fontSize: '13px',
                                color: item.selectedItem.is_new_item ? '#d97706' : 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                border: item.selectedItem.is_new_item ? '2px solid #f59e0b' : '1px solid rgba(59, 130, 246, 0.2)'
                              }}>
                                <span>Selected: {item.selectedItem.description}</span>
                                {item.selectedItem.is_new_item && (
                                  <span style={{ 
                                    fontSize: '9px', 
                                    background: 'var(--warning)', 
                                    color: 'white', 
                                    padding: '1px 4px', 
                                    borderRadius: '8px',
                                    fontWeight: '700'
                                  }}>
                                    NEW
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Batch Selection */}
                          {item.selectedItem && costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`] && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Batch</label>
                              <select
                                value={item.cost_batch_id}
                                onChange={(e) => handleBatchSelect(index, e.target.value)}
                                required
                              >
                                <option value="">Select batch...</option>
                                {costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`].map((batch, batchIndex) => (
                                  <option key={batch.cost_batch_id} value={batch.cost_batch_id}>
                                    {batch.batch_number || `BATCH-${batchIndex + 1}`} - Qty: {formatQuantity(batch.quantity)}
                                    {batch.is_new_cost && ' (NEW BATCH)'}
                                  </option>
                                ))}
                              </select>
                              {item.cost_batch_id && (
                                <div style={{ 
                                  marginTop: '4px', 
                                  fontSize: '11px', 
                                  color: 'var(--text-muted)' 
                                }}>
                                  {(() => {
                                    const selectedBatch = costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`]?.find(b => b.cost_batch_id === item.cost_batch_id);
                                    return selectedBatch ? `Batch: ${selectedBatch.batch_number || 'N/A'} | Exp: ${selectedBatch.expiry_date ? new Date(selectedBatch.expiry_date).toLocaleDateString() : 'N/A'}` : '';
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Quantity</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={(() => {
                                if (!item.selectedItem || !item.cost_batch_id) return undefined;
                                const batch = costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`]?.find(b => b.cost_batch_id === item.cost_batch_id);
                                return batch ? batch.quantity : item.selectedItem.quantity;
                              })()}
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, e.target.value)}
                              placeholder={(() => {
                                if (!item.selectedItem) return 'Select item first';
                                if (!item.cost_batch_id) return 'Select batch first';
                                const batch = costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`]?.find(b => b.cost_batch_id === item.cost_batch_id);
                                return batch ? `Max: ${batch.quantity}` : `Max: ${item.selectedItem.quantity}`;
                              })()}
                              disabled={!item.selectedItem || !item.cost_batch_id}
                              required
                            />
                          </div>

                          {formData.items.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => removeItem(index)}
                              style={{ padding: '8px 12px' }}
                            >
                              <FiX size={16} />
                            </button>
                          )}
                        </div>

                        {item.selectedItem && (
                          <div style={{ 
                            marginTop: '12px', 
                            padding: '12px', 
                            backgroundColor: 'rgba(37, 99, 235, 0.05)', 
                            borderRadius: 'var(--radius)', 
                            fontSize: '13px',
                            border: '1px solid rgba(37, 99, 235, 0.2)'
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: user.role === 'admin' ? '1fr 1fr 1fr' : '1fr', gap: '12px' }}>
                              <div>
                                <strong>Available:</strong> <span style={{ color: 'var(--success)' }}>{(() => {
                                  const batches = costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`];
                                  if (item.cost_batch_id && batches) {
                                    const batch = batches.find(b => b.cost_batch_id === item.cost_batch_id);
                                    if (batch) return formatQuantity(batch.quantity);
                                  }
                                  if (batches && batches.length) {
                                    return formatQuantity(batches.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0));
                                  }
                                  return formatQuantity(item.selectedItem.quantity);
                                })()} {item.selectedItem.unit}</span>
                              </div>
                              {user.role === 'admin' && (
                                <div>
                                  <strong>Unit Cost:</strong> ₱{formatPrice(item.selectedItem.unit_cost)}
                                </div>
                              )}
                              {user.role === 'admin' && item.quantity && (
                                <div>
                                  <strong>Subtotal:</strong> <span style={{ fontWeight: 600 }}>₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.selectedItem.unit_cost))}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {item.selectedItem && item.cost_batch_id && item.quantity && (() => {
                          const batch = costBatches[`${item.selectedItem.description}-${item.selectedItem.unit}`]?.find(b => b.cost_batch_id === item.cost_batch_id);
                          const max = batch ? parseFloat(batch.quantity) : parseFloat(item.selectedItem.quantity);
                          return parseFloat(item.quantity) > max;
                        })() && (
                          <div className="alert alert-error" style={{ marginTop: '8px' }}>
                            <FiAlertCircle size={14} />
                            Quantity exceeds available stock
                          </div>
                        )}
                      </div>
                    ))}

                    <button 
                      type="button" 
                      className="btn" 
                      onClick={addItem}
                      style={{ marginBottom: '16px' }}
                    >
                      <FiPackage size={16} />
                      Add Another Item
                    </button>

                    {formData.items.some(i => i.selectedItem && i.quantity) && user.role === 'admin' && (
                      <div style={{
                        padding: '16px',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderRadius: 'var(--radius)',
                        marginBottom: '16px',
                        border: '2px solid rgba(16, 185, 129, 0.3)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '16px' }}>Total Transfer Value:</strong>
                          <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--success)' }}>
                            ₱{formatPrice(formData.items.reduce((sum, item) => {
                              if (item.selectedItem && item.quantity) {
                                return sum + (parseFloat(item.quantity) * parseFloat(item.selectedItem.unit_cost));
                              }
                              return sum;
                            }, 0))}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {formData.items.filter(i => i.selectedItem).length} item(s) selected
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Notes (Optional)</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows="3"
                        placeholder="Add any notes about this transfer..."
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-success" 
                      disabled={loading || formData.items.some(i => !i.selectedItem || !i.quantity)}
                    >
                      {loading ? (
                        <>
                          <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <FiCheck size={16} />
                          {(user.role === 'branch_manager' || user.role === 'branch_staff') ? 'Submit Request' : `Create ${formData.items.length} Transfer(s)`}
                        </>
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </form>
        )}

        {transfers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiSend />
            </div>
            <h3>No Transfers Yet</h3>
            <p>Start transferring inventory between locations</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Item</th>
                  <th>Quantity</th>
                  {user.role === 'admin' && <th>Value</th>}
                  <th>Requested By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupTransfers(getFilteredTransfers())
                  .map((transfer) => {
                    const approvedReturns = transfer.status === 'delivered'
                      ? getApprovedReturnsForTransfer(transfer)
                      : [];
                    return (
                  <tr key={transfer.id}>
                    <td>{new Date(transfer.transfer_date).toLocaleDateString()}</td>
                    <td>
                      {approvedReturns.length > 0 ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <span
                            onClick={() => setOpenReturnId(openReturnId === transfer.id ? null : transfer.id)}
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
                          {openReturnId === transfer.id && (
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
                                    {r.item_description} — {r.received_quantity} {r.unit}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>
                                    Note: {r.note}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : getStatusBadge(transfer.status)}
                    </td>
                    <td>{transfer.from_location_name}</td>
                    <td>{transfer.to_location_name}</td>
                    <td style={{ fontWeight: 600 }}>
                      {transfer.isGroup ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Multiple Items ({transfer.totalItems})</span>
                          <button
                            className="btn btn-info"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            onClick={() => handleViewItems(transfer)}
                          >
                            View Items
                          </button>
                        </div>
                      ) : transfer.description && transfer.description.includes('Batch Transfer') ? (
                        <button
                          className="btn btn-info"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                          onClick={() => handleViewItems(transfer)}
                        >
                          {transfer.description}
                        </button>
                      ) : (
                        transfer.description
                      )}
                    </td>
                    <td>
                      {transfer.isGroup ? (
                        `${transfer.totalItems} items`
                      ) : (transfer.description && transfer.description.includes('Batch Transfer')) || (transfer.notes && transfer.notes.includes('CDR')) ? (
                        '—'
                      ) : (
                        `${formatQuantity(transfer.quantity)} ${transfer.unit}`
                      )}
                    </td>
                    {user.role === 'admin' && (
                      <td style={{ fontWeight: 600 }}>
                        {transfer.isGroup ? (
                          `₱${formatPrice(transfer.totalValue)}`
                        ) : (transfer.description && transfer.description.includes('Batch Transfer')) || (transfer.notes && transfer.notes.includes('CDR')) ? (
                          '—'
                        ) : (
                          `₱${formatPrice(parseFloat(transfer.quantity) * parseFloat(transfer.unit_cost))}`
                        )}
                      </td>
                    )}
                    <td>{transfer.transferred_by_name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {canApprove(transfer) && (
                          <>
                            <button
                              className="btn btn-success"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => handleApprove(transfer.id)}
                            >
                              <FiCheck size={12} />
                              Approve
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => handleReject(transfer.id)}
                            >
                              <FiX size={12} />
                              Reject
                            </button>
                          </>
                        )}
                        {canDeliver(transfer) && (
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => handleDeliver(transfer.id)}
                          >
                            <FiCheckCircle size={12} />
                            Receive
                          </button>
                        )}
                        {canUnreceive(transfer) && (
                          <button
                            className="btn btn-warning"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => handleUnreceive(transfer.id)}
                          >
                            <FiX size={12} />
                            Unreceive
                          </button>
                        )}
                        {canCancel(transfer) && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#6b7280', color: 'white' }}
                            onClick={() => handleCancel(transfer.id)}
                          >
                            <FiX size={12} />
                            Cancel
                          </button>
                        )}
                        {canUndoCancel(transfer) && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#f59e0b', color: 'white' }}
                            onClick={() => handleUndoCancel(transfer.id)}
                          >
                            <FiClock size={12} />
                            Undo Cancel
                          </button>
                        )}
                        {canDelete(transfer) && (
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => handleDelete(transfer.id)}
                          >
                            <FiTrash2 size={12} />
                            Delete
                          </button>
                        )}
                        {transfer.status === 'rejected' && transfer.rejection_reason && (
                          <span style={{ fontSize: '11px', color: '#ef4444', fontStyle: 'italic' }}>
                            Reason: {transfer.rejection_reason}
                          </span>
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

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiX size={24} color="#ef4444" />
                Reject Transfer
              </h3>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            <div className="form-group">
              <label>Rejection Reason (Optional)</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection (optional)..."
                rows="4"
                style={{ width: '100%', resize: 'vertical' }}
              />
              <small style={{ color: '#6b7280', marginTop: '4px', display: 'block' }}>
                You can leave this blank if no specific reason is needed
              </small>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmReject}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <FiX size={16} />
                Reject Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CDR Import Modal */}
      {showCdrImport && (
        <CdrImportModal 
          isOpen={showCdrImport}
          onClose={() => setShowCdrImport(false)}
          onImportComplete={() => {
            fetchTransfers();
            setShowCdrImport(false);
          }}
          locations={locations}
        />
      )}

      {/* Express Transfer Modal */}
      {showExpressTransfer && (
        <ExpressTransferModal 
          isOpen={showExpressTransfer}
          onClose={() => setShowExpressTransfer(false)}
          onTransferComplete={() => {
            fetchTransfers();
            setShowExpressTransfer(false);
          }}
          locations={locations}
        />
      )}

      {/* View Items Modal */}
      {showItemsModal && (
        <div className="modal-overlay" onClick={() => setShowItemsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%' }}>
            <div style={{ 
              padding: '20px 24px', 
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiPackage size={20} />
                Transfer Items ({selectedTransferGroup.length} items)
              </h2>
              <button
                onClick={() => setShowItemsModal(false)}
                style={{ 
                  background: 'rgba(255, 255, 255, 0.2)', 
                  border: 'none', 
                  color: 'white', 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: 'var(--radius)', 
                  cursor: 'pointer'
                }}
              >
                <FiX size={16} />
              </button>
            </div>

            <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th style={{ padding: '12px 8px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left' }}>Unit</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Quantity</th>
                      {user.role === 'admin' && (
                        <>
                          <th style={{ padding: '12px 8px', textAlign: 'right' }}>Unit Cost</th>
                          <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total Value</th>
                        </>
                      )}
                      {selectedTransferGroup.length > 0 && selectedTransferGroup[0].status && (
                        <th style={{ padding: '12px 8px', textAlign: 'center' }}>Status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransferGroup.map((item, index) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 8px', fontWeight: '600' }}>{item.description}</td>
                        <td style={{ padding: '12px 8px' }}>{item.unit}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>{formatQuantity(item.quantity)}</td>
                        {user.role === 'admin' && (
                          <>
                            <td style={{ padding: '12px 8px', textAlign: 'right' }}>₱{formatPrice(item.unit_cost)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600' }}>
                              ₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.unit_cost))}
                            </td>
                          </>
                        )}
                        {selectedTransferGroup.length > 0 && selectedTransferGroup[0].status && (
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {getStatusBadge(item.status)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {user.role === 'admin' && (
                    <tfoot>
                      <tr style={{ background: 'var(--bg-secondary)', fontWeight: '600' }}>
                        <td colSpan={3} style={{ padding: '12px 8px', textAlign: 'right' }}>Total:</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '16px' }}>
                          ₱{formatPrice(selectedTransferGroup.reduce((sum, item) => 
                            sum + (parseFloat(item.quantity) * parseFloat(item.unit_cost)), 0
                          ))}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {selectedTransferGroup.length} items
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {selectedTransferGroup.length > 0 && selectedTransferGroup[0].notes && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '12px', 
                  background: 'var(--bg-secondary)', 
                  borderRadius: 'var(--radius)',
                  fontSize: '14px'
                }}>
                  <strong>Notes:</strong> {selectedTransferGroup[0].notes}
                </div>
              )}
            </div>

            <div style={{ 
              padding: '16px 24px', 
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowItemsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer History Modal */}
      {showTransferHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowTransferHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1050px', width: '95%', maxHeight: '90vh' }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiClock size={20} />
                Transfer History (Completed)
              </h2>
              <button onClick={() => setShowTransferHistoryModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                <FiX size={16} />
              </button>
            </div>

            {/* What's the difference info box */}
            <div style={{ padding: '12px 24px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>⬇</span>
                <div>
                  <div style={{ fontWeight: 700, color: '#16a34a', fontSize: '13px' }}>Items Received</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Stock that arrived at this location — sent from a warehouse or another outlet.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>⬆</span>
                <div>
                  <div style={{ fontWeight: 700, color: '#d97706', fontSize: '13px' }}>Items Transferred Out</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Stock that left this location — sent to a warehouse or another outlet.</div>
                </div>
              </div>
            </div>

            {/* Modal Filters */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Start Date</label>
                  <input type="date" value={historyModalFilter.startDate} onChange={e => setHistoryModalFilter(f => ({ ...f, startDate: e.target.value }))} style={{ width: '100%', fontSize: '13px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>End Date</label>
                  <input type="date" value={historyModalFilter.endDate} onChange={e => setHistoryModalFilter(f => ({ ...f, endDate: e.target.value }))} style={{ width: '100%', fontSize: '13px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>From Location</label>
                  <select value={historyModalFilter.from} onChange={e => setHistoryModalFilter(f => ({ ...f, from: e.target.value }))} style={{ width: '100%', fontSize: '13px' }}>
                    <option value="">All</option>
                    {locations
                      .filter(loc =>
                        user.role === 'admin' ||
                        user.role === 'branch_manager' ||
                        loc.id === user.location_id
                      )
                      .map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>To Location</label>
                  <select value={historyModalFilter.to} onChange={e => setHistoryModalFilter(f => ({ ...f, to: e.target.value }))} style={{ width: '100%', fontSize: '13px' }}>
                    <option value="">All</option>
                    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: '12px', height: 'fit-content' }} onClick={() => setHistoryModalFilter({ startDate: '', endDate: '', from: '', to: '' })}>
                  Clear
                </button>
              </div>
            </div>

            {(() => {
              const applyFilter = (list) => list.filter(t => {
                if (historyModalFilter.startDate && new Date(t.transfer_date) < new Date(historyModalFilter.startDate)) return false;
                if (historyModalFilter.endDate && new Date(t.transfer_date) > new Date(historyModalFilter.endDate + 'T23:59:59')) return false;
                if (historyModalFilter.from && String(t.from_location_id) !== String(historyModalFilter.from)) return false;
                if (historyModalFilter.to && String(t.to_location_id) !== String(historyModalFilter.to)) return false;
                return true;
              });

              const delivered = transfers.filter(t => t.status === 'delivered');
              const sentDelivered = applyFilter(delivered.filter(t => {
                if (user.role === 'warehouse') return String(t.from_location_id) === String(user.location_id);
                if (user.role === 'branch_manager') return String(t.from_location_id) === String(user.location_id);
                return true;
              }));
              const receivedDelivered = applyFilter(delivered.filter(t => {
                if (user.role === 'warehouse') return false;
                if (user.role === 'branch_manager') return String(t.to_location_id) === String(user.location_id);
                return true;
              }));
              const showReceivedTab = user.role === 'branch_manager' || user.role === 'admin';

              return (
                <>
                  {/* Tab buttons */}
                  <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', padding: '0 24px' }}>
                    {showReceivedTab && (
                      <button
                        onClick={() => setHistoryTab('received')}
                        style={{
                          padding: '12px 20px',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: historyTab === 'received' ? 700 : 400,
                          color: historyTab === 'received' ? '#16a34a' : 'var(--text-secondary)',
                          borderBottom: historyTab === 'received' ? '3px solid #16a34a' : '3px solid transparent',
                          marginBottom: '-2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        ⬇ Items Received
                        <span style={{
                          background: historyTab === 'received' ? '#dcfce7' : 'var(--bg-secondary)',
                          color: historyTab === 'received' ? '#16a34a' : 'var(--text-muted)',
                          borderRadius: '10px', padding: '1px 8px', fontSize: '12px', fontWeight: 700
                        }}>{receivedDelivered.length}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setHistoryTab('transferred')}
                      style={{
                        padding: '12px 20px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: historyTab === 'transferred' ? 700 : 400,
                        color: historyTab === 'transferred' ? '#d97706' : 'var(--text-secondary)',
                        borderBottom: historyTab === 'transferred' ? '3px solid #d97706' : '3px solid transparent',
                        marginBottom: '-2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      ⬆ Items Transferred Out
                      <span style={{
                        background: historyTab === 'transferred' ? '#fef3c7' : 'var(--bg-secondary)',
                        color: historyTab === 'transferred' ? '#d97706' : 'var(--text-muted)',
                        borderRadius: '10px', padding: '1px 8px', fontSize: '12px', fontWeight: 700
                      }}>{sentDelivered.length}</span>
                    </button>
                  </div>

                  {/* Tab content */}
                  <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 280px)' }}>
                    {historyTab === 'received' && showReceivedTab && (
                      receivedDelivered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          <FiClock size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                          <p>No items have been received yet.</p>
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '14px' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Date</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Item</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Qty</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>From</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>To</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {receivedDelivered.map((t, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontWeight: 600 }}>{new Date(t.transfer_date).toLocaleDateString()}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(t.transfer_date).toLocaleTimeString()}</div>
                                  </td>
                                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                                    {t.description || 'Multiple Items'}
                                    {t.unit && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({t.unit})</span>}
                                  </td>
                                  <td style={{ padding: '10px 8px' }}>{t.quantity ? formatQuantity(t.quantity) : '—'}</td>
                                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{t.from_location_name}</td>
                                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{t.to_location_name}</td>
                                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{t.transferred_by_name || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    {historyTab === 'transferred' && (
                      sentDelivered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          <FiClock size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                          <p>No items have been transferred out yet.</p>
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '14px' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Date</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Item</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Qty</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>From</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>To</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sentDelivered.map((t, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontWeight: 600 }}>{new Date(t.transfer_date).toLocaleDateString()}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(t.transfer_date).toLocaleTimeString()}</div>
                                  </td>
                                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                                    {t.description || 'Multiple Items'}
                                    {t.unit && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({t.unit})</span>}
                                  </td>
                                  <td style={{ padding: '10px 8px' }}>{t.quantity ? formatQuantity(t.quantity) : '—'}</td>
                                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{t.from_location_name}</td>
                                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{t.to_location_name}</td>
                                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{t.transferred_by_name || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                </>
              );
            })()}

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-success" onClick={() => downloadHistoryFile('csv')} style={{ fontSize: '13px' }}>
                  <FiDownload size={14} /> CSV
                </button>
                <button className="btn btn-primary" onClick={() => downloadHistoryFile('xlsx')} style={{ fontSize: '13px' }}>
                  <FiDownload size={14} /> XLSX
                </button>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowTransferHistoryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Export Preview Modal */}
      {showExportPreview && (
        <div className="modal-overlay" onClick={() => setShowExportPreview(false)}>
          <div className="modal-content" style={{ maxWidth: '90%', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ 
              padding: '24px', 
              borderBottom: '2px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiPackage size={20} />
                Export Preview ({exportData.length} records)
              </h3>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowExportPreview(false)}
                style={{ padding: '8px' }}
              >
                <FiX size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Item</th>
                      <th>Quantity</th>
                      {user.role === 'admin' && <th>Value</th>}
                      <th>Requested By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportData.map((row, index) => (
                      <tr key={index}>
                        <td>{row.date}</td>
                        <td>{row.status}</td>
                        <td>{row.from}</td>
                        <td>{row.to}</td>
                        <td>{row.item}</td>
                        <td>{row.quantity}</td>
                        {user.role === 'admin' && <td>₱{row.value}</td>}
                        <td>{row.requestedBy}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ 
              padding: '16px 24px', 
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowExportPreview(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-success" 
                onClick={() => {
                  handleDownloadCSV();
                  setShowExportPreview(false);
                }}
              >
                Download CSV
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  handleDownloadXLSX();
                  setShowExportPreview(false);
                }}
              >
                Download XLSX
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transfers;
