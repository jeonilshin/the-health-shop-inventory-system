import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatPrice, formatQuantity } from '../utils/formatNumber';
import { FiDollarSign, FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff, FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

function CostVariations() {
  const { user } = useContext(AuthContext);
  const [costVariations, setCostVariations] = useState([]);
  const [summary, setSummary] = useState([]);
  const [multiCostItems, setMultiCostItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewMode, setViewMode] = useState('multi-cost'); // 'multi-cost', 'summary', 'detailed', or 'by-location'
  const [selectedItem, setSelectedItem] = useState(null);
  const [inventoryByLocation, setInventoryByLocation] = useState([]);
  const [formData, setFormData] = useState({
    description: '',
    unit: '',
    cost_point_name: '',
    unit_cost: '',
    suggested_selling_price: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user.role === 'admin') {
      fetchMultiCostItems();
      fetchSummary();
      fetchCostVariations();
    }
  }, [user]);

  const fetchMultiCostItems = async () => {
    try {
      const response = await api.get('/cost-variations/multi-cost-items');
      setMultiCostItems(response.data);
    } catch (error) {
      console.error('Error fetching multi-cost items:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await api.get('/cost-variations/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching cost variations summary:', error);
    }
  };

  const fetchCostVariations = async () => {
    try {
      const response = await api.get('/cost-variations');
      setCostVariations(response.data);
    } catch (error) {
      console.error('Error fetching cost variations:', error);
    }
  };

  const fetchInventoryByLocation = async (description, unit) => {
    try {
      const response = await api.get(`/cost-variations/inventory-by-location/${encodeURIComponent(description)}/${encodeURIComponent(unit)}`);
      setInventoryByLocation(response.data);
      setSelectedItem({ description, unit });
      setViewMode('by-location');
    } catch (error) {
      console.error('Error fetching inventory by location:', error);
      alert('Error loading inventory by location');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        await api.put(`/cost-variations/${editingId}`, formData);
        alert('Cost point updated successfully!');
      } else {
        await api.post('/cost-variations', formData);
        alert('Cost point created successfully!');
      }
      
      setShowForm(false);
      setEditingId(null);
      setFormData({
        description: '',
        unit: '',
        cost_point_name: '',
        unit_cost: '',
        suggested_selling_price: ''
      });
      
      fetchMultiCostItems();
      fetchSummary();
      fetchCostVariations();
    } catch (error) {
      alert(error.response?.data?.error || 'Error saving cost point');
    }
  };

  const handleEdit = (variation) => {
    setEditingId(variation.id);
    setFormData({
      description: variation.description,
      unit: variation.unit,
      cost_point_name: variation.cost_point_name,
      unit_cost: variation.unit_cost,
      suggested_selling_price: variation.suggested_selling_price
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this cost point? This cannot be undone.')) return;
    
    try {
      await api.delete(`/cost-variations/${id}`);
      alert('Cost point deleted successfully!');
      fetchSummary();
      fetchCostVariations();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting cost point');
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      await api.put(`/cost-variations/${id}`, { is_active: !currentStatus });
      fetchSummary();
      fetchCostVariations();
    } catch (error) {
      alert(error.response?.data?.error || 'Error updating status');
    }
  };

  const filteredSummary = summary.filter(item =>
    item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.unit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMultiCostItems = multiCostItems.filter(item =>
    item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.unit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVariations = costVariations.filter(item =>
    item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.cost_point_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (user.role !== 'admin') {
    return (
      <div className="container">
        <div className="alert alert-warning">
          Access denied. Only administrators can view cost variations.
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiDollarSign size={32} color="#10b981" />
          <h2 style={{ margin: 0 }}>Costs</h2>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={`btn ${viewMode === 'multi-cost' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('multi-cost')}
          >
            Multi-Cost Items
          </button>
          <button
            className={`btn ${viewMode === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('summary')}
          >
            Cost Points
          </button>
          <button
            className={`btn ${viewMode === 'detailed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('detailed')}
          >
            All Points
          </button>
          {viewMode === 'by-location' && (
            <button
              className="btn btn-secondary"
              onClick={() => setViewMode('multi-cost')}
            >
              ← Back
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setFormData({
                description: '',
                unit: '',
                cost_point_name: '',
                unit_cost: '',
                suggested_selling_price: ''
              });
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FiPlus size={16} />
            Add Cost Point
          </button>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: '24px' }}>
        <strong>Multi-Cost Items:</strong> View items that have different purchase costs across different locations. This helps identify pricing inconsistencies and optimize purchasing decisions.
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <input
          type="text"
          className="form-control"
          placeholder="Search by item name, unit, or cost point name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h3>{editingId ? 'Edit Cost Point' : 'Add New Cost Point'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Item Description *</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  disabled={editingId}
                  placeholder="e.g., IMPEUOUS 10S"
                />
              </div>

              <div className="form-group">
                <label>Unit *</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                  disabled={editingId}
                  placeholder="e.g., BOX, BOTTLE, PACK"
                />
              </div>

              <div className="form-group">
                <label>Cost Point Name *</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.cost_point_name}
                  onChange={(e) => setFormData({ ...formData, cost_point_name: e.target.value })}
                  required
                  placeholder="e.g., Supplier A, Bulk Purchase, Regular Price"
                />
                <small style={{ color: '#6b7280' }}>
                  Give this cost point a descriptive name (e.g., "Supplier A", "Bulk Order", "Promo Price")
                </small>
              </div>

              <div className="form-group">
                <label>Unit Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                  required
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>Suggested Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={formData.suggested_selling_price}
                  onChange={(e) => setFormData({ ...formData, suggested_selling_price: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingId ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Cost Items View */}
      {viewMode === 'multi-cost' && (
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>Items with Multiple Costs Across Locations</h3>
          {filteredMultiCostItems.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
              No items with multiple costs found. All items have consistent pricing across locations.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Total Qty</th>
                  <th>Cost Range</th>
                  <th>Avg Cost</th>
                  <th>Selling Price Range</th>
                  <th>Location Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredMultiCostItems.map((item, idx) => (
                  <tr key={idx}>
                    <td><strong>{item.description}</strong></td>
                    <td>{item.unit}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#10b981' }}>
                        {formatQuantity(item.total_quantity)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {formatPrice(item.min_cost)}
                        <span style={{ color: '#6b7280' }}>→</span>
                        {formatPrice(item.max_cost)}
                        <span className="badge" style={{ 
                          backgroundColor: '#ef444420', 
                          color: '#ef4444',
                          marginLeft: '8px'
                        }}>
                          {item.cost_count} costs
                        </span>
                      </div>
                    </td>
                    <td>{formatPrice(item.avg_cost)}</td>
                    <td>
                      {item.min_selling_price && item.max_selling_price ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {formatPrice(item.min_selling_price)}
                          {item.min_selling_price !== item.max_selling_price && (
                            <>
                              <span style={{ color: '#6b7280' }}>→</span>
                              {formatPrice(item.max_selling_price)}
                            </>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#6b7280' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                        {item.locations.map((loc, locIdx) => (
                          <div
                            key={locIdx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '4px',
                              border: '1px solid #e5e7eb',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                              <span className="badge" style={{
                                backgroundColor: loc.location_type === 'warehouse' ? '#3b82f620' : '#10b98120',
                                color: loc.location_type === 'warehouse' ? '#3b82f6' : '#10b981',
                                fontSize: '10px'
                              }}>
                                {loc.location_type}
                              </span>
                              <span style={{ fontWeight: 500 }}>{loc.location_name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                              <span>Cost: {formatPrice(loc.unit_cost)}</span>
                              <span style={{ color: '#6b7280' }}>|</span>
                              <span>Price: {formatPrice(loc.suggested_selling_price)}</span>
                              <span style={{ color: '#6b7280' }}>|</span>
                              <span style={{ fontWeight: 600 }}>Qty: {formatQuantity(loc.quantity)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Summary View */}
      {viewMode === 'summary' && (
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>Cost Points Summary</h3>
          <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
            Track different purchase costs for the same item from various suppliers, bulk purchases, or promotional prices.
          </p>
          {filteredSummary.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
              No cost variations found. Add your first cost point to track different purchase prices.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Cost Points</th>
                  <th>Cost Range</th>
                  <th>Avg Cost</th>
                  <th>Selling Price Range</th>
                  <th>Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.map((item) => (
                  <tr key={`${item.description}-${item.unit}`}>
                    <td><strong>{item.description}</strong></td>
                    <td>{item.unit}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: '#3b82f620', color: '#3b82f6' }}>
                        {item.cost_point_count} {item.cost_point_count === 1 ? 'point' : 'points'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {formatPrice(item.min_cost)}
                        {item.min_cost !== item.max_cost && (
                          <>
                            <span style={{ color: '#6b7280' }}>→</span>
                            {formatPrice(item.max_cost)}
                          </>
                        )}
                      </div>
                    </td>
                    <td>{formatPrice(item.avg_cost)}</td>
                    <td>
                      {item.min_selling_price && item.max_selling_price ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {formatPrice(item.min_selling_price)}
                          {item.min_selling_price !== item.max_selling_price && (
                            <>
                              <span style={{ color: '#6b7280' }}>→</span>
                              {formatPrice(item.max_selling_price)}
                            </>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#6b7280' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                        {item.cost_points.map((cp, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              backgroundColor: cp.is_active ? '#f0fdf4' : '#f3f4f6',
                              borderRadius: '4px',
                              opacity: cp.is_active ? 1 : 0.6
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{cp.cost_point_name}</span>
                            <span>{formatPrice(cp.unit_cost)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => fetchInventoryByLocation(item.description, item.unit)}
                        style={{ fontSize: '12px' }}
                      >
                        View by Location
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Detailed View */}
      {viewMode === 'detailed' && (
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>All Cost Points</h3>
          {filteredVariations.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
              No cost points found.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Cost Point Name</th>
                  <th>Unit Cost</th>
                  <th>Selling Price</th>
                  <th>Margin</th>
                  <th>Status</th>
                  <th>In Use</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVariations.map((variation) => {
                  const margin = variation.suggested_selling_price && variation.unit_cost
                    ? ((variation.suggested_selling_price - variation.unit_cost) / variation.unit_cost * 100).toFixed(1)
                    : null;
                  
                  return (
                    <tr key={variation.id} style={{ opacity: variation.is_active ? 1 : 0.5 }}>
                      <td><strong>{variation.description}</strong></td>
                      <td>{variation.unit}</td>
                      <td>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#3b82f620', 
                          color: '#3b82f6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: 500
                        }}>
                          {variation.cost_point_name}
                        </span>
                      </td>
                      <td>{formatPrice(variation.unit_cost)}</td>
                      <td>
                        {variation.suggested_selling_price 
                          ? formatPrice(variation.suggested_selling_price)
                          : <span style={{ color: '#6b7280' }}>—</span>
                        }
                      </td>
                      <td>
                        {margin ? (
                          <span style={{ 
                            color: parseFloat(margin) > 0 ? '#10b981' : '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {parseFloat(margin) > 0 ? <FiTrendingUp size={14} /> : <FiTrendingDown size={14} />}
                            {margin}%
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className="badge" style={{
                          backgroundColor: variation.is_active ? '#10b98120' : '#6b728020',
                          color: variation.is_active ? '#10b981' : '#6b7280'
                        }}>
                          {variation.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {variation.locations_using > 0 ? (
                          <span style={{ color: '#10b981' }}>
                            {variation.locations_using} {variation.locations_using === 1 ? 'location' : 'locations'}
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>Not in use</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleToggleActive(variation.id, variation.is_active)}
                            title={variation.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {variation.is_active ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleEdit(variation)}
                          >
                            <FiEdit2 size={14} />
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(variation.id)}
                            disabled={variation.locations_using > 0}
                            title={variation.locations_using > 0 ? 'Cannot delete - in use' : 'Delete'}
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* By Location View */}
      {viewMode === 'by-location' && selectedItem && (
        <div className="card">
          <h3 style={{ marginBottom: '16px' }}>
            {selectedItem.description} ({selectedItem.unit}) - Inventory by Location
          </h3>
          {inventoryByLocation.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
              No inventory found for this item.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Unit Cost</th>
                  <th>Selling Price</th>
                  <th>Total Qty</th>
                  <th>Batches</th>
                  <th>Expiry Range</th>
                  <th>Batch Details</th>
                </tr>
              </thead>
              <tbody>
                {inventoryByLocation.map((loc, idx) => (
                  <tr key={idx}>
                    <td><strong>{loc.location_name}</strong></td>
                    <td>
                      <span className="badge" style={{
                        backgroundColor: loc.location_type === 'warehouse' ? '#3b82f620' : '#10b98120',
                        color: loc.location_type === 'warehouse' ? '#3b82f6' : '#10b981'
                      }}>
                        {loc.location_type}
                      </span>
                    </td>
                    <td>{formatPrice(loc.unit_cost)}</td>
                    <td>{formatPrice(loc.suggested_selling_price)}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#10b981' }}>
                        {formatQuantity(loc.total_quantity)}
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{ backgroundColor: '#f3f4f6', color: '#374151' }}>
                        {loc.batch_count} {loc.batch_count === 1 ? 'batch' : 'batches'}
                      </span>
                    </td>
                    <td>
                      {loc.earliest_expiry && loc.latest_expiry ? (
                        <div style={{ fontSize: '12px' }}>
                          <div>{new Date(loc.earliest_expiry).toLocaleDateString()}</div>
                          {loc.earliest_expiry !== loc.latest_expiry && (
                            <>
                              <span style={{ color: '#6b7280' }}>to</span>
                              <div>{new Date(loc.latest_expiry).toLocaleDateString()}</div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#6b7280' }}>No expiry</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                        {loc.batches.map((batch, bIdx) => (
                          <div
                            key={bIdx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '4px',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <span>
                              {batch.expiry_date 
                                ? new Date(batch.expiry_date).toLocaleDateString()
                                : 'No expiry'
                              }
                            </span>
                            <span style={{ fontWeight: 500, marginLeft: '8px' }}>
                              {formatQuantity(batch.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default CostVariations;
