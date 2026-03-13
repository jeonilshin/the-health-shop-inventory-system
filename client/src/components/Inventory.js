import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiPackage, FiPlus, FiDownload, FiSearch, FiAlertCircle, FiTrash2, FiUpload, FiEdit2, FiClock, FiStar, FiDollarSign, FiGitBranch, FiX, FiCheck } from 'react-icons/fi';
import SimpleAutocomplete from './SimpleAutocomplete';
import ImportModal from './ImportModal';

function Inventory() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [sortBy, setSortBy] = useState('batch'); // 'batch', 'description', 'category'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' or specific category
  const [availableCategories, setAvailableCategories] = useState([]);
  const [expiryFilter, setExpiryFilter] = useState('all'); // 'all', 'expired', 'expiring_soon', 'valid'
  const [stockFilter, setStockFilter] = useState('all'); // 'all', 'in_stock', 'out_of_stock'
  const [viewHistory, setViewHistory] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewBatches, setViewBatches] = useState(null);
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [batchEditData, setBatchEditData] = useState({});
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionData, setConversionData] = useState({
    fromItemId: '',
    toItemId: '',
    unitsPerBox: '',
    boxesToConvert: ''
  });
  const [formData, setFormData] = useState({
    items: [{
      description: '',
      unit: '',
      quantity: '',
      unit_cost: '',
      suggested_selling_price: '',
      expiry_date: '',
      batch_number: '',
      is_new_item: false,
      is_new_cost: false
    }]
  });

  useEffect(() => {
    // Capture the current ref value at the start of the effect
    const timersRef = autoDetectTimerRef.current;
    
    const initializeData = async () => {
      setLoading(true);
      await fetchLocations();
      await fetchInventoryHistory();
      setLoading(false);
    };
    initializeData();
    
    // Listen for tab visibility changes
    const handleTabVisible = () => {
      if (selectedLocation) {
        fetchInventory();
      }
    };
    
    window.addEventListener('tab-visible', handleTabVisible);
    
    // Cleanup function
    return () => {
      window.removeEventListener('tab-visible', handleTabVisible);
      // Clear all debounce timers using captured ref value
      Object.values(timersRef).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
      
      if (user.role !== 'admin' && user.location_id) {
        setSelectedLocation(user.location_id);
      } else if (user.role === 'admin') {
        setSelectedLocation('all');
      } else if (response.data.length > 0) {
        setSelectedLocation(response.data[0].id);
      }
    } catch (error) {
      alert('Error loading locations: ' + (error.response?.data?.error || error.message));
    }
  };

  const fetchInventoryHistory = async () => {
    try {
      const response = await api.get('/inventory/history/all');
      setInventoryHistory(response.data);
    } catch (error) {
      // Silently fail - history is optional
    }
  };

  const fetchInventory = async () => {
    try {
      const endpoint = selectedLocation === 'all' 
        ? '/inventory/all' 
        : `/inventory/location/${selectedLocation}`;
      const response = await api.get(endpoint);
      
      // Group items by description and unit for better display
      const groupedInventory = {};
      response.data.forEach(item => {
        const key = `${item.description}-${item.unit}`;
        if (!groupedInventory[key]) {
          groupedInventory[key] = {
            ...item,
            costBatches: [],
            totalQuantity: 0,
            hasMultipleCosts: false
          };
        }
        
        groupedInventory[key].costBatches.push({
          id: item.id,
          cost_batch_id: item.cost_batch_id,
          unit_cost: item.unit_cost,
          suggested_selling_price: item.suggested_selling_price,
          quantity: item.quantity,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          is_new_cost: item.is_new_cost,
          is_new_item: item.is_new_item,
          original_batch_date: item.original_batch_date
        });
        
        groupedInventory[key].totalQuantity += parseFloat(item.quantity);
        
        // Check if there are multiple different costs
        const uniqueCosts = new Set(groupedInventory[key].costBatches.map(b => b.unit_cost));
        groupedInventory[key].hasMultipleCosts = uniqueCosts.size > 1;
        
        // Update main category if not set
        if (item.main_category) {
          groupedInventory[key].main_category = item.main_category;
        }
      });
      
      setInventory(Object.values(groupedInventory));
      setFilteredInventory(Object.values(groupedInventory));
      
      // Extract unique categories
      const categories = new Set();
      Object.values(groupedInventory).forEach(item => {
        if (item.main_category) {
          categories.add(item.main_category);
        }
      });
      setAvailableCategories(Array.from(categories).sort());
    } catch (error) {
      // Error fetching inventory
    }
  };

  useEffect(() => {
    let filtered = inventory;
    
    // Apply category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.main_category === selectedCategory);
    }
    
    // Apply stock filter
    if (stockFilter === 'in_stock') {
      filtered = filtered.filter(item => parseFloat(item.quantity) > 0);
    } else if (stockFilter === 'out_of_stock') {
      filtered = filtered.filter(item => parseFloat(item.quantity) === 0);
    }
    
    // Apply expiry filter
    if (expiryFilter !== 'all') {
      const today = new Date();
      filtered = filtered.filter(item => {
        if (!item.expiry_date) return expiryFilter === 'valid'; // Items without expiry are considered valid
        
        const expiryDate = new Date(item.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        if (expiryFilter === 'expired') {
          return daysUntilExpiry < 0;
        } else if (expiryFilter === 'expiring_soon') {
          return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
        } else if (expiryFilter === 'valid') {
          return daysUntilExpiry > 30 || !item.expiry_date;
        }
        return true;
      });
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.batch_number && item.batch_number.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let compareA, compareB;
      
      if (sortBy === 'batch') {
        compareA = (a.batch_number || '').toLowerCase();
        compareB = (b.batch_number || '').toLowerCase();
      } else if (sortBy === 'description') {
        compareA = a.description.toLowerCase();
        compareB = b.description.toLowerCase();
      } else if (sortBy === 'category') {
        compareA = (a.main_category || '').toLowerCase();
        compareB = (b.main_category || '').toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return compareA > compareB ? 1 : -1;
      } else {
        return compareA < compareB ? 1 : -1;
      }
    });
    
    setFilteredInventory(filtered);
    setCurrentPage(1); // Reset to first page when filtering/sorting
  }, [searchTerm, inventory, sortBy, sortOrder, selectedCategory, expiryFilter, stockFilter]);

  const handleExport = () => {
    const headers = selectedLocation === 'all' 
      ? ['Location', 'Description', 'Unit', 'Quantity', 'Unit Cost', 'Suggested Price', 'Total Value']
      : ['Description', 'Unit', 'Quantity', 'Unit Cost', 'Suggested Price', 'Total Value'];
    
    const rows = filteredInventory.map(item => {
      const baseRow = [
        item.description,
        item.unit,
        item.quantity,
        item.unit_cost,
        item.suggested_selling_price || 0,
        parseFloat(item.quantity) * parseFloat(item.unit_cost)
      ];
      
      return selectedLocation === 'all' 
        ? [item.location_name, ...baseRow]
        : baseRow;
    });
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate location
    if (!selectedLocation || selectedLocation === 'all') {
      alert('Please select a specific location to add inventory');
      return;
    }
    
    try {
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const item of formData.items) {
        if (!item.description || !item.unit || !item.quantity || !item.unit_cost) {
          errors.push(`Item ${formData.items.indexOf(item) + 1}: Missing required fields`);
          errorCount++;
          continue;
        }

        try {
          // Prepare item data with proper null handling for empty dates
          const itemData = {
            location_id: selectedLocation,
            ...item,
            expiry_date: item.expiry_date === '' ? null : item.expiry_date
          };
          
          await api.post('/inventory', itemData);
          successCount++;
        } catch (error) {
          errors.push(`${item.description}: ${error.response?.data?.error || error.message}`);
          errorCount++;
        }
      }

      if (successCount > 0) {
        alert(`Successfully added ${successCount} item(s)${errorCount > 0 ? `. ${errorCount} failed.` : '!'}`);
        setShowForm(false);
        setFormData({
          items: [{
            description: '',
            unit: '',
            quantity: '',
            unit_cost: '',
            suggested_selling_price: '',
            expiry_date: '',
            batch_number: '',
            is_new_item: false,
            is_new_cost: false
          }]
        });
        fetchInventory();
        fetchInventoryHistory();
      }

      if (errors.length > 0) {
        console.error('Errors:', errors);
        if (successCount === 0) {
          alert('Failed to add items. Check console for details.');
        }
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding inventory');
    }
  };

  const handleDescriptionSelect = async (item, index) => {
    // Fetch all batches for this product at current location
    try {
      const response = await api.get(`/inventory/cost-batches/${selectedLocation}/${encodeURIComponent(item.description)}/${encodeURIComponent(item.unit)}`);
      const batches = response.data;
      
      // Use the most recent batch as default
      const latestBatch = batches.length > 0 ? batches[0] : item;
      
      const newItems = [...formData.items];
      newItems[index] = {
        ...newItems[index],
        description: item.description,
        unit: item.unit,
        unit_cost: latestBatch.unit_cost || item.unit_cost || '',
        suggested_selling_price: latestBatch.suggested_selling_price || item.suggested_selling_price || '',
        batch_number: latestBatch.batch_number || item.batch_number || '',
        expiry_date: latestBatch.expiry_date ? new Date(latestBatch.expiry_date).toISOString().split('T')[0] : '',
        // Keep quantity empty for user input
        quantity: '',
        is_new_item: false,
        is_new_cost: false
      };
      setFormData({ ...formData, items: newItems });
    } catch (error) {
      // Fallback to basic item data if fetch fails
      const newItems = [...formData.items];
      newItems[index] = {
        ...newItems[index],
        description: item.description,
        unit: item.unit,
        unit_cost: item.unit_cost || '',
        suggested_selling_price: item.suggested_selling_price || '',
        batch_number: item.batch_number || '',
        expiry_date: '',
        quantity: '',
        is_new_item: false,
        is_new_cost: false
      };
      setFormData({ ...formData, items: newItems });
    }
  };

  const handleBatchNumberSelect = async (item, index) => {
    // Fetch the specific batch details
    try {
      const response = await api.get(`/inventory/cost-batches/${selectedLocation}/${encodeURIComponent(item.description)}/${encodeURIComponent(item.unit)}`);
      const batches = response.data;
      
      // Find the batch with matching batch number
      const selectedBatch = batches.find(b => b.batch_number === item.batch_number) || item;
      
      const newItems = [...formData.items];
      newItems[index] = {
        ...newItems[index],
        batch_number: selectedBatch.batch_number || item.batch_number,
        description: item.description,
        unit: item.unit,
        unit_cost: selectedBatch.unit_cost || item.unit_cost || '',
        suggested_selling_price: selectedBatch.suggested_selling_price || item.suggested_selling_price || '',
        expiry_date: selectedBatch.expiry_date ? new Date(selectedBatch.expiry_date).toISOString().split('T')[0] : '',
        // Keep quantity empty for user input
        quantity: '',
        is_new_item: false,
        is_new_cost: false
      };
      setFormData({ ...formData, items: newItems });
    } catch (error) {
      // Fallback to basic item data
      const newItems = [...formData.items];
      newItems[index] = {
        ...newItems[index],
        batch_number: item.batch_number,
        description: item.description,
        unit: item.unit,
        unit_cost: item.unit_cost || '',
        suggested_selling_price: item.suggested_selling_price || '',
        expiry_date: '',
        quantity: '',
        is_new_item: false,
        is_new_cost: false
      };
      setFormData({ ...formData, items: newItems });
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        suggested_selling_price: '',
        expiry_date: '',
        batch_number: '',
        is_new_item: false,
        is_new_cost: false
      }]
    });
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: newItems });
    }
  };

  // Debounce timer ref for auto-detect new cost
  const autoDetectTimerRef = React.useRef({});

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
    
    // Auto-detect if this should be marked as new cost (debounced)
    if ((field === 'unit_cost' || field === 'suggested_selling_price' || field === 'expiry_date') && 
        newItems[index].description && newItems[index].unit && selectedLocation && selectedLocation !== 'all') {
      
      // Clear existing timer for this item
      if (autoDetectTimerRef.current[index]) {
        clearTimeout(autoDetectTimerRef.current[index]);
      }
      
      // Set new timer - only run API call after user stops typing for 800ms
      autoDetectTimerRef.current[index] = setTimeout(async () => {
        try {
          // Fetch existing batches to compare
          const response = await api.get(`/inventory/cost-batches/${selectedLocation}/${encodeURIComponent(newItems[index].description)}/${encodeURIComponent(newItems[index].unit)}`);
          const batches = response.data;
          
          if (batches.length > 0) {
            // Check if the new values differ from any existing batch
            const hasMatchingBatch = batches.some(batch => {
              const costMatches = parseFloat(batch.unit_cost) === parseFloat(newItems[index].unit_cost || 0);
              const priceMatches = parseFloat(batch.suggested_selling_price || 0) === parseFloat(newItems[index].suggested_selling_price || 0);
              const expiryMatches = (batch.expiry_date ? new Date(batch.expiry_date).toISOString().split('T')[0] : '') === (newItems[index].expiry_date || '');
              
              return costMatches && priceMatches && expiryMatches;
            });
            
            // Auto-check "New Cost" if no matching batch found
            if (!hasMatchingBatch && (newItems[index].unit_cost || newItems[index].suggested_selling_price)) {
              setFormData(prev => {
                const updated = [...prev.items];
                updated[index].is_new_cost = true;
                return { ...prev, items: updated };
              });
            } else if (hasMatchingBatch) {
              // Uncheck if it matches an existing batch
              setFormData(prev => {
                const updated = [...prev.items];
                updated[index].is_new_cost = false;
                return { ...prev, items: updated };
              });
            }
          }
        } catch (error) {
          // Silently fail - user can manually check the box
        }
      }, 800);
    }
  };

  const canAddInventory = user.role === 'admin' || user.role === 'warehouse';

  const handleDeleteInventory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this inventory item?')) {
      return;
    }
    try {
      await api.delete(`/inventory/${id}`);
      alert('Inventory item deleted successfully!');
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting inventory item');
    }
  };

  const handleViewHistory = async (item) => {
    setViewHistory(item);
    setLoadingHistory(true);
    try {
      // Fetch history for this product (by description and unit)
      const response = await api.get(`/inventory/history/${item.id}`);
      setProductHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
      setProductHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleViewBatches = (item) => {
    if (viewBatches && viewBatches.id === item.id) {
      // Close if already open
      setViewBatches(null);
      setEditingBatchId(null);
      setBatchEditData({});
    } else {
      // Open batches view
      setViewBatches(item);
      setEditingBatchId(null);
      setBatchEditData({});
    }
  };

  const handleEditBatch = (batch) => {
    setEditingBatchId(batch.id);
    setBatchEditData({
      description: batch.description || viewBatches.description,
      unit: batch.unit || viewBatches.unit,
      quantity: batch.quantity,
      expiry_date: batch.expiry_date || '',
      unit_cost: batch.unit_cost,
      suggested_selling_price: batch.suggested_selling_price || ''
    });
  };

  const handleSaveBatchEdit = async (id) => {
    try {
      // Prepare data with proper null handling for empty dates
      const dataToSend = {
        ...batchEditData,
        expiry_date: batchEditData.expiry_date === '' ? null : batchEditData.expiry_date
      };
      
      await api.put(`/inventory/${id}`, dataToSend);
      alert('Batch updated successfully!');
      setEditingBatchId(null);
      setBatchEditData({});
      
      // Refresh inventory
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error updating batch');
    }
  };

  const handleCancelBatchEdit = () => {
    setEditingBatchId(null);
    setBatchEditData({});
  };

  const handleConvertUnits = async () => {
    if (!conversionData.fromItemId || !conversionData.toItemId || !conversionData.unitsPerBox || !conversionData.boxesToConvert) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await api.post('/inventory/convert-units', {
        fromItemId: conversionData.fromItemId,
        toItemId: conversionData.toItemId,
        unitsPerBox: parseFloat(conversionData.unitsPerBox),
        boxesToConvert: parseFloat(conversionData.boxesToConvert)
      });
      
      alert('Units converted successfully!');
      setShowConversionModal(false);
      setConversionData({ fromItemId: '', toItemId: '', unitsPerBox: '', boxesToConvert: '' });
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error converting units');
    }
  };

  // Helper function to determine stock status based on percentage
  const getStockStatus = (quantity, maxQuantity) => {
    const qty = parseFloat(quantity);
    const max = parseFloat(maxQuantity) || 0;
    
    if (qty === 0) return 'no-stock';
    if (max === 0) return 'normal'; // No max set yet
    
    const percentage = (qty / max) * 100;
    
    if (percentage <= 10) return 'dangerous'; // 10% or less
    if (percentage <= 30) return 'low'; // 30% or less
    return 'normal';
  };

  const getStockBadgeClass = (status) => {
    if (status === 'no-stock') return 'badge-secondary';
    if (status === 'dangerous') return 'badge-danger';
    if (status === 'low') return 'badge-warning';
    return 'badge-success';
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiPackage size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Inventory Management</h2>
      </div>
      
      {user.role === 'branch_manager' && (
        <div className="alert alert-info" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          Branch managers cannot add inventory directly. Use the Transfers page to request items from the warehouse.
        </div>
      )}
      
      {user.role === 'branch_staff' && (
        <div className="alert alert-info" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          You have view-only access to inventory. Contact your branch manager to request items.
        </div>
      )}
      
      {(user.role === 'warehouse' || user.role === 'branch_manager' || user.role === 'branch_staff') && !user.location_id && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          Your account is not assigned to a location. Please contact the administrator to assign you to a location.
        </div>
      )}
      
      {!loading && locations.length === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          No locations found. Please create locations in the Admin panel first.
        </div>
      )}
      
      <div className="card">
        {/* Breadcrumb Navigation */}
        {selectedLocation && selectedLocation !== 'all' && user.role === 'admin' && (
          <div style={{ 
            marginBottom: '20px', 
            padding: '12px 16px', 
            background: 'var(--bg-secondary)', 
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}>
            <button 
              className="btn btn-secondary"
              onClick={() => setSelectedLocation('all')}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              ← Back
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <button 
              onClick={() => setSelectedLocation('all')}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--primary)', 
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                font: 'inherit'
              }}
            >
              All Locations
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontWeight: '600' }}>
              {locations.find(l => l.id === parseInt(selectedLocation))?.name}
            </span>
          </div>
        )}

        {/* Location Cards View (when "all" is selected) */}
        {selectedLocation === 'all' && user.role === 'admin' ? (
          <div>
            <h3 style={{ marginBottom: '20px' }}>Select a Location</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '20px' 
            }}>
              {locations.map(location => {
                const locationInventory = inventory.filter(item => item.location_id === location.id);
                const inStockItems = locationInventory.filter(item => parseFloat(item.quantity) > 0);
                const totalItems = inStockItems.length;
                const totalValue = inStockItems.reduce((sum, item) => 
                  sum + (parseFloat(item.quantity) * parseFloat(item.unit_cost)), 0
                );
                const dangerousStock = locationInventory.filter(item => {
                  const status = getStockStatus(item.quantity, item.max_quantity);
                  return status === 'dangerous';
                }).length;
                const lowStock = locationInventory.filter(item => {
                  const status = getStockStatus(item.quantity, item.max_quantity);
                  return status === 'low';
                }).length;
                const noStock = locationInventory.filter(item => parseFloat(item.quantity) === 0).length;
                
                return (
                  <div
                    key={location.id}
                    onClick={() => setSelectedLocation(location.id)}
                    style={{
                      padding: '24px',
                      border: '2px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      cursor: 'pointer',
                      transition: 'var(--transition)',
                      background: 'var(--bg-primary)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      right: 0, 
                      height: '4px', 
                      background: location.type === 'warehouse' ? 'var(--primary)' : 'var(--success)'
                    }} />
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ 
                        width: '48px', 
                        height: '48px', 
                        borderRadius: '12px', 
                        background: location.type === 'warehouse' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px'
                      }}>
                        {location.type === 'warehouse' ? '📦' : '🏪'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                          {location.name}
                        </h4>
                        <span className={`badge ${location.type === 'warehouse' ? 'badge-primary' : 'badge-success'}`} 
                          style={{ fontSize: '11px', marginTop: '4px' }}>
                          {location.type}
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: '12px',
                      marginTop: '16px',
                      paddingTop: '16px',
                      borderTop: '1px solid var(--border)'
                    }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          In Stock
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)' }}>
                          {totalItems}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Total Value
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '700' }}>
                          ₱{formatPrice(totalValue)}
                        </div>
                      </div>
                      {noStock > 0 && (
                        <div>
                          <div style={{ 
                            padding: '8px 12px', 
                            background: 'rgba(107, 114, 128, 0.1)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            📦 {noStock} no stock
                          </div>
                        </div>
                      )}
                      {dangerousStock > 0 && (
                        <div>
                          <div style={{ 
                            padding: '8px 12px', 
                            background: 'rgba(239, 68, 68, 0.2)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '12px',
                            color: '#dc2626',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            ⚠️ {dangerousStock} critical (≤10%)
                          </div>
                        </div>
                      )}
                      {lowStock > 0 && (
                        <div>
                          <div style={{ 
                            padding: '8px 12px', 
                            background: 'rgba(245, 158, 11, 0.1)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '12px',
                            color: '#d97706',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <FiAlertCircle size={14} />
                            {lowStock} low stock (≤30%)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Regular Inventory View */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn" onClick={handleExport} disabled={filteredInventory.length === 0}>
                  <FiDownload size={16} />
                  Export CSV
                </button>
                {(user.role === 'admin' || user.role === 'warehouse') && (
                  <button className="btn btn-success" onClick={() => setShowImportModal(true)}>
                    <FiUpload size={16} />
                    Import Excel
                  </button>
                )}
                {canAddInventory && (
                  <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    <FiPlus size={16} />
                    {showForm ? 'Cancel' : 'Add Item'}
                  </button>
                )}
                {(user.role === 'admin' || user.role === 'branch_manager' || user.role === 'branch_staff') && selectedLocation !== 'all' && (
                  <button className="btn btn-info" onClick={() => setShowConversionModal(true)}>
                    🔄 Convert Units
                  </button>
                )}
              </div>
            </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto auto auto', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="text"
                placeholder="Search by description, unit, or batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
            
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ minWidth: '180px' }}
            >
              <option value="all">All Categories</option>
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            
            <select 
              value={stockFilter} 
              onChange={(e) => setStockFilter(e.target.value)}
              style={{ minWidth: '140px' }}
            >
              <option value="all">All Stock</option>
              <option value="in_stock">✅ In Stock</option>
              <option value="out_of_stock">❌ Out of Stock</option>
            </select>
            
            <select 
              value={expiryFilter} 
              onChange={(e) => setExpiryFilter(e.target.value)}
              style={{ minWidth: '160px' }}
            >
              <option value="all">All Expiry</option>
              <option value="expired">🔴 Expired</option>
              <option value="expiring_soon">🟡 Expiring Soon (30d)</option>
              <option value="valid">🟢 Valid</option>
            </select>
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="batch">Sort by Batch</option>
              <option value="description">Sort by Description</option>
              <option value="category">Sort by Category</option>
            </select>
            
            <button 
              className="btn" 
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{ minWidth: '100px' }}
            >
              {sortOrder === 'asc' ? 'A → Z' : 'Z → A'}
            </button>
            
            <select 
              value={itemsPerPage} 
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ minWidth: '120px' }}
            >
              <option value={50}>Show 50</option>
              <option value={100}>Show 100</option>
              <option value={200}>Show 200</option>
              <option value={999999}>Show All</option>
            </select>
          </div>
        </div>

        {/* Summary Stats for Admin */}
        {user.role === 'admin' && selectedLocation !== 'all' && filteredInventory.length > 0 && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              padding: '16px', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Total Items
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>
                {filteredInventory.length}
              </div>
            </div>
            <div style={{ 
              padding: '16px', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                In Stock
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success)' }}>
                {filteredInventory.filter(item => parseFloat(item.quantity) > 0).length}
              </div>
            </div>
            <div style={{ 
              padding: '16px', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Total Value (In Stock)
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>
                ₱{formatPrice(
                  filteredInventory
                    .filter(item => parseFloat(item.quantity) > 0)
                    .reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_cost)), 0)
                )}
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '2px solid var(--border)'
            }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiPackage size={20} />
                Add Inventory Items
              </h3>
              <button 
                className="btn btn-success" 
                onClick={addItem}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FiPlus size={16} />
                Add More Item
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {formData.items.map((item, index) => (
                <div key={index} style={{ 
                  marginBottom: '24px', 
                  padding: '20px', 
                  backgroundColor: 'var(--bg-secondary)', 
                  borderRadius: 'var(--radius-md)', 
                  border: '2px solid var(--border)',
                  position: 'relative'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '16px' 
                  }}>
                    <h4 style={{ 
                      margin: 0, 
                      color: 'var(--primary)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px' 
                    }}>
                      <FiPackage size={16} />
                      Item {index + 1}
                    </h4>
                    {formData.items.length > 1 && (
                      <button 
                        type="button"
                        className="btn btn-danger" 
                        onClick={() => removeItem(index)}
                        style={{ 
                          padding: '6px 12px', 
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <FiX size={14} />
                        Remove
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Description *</label>
                      <SimpleAutocomplete
                        items={inventoryHistory}
                        value={item.description}
                        onChange={(value) => updateItem(index, 'description', value)}
                        onSelect={(selectedItem) => handleDescriptionSelect(selectedItem, index)}
                        displayField="description"
                        placeholder="Start typing to search..."
                        required={true}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Unit *</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        placeholder="e.g., kg, pcs, box"
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Quantity *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Unit Cost *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(index, 'unit_cost', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Suggested Selling Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.suggested_selling_price}
                        onChange={(e) => updateItem(index, 'suggested_selling_price', e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Batch Number</label>
                      <SimpleAutocomplete
                        items={inventoryHistory.filter(histItem => histItem.batch_number)}
                        value={item.batch_number}
                        onChange={(value) => updateItem(index, 'batch_number', value)}
                        onSelect={(selectedItem) => handleBatchNumberSelect(selectedItem, index)}
                        displayField="batch_number"
                        placeholder="Start typing batch number..."
                        required={false}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Expiry Date</label>
                      <input
                        type="date"
                        value={item.expiry_date}
                        onChange={(e) => updateItem(index, 'expiry_date', e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                  
                  {/* New Item and New Cost Options */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '20px', 
                    marginTop: '16px', 
                    padding: '16px', 
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)', 
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        id={`is_new_item_${index}`}
                        checked={item.is_new_item}
                        onChange={(e) => updateItem(index, 'is_new_item', e.target.checked)}
                      />
                      <label htmlFor={`is_new_item_${index}`} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        color: 'var(--success)',
                        fontSize: '14px'
                      }}>
                        <FiStar size={16} />
                        New Item
                      </label>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        id={`is_new_cost_${index}`}
                        checked={item.is_new_cost}
                        onChange={(e) => updateItem(index, 'is_new_cost', e.target.checked)}
                      />
                      <label htmlFor={`is_new_cost_${index}`} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        color: item.is_new_cost ? 'var(--warning)' : 'var(--text-muted)',
                        fontSize: '14px'
                      }}>
                        <FiDollarSign size={16} />
                        New Cost {item.is_new_cost && '(Auto-detected)'}
                      </label>
                    </div>
                    
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-muted)', 
                      marginLeft: 'auto', 
                      alignSelf: 'center',
                      maxWidth: '250px',
                      textAlign: 'right'
                    }}>
                      "New Cost" is auto-checked when price or expiry differs from existing batches. Uncheck to add to existing batch.
                    </div>
                  </div>
                </div>
              ))}
              
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'center',
                paddingTop: '20px',
                borderTop: '2px solid var(--border)'
              }}>
                <button type="submit" className="btn btn-success" style={{ 
                  padding: '12px 24px',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <FiPlus size={18} />
                  Add {formData.items.length} Item{formData.items.length > 1 ? 's' : ''} to Inventory
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowForm(false);
                    setFormData({
                      items: [{
                        description: '',
                        unit: '',
                        quantity: '',
                        unit_cost: '',
                        suggested_selling_price: '',
                        expiry_date: '',
                        batch_number: '',
                        is_new_item: false,
                        is_new_cost: false
                      }]
                    });
                  }}
                  style={{ 
                    padding: '12px 24px',
                    fontSize: '16px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ overflowX: 'auto', marginTop: '20px' }}>
          <table>
            <thead>
              <tr>
              <th>Description</th>
              <th>Unit</th>
              <th>Quantity</th>
              <th>Batch</th>
              <th>Expiry</th>
              {user.role === 'admin' && (
                <>
                  <th>Unit Cost</th>
                  <th>Suggested Price</th>
                  <th>Total Value</th>
                </>
              )}
              {user.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'admin' ? 9 : 5} style={{ textAlign: 'center', padding: '20px' }}>
                  {searchTerm ? 'No items match your search' : 'No inventory items found'}
                </td>
              </tr>
            ) : (
              (() => {
                // Calculate pagination
                const indexOfLastItem = currentPage * itemsPerPage;
                const indexOfFirstItem = indexOfLastItem - itemsPerPage;
                const currentItems = filteredInventory.slice(indexOfFirstItem, indexOfLastItem);
                
                if (selectedLocation === 'all') {
                  // Group items by location
                  let currentLocation = null;
                  return currentItems.map((item, index) => {
                    const expiryDate = item.expiry_date ? new Date(item.expiry_date) : null;
                    const today = new Date();
                    const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : null;
                    const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                    
                    const showLocationHeader = currentLocation !== item.location_id;
                    currentLocation = item.location_id;
                    
                    return (
                      <>
                        {showLocationHeader && (
                          <tr key={`header-${item.location_id}`} style={{ backgroundColor: 'var(--bg-secondary)' }}>
                            <td colSpan={user.role === 'admin' ? 9 : 5} style={{ fontWeight: 700, fontSize: '14px', padding: '12px', color: 'var(--primary)' }}>
                              <span className={`badge ${item.location_type === 'warehouse' ? 'badge-primary' : 'badge-info'}`} style={{ marginRight: '8px' }}>
                                {item.location_type}
                              </span>
                              {item.location_name}
                            </td>
                          </tr>
                        )}
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600 }}>{item.description}</td>
                          <td>{item.unit}</td>
                          <td>
                            <span className={`badge ${getStockBadgeClass(getStockStatus(item.quantity, item.max_quantity))}`}>
                              {formatQuantity(item.quantity)}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {item.batch_number || '-'}
                          </td>
                          <td>
                            {expiryDate ? (
                              <span style={{ 
                                fontSize: '12px',
                                color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : 'var(--text-secondary)',
                                fontWeight: (isExpired || isExpiringSoon) ? 600 : 400
                              }}>
                                {expiryDate.toLocaleDateString()}
                                {isExpired && ' (Expired)'}
                                {isExpiringSoon && ` (${daysUntilExpiry}d)`}
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          {user.role === 'admin' && (
                            <>
                              <td>₱{formatPrice(item.unit_cost)}</td>
                              <td>₱{formatPrice(item.suggested_selling_price || 0)}</td>
                              <td style={{ fontWeight: 600 }}>₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.unit_cost))}</td>
                            </>
                          )}
                          {user.role === 'admin' && (
                            <td>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => handleDeleteInventory(item.id)}
                              >
                                <FiTrash2 size={12} />
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      </>
                    );
                  });
                } else {
                  // Single location view
                  return currentItems.map((item) => {
                    return (
                      <React.Fragment key={item.id}>
                        {/* Main Item Row */}
                        <tr style={{ backgroundColor: item.hasMultipleCosts ? 'rgba(245, 158, 11, 0.05)' : 'transparent' }}>
                          <td style={{ fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{item.description}</span>
                                {item.costBatches.some(b => b.is_new_item) && (
                                  <span style={{ 
                                    fontSize: '10px', 
                                    background: 'var(--success)', 
                                    color: 'white', 
                                    padding: '2px 6px', 
                                    borderRadius: '12px',
                                    fontWeight: '700'
                                  }}>
                                    🆕 NEW
                                  </span>
                                )}
                                {item.hasMultipleCosts && (
                                  <span style={{ 
                                    fontSize: '10px', 
                                    background: 'var(--warning)', 
                                    color: 'white', 
                                    padding: '2px 6px', 
                                    borderRadius: '12px',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <FiGitBranch size={10} />
                                    MULTI-COST
                                  </span>
                                )}
                              </div>
                          </td>
                          <td>{item.unit}</td>
                          <td>
                            <span className={`badge ${getStockBadgeClass(getStockStatus(item.totalQuantity, item.max_quantity))}`}>
                              {formatQuantity(item.totalQuantity)}
                            </span>
                            {item.hasMultipleCosts && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {item.costBatches.length} batches
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {item.batch_number || '-'}
                          </td>
                          <td>
                            {item.expiry_date ? (
                              <span style={{ fontSize: '12px' }}>
                                {new Date(item.expiry_date).toLocaleDateString()}
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          {user.role === 'admin' && (
                            <>
                              <td>
                                {item.hasMultipleCosts ? (
                                  <div style={{ fontSize: '11px' }}>
                                    <div>₱{formatPrice(Math.min(...item.costBatches.map(b => b.unit_cost)))}</div>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                      to ₱{formatPrice(Math.max(...item.costBatches.map(b => b.unit_cost)))}
                                    </div>
                                  </div>
                                ) : (
                                  `₱${formatPrice(item.unit_cost)}`
                                )}
                              </td>
                              <td>
                                {item.hasMultipleCosts ? (
                                  <div style={{ fontSize: '11px' }}>
                                    <div>₱{formatPrice(Math.min(...item.costBatches.map(b => b.suggested_selling_price || 0)))}</div>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                      to ₱{formatPrice(Math.max(...item.costBatches.map(b => b.suggested_selling_price || 0)))}
                                    </div>
                                  </div>
                                ) : (
                                  `₱${formatPrice(item.suggested_selling_price || 0)}`
                                )}
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                ₱{formatPrice(item.costBatches.reduce((sum, batch) => 
                                  sum + (parseFloat(batch.quantity) * parseFloat(batch.unit_cost)), 0
                                ))}
                              </td>
                            </>
                          )}
                          {user.role === 'admin' && (
                            <td>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button 
                                  className="btn btn-info" 
                                  style={{ padding: '6px 10px', fontSize: '12px' }}
                                  onClick={() => handleViewHistory(item)}
                                  title="View History"
                                >
                                  <FiClock size={12} />
                                </button>
                                {item.hasMultipleCosts ? (
                                  <button 
                                    className={`btn ${viewBatches && viewBatches.id === item.id ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    onClick={() => handleViewBatches(item)}
                                    title={viewBatches && viewBatches.id === item.id ? 'Hide Batches' : 'Edit Batches'}
                                  >
                                    <FiEdit2 size={12} />
                                  </button>
                                ) : (
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    onClick={() => handleEditBatch(item.costBatches[0])}
                                    title="Edit Item"
                                  >
                                    <FiEdit2 size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                        
                        {/* Cost Batch Details (if expanded) */}
                        {viewBatches && viewBatches.id === item.id && item.hasMultipleCosts && (
                          item.costBatches.map((batch, idx) => {
                            const isEditing = editingBatchId === batch.id;
                            const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
                            const today = new Date();
                            const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : null;
                            const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                            const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                            
                            return (
                              <tr key={`batch-${batch.id}`} style={{ 
                                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                                borderLeft: '4px solid var(--warning)'
                              }}>
                                <td style={{ paddingLeft: '24px', fontSize: '12px' }}>
                                  {isEditing ? (
                                    <input 
                                      type="text"
                                      value={batchEditData.description}
                                      onChange={(e) => setBatchEditData({...batchEditData, description: e.target.value})}
                                      style={{ 
                                        width: '100%', 
                                        padding: '4px 8px', 
                                        fontSize: '11px',
                                        border: '2px solid var(--primary)',
                                        borderRadius: 'var(--radius)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)'
                                      }}
                                    />
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                      └ Batch {idx + 1}
                                      {batch.is_new_cost && (
                                        <span style={{ 
                                          fontSize: '9px', 
                                          background: 'var(--warning)', 
                                          color: 'white', 
                                          padding: '1px 4px', 
                                          borderRadius: '8px'
                                        }}>
                                          NEW
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td style={{ fontSize: '12px' }}>
                                  {isEditing ? (
                                    <input 
                                      type="text"
                                      value={batchEditData.unit}
                                      onChange={(e) => setBatchEditData({...batchEditData, unit: e.target.value})}
                                      style={{ 
                                        width: '80px', 
                                        padding: '4px 8px', 
                                        fontSize: '11px',
                                        border: '2px solid var(--primary)',
                                        borderRadius: 'var(--radius)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)'
                                      }}
                                    />
                                  ) : (
                                    item.unit
                                  )}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input 
                                      type="number"
                                      step="1"
                                      min="0"
                                      value={batchEditData.quantity}
                                      onChange={(e) => setBatchEditData({...batchEditData, quantity: e.target.value})}
                                      style={{ 
                                        width: '80px', 
                                        padding: '4px 8px', 
                                        fontSize: '11px',
                                        border: '2px solid var(--primary)',
                                        borderRadius: 'var(--radius)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)'
                                      }}
                                    />
                                  ) : (
                                    <span className={`badge ${getStockBadgeClass(getStockStatus(batch.quantity, item.max_quantity))}`} style={{ fontSize: '10px' }}>
                                      {formatQuantity(batch.quantity)}
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {batch.batch_number || '-'}
                                </td>
                                <td style={{ fontSize: '11px' }}>
                                  {isEditing ? (
                                    <input 
                                      type="date"
                                      value={batchEditData.expiry_date && batchEditData.expiry_date !== '' ? new Date(batchEditData.expiry_date).toISOString().split('T')[0] : ''}
                                      onChange={(e) => setBatchEditData({...batchEditData, expiry_date: e.target.value})}
                                      style={{ 
                                        width: '130px', 
                                        padding: '4px 8px', 
                                        fontSize: '11px',
                                        border: '2px solid var(--primary)',
                                        borderRadius: 'var(--radius)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)'
                                      }}
                                    />
                                  ) : (
                                    expiryDate ? (
                                      <span style={{ 
                                        color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : 'var(--text-secondary)',
                                        fontWeight: (isExpired || isExpiringSoon) ? 600 : 400
                                      }}>
                                        {expiryDate.toLocaleDateString()}
                                        {isExpired && ' (Expired)'}
                                        {isExpiringSoon && ` (${daysUntilExpiry}d)`}
                                      </span>
                                    ) : '-'
                                  )}
                                </td>
                                {user.role === 'admin' && (
                                  <>
                                    <td style={{ fontSize: '12px' }}>
                                      {isEditing ? (
                                        <input 
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={batchEditData.unit_cost}
                                          onChange={(e) => setBatchEditData({...batchEditData, unit_cost: e.target.value})}
                                          style={{ 
                                            width: '90px', 
                                            padding: '4px 8px', 
                                            fontSize: '11px',
                                            border: '2px solid var(--primary)',
                                            borderRadius: 'var(--radius)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)'
                                          }}
                                        />
                                      ) : (
                                        `₱${formatPrice(batch.unit_cost)}`
                                      )}
                                    </td>
                                    <td style={{ fontSize: '12px' }}>
                                      {isEditing ? (
                                        <input 
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={batchEditData.suggested_selling_price}
                                          onChange={(e) => setBatchEditData({...batchEditData, suggested_selling_price: e.target.value})}
                                          style={{ 
                                            width: '90px', 
                                            padding: '4px 8px', 
                                            fontSize: '11px',
                                            border: '2px solid var(--primary)',
                                            borderRadius: 'var(--radius)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)'
                                          }}
                                        />
                                      ) : (
                                        `₱${formatPrice(batch.suggested_selling_price || 0)}`
                                      )}
                                    </td>
                                    <td style={{ fontSize: '12px', fontWeight: 600 }}>
                                      ₱{formatPrice(parseFloat(batch.quantity) * parseFloat(batch.unit_cost))}
                                    </td>
                                  </>
                                )}
                                {user.role === 'admin' && (
                                  <td>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      {isEditing ? (
                                        <>
                                          <button 
                                            className="btn btn-success" 
                                            style={{ padding: '4px 8px', fontSize: '10px' }}
                                            onClick={() => handleSaveBatchEdit(batch.id)}
                                            title="Save Changes"
                                          >
                                            <FiCheck size={10} />
                                          </button>
                                          <button 
                                            className="btn btn-danger" 
                                            style={{ padding: '4px 8px', fontSize: '10px' }}
                                            onClick={handleCancelBatchEdit}
                                            title="Cancel Edit"
                                          >
                                            <FiX size={10} />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button 
                                            className="btn btn-primary" 
                                            style={{ padding: '4px 8px', fontSize: '10px' }}
                                            onClick={() => handleEditBatch(batch)}
                                            title="Edit Batch"
                                          >
                                            <FiEdit2 size={10} />
                                          </button>
                                          <button
                                            className="btn btn-danger"
                                            style={{ padding: '4px 8px', fontSize: '10px' }}
                                            onClick={() => handleDeleteInventory(batch.id)}
                                            title="Delete Batch"
                                          >
                                            <FiTrash2 size={10} />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                        
                      </React.Fragment>
                    );
                  });
                }
              })()
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      {selectedLocation !== 'all' && filteredInventory.length > 0 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginTop: '20px',
          padding: '16px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredInventory.length)} to {Math.min(currentPage * itemsPerPage, filteredInventory.length)} of {filteredInventory.length} items
          </div>
          
          {Math.ceil(filteredInventory.length / itemsPerPage) > 1 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px' }}
              >
                First
              </button>
              <button
                className="btn"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px' }}
              >
                Previous
              </button>
              
              <span style={{ padding: '0 12px', color: 'var(--text-primary)', fontWeight: '600' }}>
                Page {currentPage} of {Math.ceil(filteredInventory.length / itemsPerPage)}
              </span>
              
              <button
                className="btn"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= Math.ceil(filteredInventory.length / itemsPerPage)}
                style={{ padding: '6px 12px' }}
              >
                Next
              </button>
              <button
                className="btn"
                onClick={() => setCurrentPage(Math.ceil(filteredInventory.length / itemsPerPage))}
                disabled={currentPage >= Math.ceil(filteredInventory.length / itemsPerPage)}
                style={{ padding: '6px 12px' }}
              >
                Last
              </button>
            </div>
          )}
        </div>
      )}
          </>
        )}
      </div>

      {/* Product History Modal */}
      {viewHistory && (
        <div className="modal-overlay" onClick={() => setViewHistory(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh' }}>
            <div style={{ 
              padding: '20px 24px', 
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                  Product History
                </h2>
                <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                  {viewHistory.description} ({viewHistory.unit})
                </div>
              </div>
              <button
                onClick={() => setViewHistory(null)}
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
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading history...
                </div>
              ) : productHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No history found for this product
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {productHistory
                    .filter(record => {
                      // Filter adjustments to only show those for the current location
                      if (record.type === 'adjustment') {
                        const locationId = record.new_values?.location_id || record.old_values?.location_id;
                        return locationId === viewHistory.location_id;
                      }
                      return true;
                    })
                    .map((record, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-secondary)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {record.type === 'sale' && (
                            <span style={{ fontSize: '20px' }}>💰</span>
                          )}
                          {record.type === 'transfer' && (
                            <span style={{ fontSize: '20px' }}>🚚</span>
                          )}
                          {record.type === 'adjustment' && (
                            <span style={{ fontSize: '20px' }}>📝</span>
                          )}
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '14px' }}>
                              {record.type === 'sale' && 'Sale'}
                              {record.type === 'transfer' && 'Transfer'}
                              {record.type === 'adjustment' && record.action}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {new Date(record.date || record.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {record.type === 'sale' && (
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--danger)' }}>
                              -{record.quantity}
                            </div>
                          )}
                          {record.type === 'transfer' && (
                            <div style={{ fontSize: '16px', fontWeight: '700', color: record.to_location_id === viewHistory.location_id ? 'var(--success)' : 'var(--danger)' }}>
                              {record.to_location_id === viewHistory.location_id ? '+' : '-'}{record.quantity}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {record.type === 'sale' && (
                          <>
                            <div>Sold by: {record.user_name}</div>
                            <div>Price: ₱{formatPrice(record.unit_price)} × {record.quantity} = ₱{formatPrice(record.total_amount)}</div>
                            <div>Payment: {record.payment_method}</div>
                            {record.customer_name && <div>Customer: {record.customer_name}</div>}
                            <div>Location: {record.location_name}</div>
                          </>
                        )}
                        {record.type === 'transfer' && (
                          <>
                            <div>From: {record.from_location_name} → To: {record.to_location_name}</div>
                            <div>Status: <span className={`badge badge-${record.status === 'completed' ? 'success' : record.status === 'pending' ? 'warning' : 'secondary'}`}>{record.status}</span></div>
                            <div>Transferred by: {record.user_name}</div>
                            <div>Unit Cost: ₱{formatPrice(record.unit_cost)}</div>
                          </>
                        )}
                        {record.type === 'adjustment' && (
                          <>
                            <div>User: {record.user_name}</div>
                            {record.audit_description && <div>{record.audit_description}</div>}
                            {record.action === 'INVENTORY_ADD' && record.new_values && (
                              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                <div style={{ color: 'var(--success)', fontWeight: '600' }}>
                                  Added: {record.new_values.quantity} {record.new_values.unit}
                                </div>
                                <div>Unit Cost: ₱{formatPrice(record.new_values.unit_cost)}</div>
                                {record.new_values.suggested_selling_price && (
                                  <div>Selling Price: ₱{formatPrice(record.new_values.suggested_selling_price)}</div>
                                )}
                              </div>
                            )}
                            {record.action === 'INVENTORY_UPDATE' && record.old_values && record.new_values && (
                              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                {record.old_values.quantity !== record.new_values.quantity && (
                                  <div>Quantity: {record.old_values.quantity} → {record.new_values.quantity}</div>
                                )}
                                {record.old_values.unit_cost !== record.new_values.unit_cost && (
                                  <div>Cost: ₱{record.old_values.unit_cost} → ₱{record.new_values.unit_cost}</div>
                                )}
                              </div>
                            )}
                            {record.action === 'INVENTORY_DELETE' && record.old_values && (
                              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)' }}>
                                Deleted: {record.old_values.quantity} {record.old_values.unit}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unit Conversion Modal */}
      {showConversionModal && (
        <div className="modal-overlay" onClick={() => setShowConversionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ 
              padding: '20px 24px', 
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
                🔄 Convert Units
              </h2>
              <button
                onClick={() => setShowConversionModal(false)}
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
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <div className="alert alert-info" style={{ marginBottom: '20px', fontSize: '14px' }}>
                Convert larger units (BOX, BOT) to smaller units (PC). Example: 1 BOX of vitamins = 100 PC
              </div>

              <div className="form-group">
                <label>From Item (BOX/BOT) *</label>
                <select
                  value={conversionData.fromItemId}
                  onChange={(e) => setConversionData({...conversionData, fromItemId: e.target.value})}
                  required
                >
                  <option value="">Select item to convert from...</option>
                  {filteredInventory
                    .filter(item => ['BOX', 'BOT', 'box', 'bot'].includes(item.unit))
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.description} - {item.unit} (Qty: {formatQuantity(item.quantity)})
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>To Item (PC) *</label>
                <select
                  value={conversionData.toItemId}
                  onChange={(e) => setConversionData({...conversionData, toItemId: e.target.value})}
                  required
                >
                  <option value="">Select item to convert to...</option>
                  {filteredInventory
                    .filter(item => ['PC', 'pc', 'PCS', 'pcs'].includes(item.unit))
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.description} - {item.unit} (Qty: {formatQuantity(item.quantity)})
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Units per Box/Bottle *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={conversionData.unitsPerBox}
                  onChange={(e) => setConversionData({...conversionData, unitsPerBox: e.target.value})}
                  placeholder="e.g., 100 (1 BOX = 100 PC)"
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  How many pieces are in one box/bottle?
                </small>
              </div>

              <div className="form-group">
                <label>Boxes/Bottles to Convert *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={conversionData.boxesToConvert}
                  onChange={(e) => setConversionData({...conversionData, boxesToConvert: e.target.value})}
                  placeholder="e.g., 1"
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  How many boxes/bottles do you want to convert?
                </small>
              </div>

              {conversionData.unitsPerBox && conversionData.boxesToConvert && (
                <div className="alert alert-success" style={{ marginTop: '16px', fontSize: '14px' }}>
                  <strong>Result:</strong> {conversionData.boxesToConvert} × {conversionData.unitsPerBox} = {parseFloat(conversionData.boxesToConvert) * parseFloat(conversionData.unitsPerBox)} pieces will be added
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleConvertUnits}
                  disabled={!conversionData.fromItemId || !conversionData.toItemId || !conversionData.unitsPerBox || !conversionData.boxesToConvert}
                  style={{ flex: 1 }}
                >
                  Convert Units
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowConversionModal(false);
                    setConversionData({ fromItemId: '', toItemId: '', unitsPerBox: '', boxesToConvert: '' });
                  }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          fetchInventory();
          fetchInventoryHistory();
        }}
      />
    </div>
  );
}

export default Inventory;
