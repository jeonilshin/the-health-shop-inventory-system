import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiPackage, FiPlus, FiDownload, FiSearch, FiAlertCircle, FiTrash2, FiUpload, FiEdit2, FiX, FiCheck } from 'react-icons/fi';
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
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [formData, setFormData] = useState({
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    suggested_selling_price: '',
    expiry_date: '',
    batch_number: ''
  });

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await fetchLocations();
      await fetchInventoryHistory();
      setLoading(false);
    };
    initializeData();
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
      setInventory(response.data);
      setFilteredInventory(response.data);
      
      // Extract unique categories
      const categories = new Set();
      response.data.forEach(item => {
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
  }, [searchTerm, inventory, sortBy, sortOrder, selectedCategory, expiryFilter]);

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
      await api.post('/inventory', {
        location_id: selectedLocation,
        ...formData
      });
      setShowForm(false);
      setFormData({
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        suggested_selling_price: '',
        expiry_date: '',
        batch_number: ''
      });
      fetchInventory();
      fetchInventoryHistory(); // Refresh history
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding inventory');
    }
  };

  const handleDescriptionSelect = (item) => {
    // Auto-fill all fields except quantity and expiry_date
    setFormData({
      ...formData,
      description: item.description,
      unit: item.unit,
      unit_cost: item.unit_cost || '',
      suggested_selling_price: item.suggested_selling_price || '',
      batch_number: item.batch_number || '',
      // Keep quantity and expiry_date empty for user input
      quantity: '',
      expiry_date: ''
    });
  };

  const handleBatchNumberSelect = (item) => {
    // When batch number is selected, auto-fill related fields
    setFormData({
      ...formData,
      batch_number: item.batch_number,
      description: item.description,
      unit: item.unit,
      unit_cost: item.unit_cost || '',
      suggested_selling_price: item.suggested_selling_price || '',
      // Keep quantity and expiry_date empty for user input
      quantity: '',
      expiry_date: ''
    });
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

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditData({
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      suggested_selling_price: item.suggested_selling_price,
      expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
      batch_number: item.batch_number
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/inventory/${id}`, editData);
      alert('Inventory updated successfully!');
      setEditingId(null);
      setEditData({});
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error updating inventory');
    }
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
                const totalItems = locationInventory.length;
                const totalValue = locationInventory.reduce((sum, item) => 
                  sum + (parseFloat(item.quantity) * parseFloat(item.unit_cost)), 0
                );
                const lowStock = locationInventory.filter(item => parseFloat(item.quantity) < 10).length;
                
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
                          Total Items
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
                      {lowStock > 0 && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ 
                            padding: '8px 12px', 
                            background: 'rgba(239, 68, 68, 0.1)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '12px',
                            color: 'var(--danger)',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <FiAlertCircle size={14} />
                            {lowStock} item{lowStock > 1 ? 's' : ''} low stock
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
              </div>
            </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto auto', gap: '12px', alignItems: 'center' }}>
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
              value={expiryFilter} 
              onChange={(e) => setExpiryFilter(e.target.value)}
              style={{ minWidth: '160px' }}
            >
              <option value="all">All Items</option>
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

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Description *</label>
                <SimpleAutocomplete
                  items={inventoryHistory}
                  value={formData.description}
                  onChange={(value) => setFormData({ ...formData, description: value })}
                  onSelect={handleDescriptionSelect}
                  displayField="description"
                  placeholder="Start typing to search..."
                  required={true}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Unit *</label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g., kg, pcs, box"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Unit Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Suggested Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.suggested_selling_price}
                  onChange={(e) => setFormData({ ...formData, suggested_selling_price: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Batch Number</label>
                <SimpleAutocomplete
                  items={inventoryHistory.filter(item => item.batch_number)}
                  value={formData.batch_number}
                  onChange={(value) => setFormData({ ...formData, batch_number: value })}
                  onSelect={handleBatchNumberSelect}
                  displayField="batch_number"
                  placeholder="Start typing batch number..."
                  required={false}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Expiry Date</label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-success" style={{ marginTop: '16px' }}>
              <FiPlus size={16} />
              Add to Inventory
            </button>
          </form>
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
                            <span className={`badge ${parseFloat(item.quantity) < 10 ? 'badge-danger' : 'badge-success'}`}>
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
                    const isEditing = editingId === item.id;
                    const expiryDate = item.expiry_date ? new Date(item.expiry_date) : null;
                    const today = new Date();
                    const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : null;
                    const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                    
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.description}
                              onChange={(e) => setEditData({...editData, description: e.target.value})}
                              style={{ width: '100%', padding: '4px' }}
                            />
                          ) : (
                            item.description
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.unit}
                              onChange={(e) => setEditData({...editData, unit: e.target.value})}
                              style={{ width: '80px', padding: '4px' }}
                            />
                          ) : (
                            item.unit
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editData.quantity}
                              onChange={(e) => setEditData({...editData, quantity: e.target.value})}
                              style={{ width: '80px', padding: '4px' }}
                            />
                          ) : (
                            <span className={`badge ${parseFloat(item.quantity) < 10 ? 'badge-danger' : 'badge-success'}`}>
                              {formatQuantity(item.quantity)}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.batch_number}
                              onChange={(e) => setEditData({...editData, batch_number: e.target.value})}
                              style={{ width: '100px', padding: '4px' }}
                            />
                          ) : (
                            item.batch_number || '-'
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input 
                              type="date" 
                              value={editData.expiry_date}
                              onChange={(e) => setEditData({...editData, expiry_date: e.target.value})}
                              style={{ width: '140px', padding: '4px' }}
                            />
                          ) : expiryDate ? (
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
                            <td>
                              {isEditing ? (
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={editData.unit_cost}
                                  onChange={(e) => setEditData({...editData, unit_cost: e.target.value})}
                                  style={{ width: '100px', padding: '4px' }}
                                />
                              ) : (
                                `₱${formatPrice(item.unit_cost)}`
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={editData.suggested_selling_price}
                                  onChange={(e) => setEditData({...editData, suggested_selling_price: e.target.value})}
                                  style={{ width: '100px', padding: '4px' }}
                                />
                              ) : (
                                `₱${formatPrice(item.suggested_selling_price || 0)}`
                              )}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {isEditing ? (
                                `₱${formatPrice(parseFloat(editData.quantity || 0) * parseFloat(editData.unit_cost || 0))}`
                              ) : (
                                `₱${formatPrice(parseFloat(item.quantity) * parseFloat(item.unit_cost))}`
                              )}
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
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    onClick={() => handleSaveEdit(item.id)}
                                    title="Save"
                                  >
                                    <FiCheck size={14} />
                                  </button>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    onClick={handleCancelEdit}
                                    title="Cancel"
                                  >
                                    <FiX size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    onClick={() => handleEdit(item)}
                                    title="Edit"
                                  >
                                    <FiEdit2 size={12} />
                                  </button>
                                  <button
                                    className="btn btn-danger"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    onClick={() => handleDeleteInventory(item.id)}
                                  >
                                    <FiTrash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
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
