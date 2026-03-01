import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { FiPlus, FiEdit2, FiTrash2, FiRefreshCw } from 'react-icons/fi';

function UnitConversions() {
  const [conversions, setConversions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    product_description: '',
    base_unit: '',
    converted_unit: '',
    conversion_factor: ''
  });

  useEffect(() => {
    fetchConversions();
  }, []);

  const fetchConversions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/unit-conversions');
      setConversions(response.data);
    } catch (error) {
      showToast('Error fetching unit conversions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingId) {
        await api.put(`/unit-conversions/${editingId}`, {
          conversion_factor: parseFloat(formData.conversion_factor)
        });
        showToast('Unit conversion updated successfully', 'success');
      } else {
        await api.post('/unit-conversions', {
          ...formData,
          conversion_factor: parseFloat(formData.conversion_factor)
        });
        showToast('Unit conversion created successfully', 'success');
      }

      resetForm();
      fetchConversions();
    } catch (error) {
      showToast(error.response?.data?.error || 'Error saving unit conversion', 'error');
    }
  };

  const handleEdit = (conversion) => {
    setFormData({
      product_description: conversion.product_description,
      base_unit: conversion.base_unit,
      converted_unit: conversion.converted_unit,
      conversion_factor: conversion.conversion_factor
    });
    setEditingId(conversion.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this unit conversion?')) {
      return;
    }

    try {
      await api.delete(`/unit-conversions/${id}`);
      showToast('Unit conversion deleted successfully', 'success');
      fetchConversions();
    } catch (error) {
      showToast(error.response?.data?.error || 'Error deleting unit conversion', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      product_description: '',
      base_unit: '',
      converted_unit: '',
      conversion_factor: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Group conversions by product
  const groupedConversions = conversions.reduce((acc, conv) => {
    if (!acc[conv.product_description]) {
      acc[conv.product_description] = [];
    }
    acc[conv.product_description].push(conv);
    return acc;
  }, {});

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiRefreshCw size={32} color="#3b82f6" />
          <h2 style={{ margin: 0 }}>Unit Conversions</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <FiPlus size={16} />
          {showForm ? 'Cancel' : 'Add Conversion'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3>{editingId ? 'Edit Unit Conversion' : 'Add Unit Conversion'}</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label>Product Description *</label>
                <input
                  type="text"
                  value={formData.product_description}
                  onChange={(e) => setFormData({ ...formData, product_description: e.target.value })}
                  required
                  disabled={editingId !== null}
                  placeholder="e.g., Paracetamol"
                />
              </div>

              <div className="form-group">
                <label>Base Unit *</label>
                <input
                  type="text"
                  value={formData.base_unit}
                  onChange={(e) => setFormData({ ...formData, base_unit: e.target.value })}
                  required
                  disabled={editingId !== null}
                  placeholder="e.g., box"
                />
              </div>

              <div className="form-group">
                <label>Converted Unit *</label>
                <input
                  type="text"
                  value={formData.converted_unit}
                  onChange={(e) => setFormData({ ...formData, converted_unit: e.target.value })}
                  required
                  disabled={editingId !== null}
                  placeholder="e.g., pack"
                />
              </div>

              <div className="form-group">
                <label>Conversion Factor *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.conversion_factor}
                  onChange={(e) => setFormData({ ...formData, conversion_factor: e.target.value })}
                  required
                  placeholder="e.g., 50"
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  1 {formData.base_unit || 'base unit'} = {formData.conversion_factor || '?'} {formData.converted_unit || 'converted units'}
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Create'} Conversion
              </button>
              <button type="button" className="btn" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Conversions List */}
      <div className="card">
        <h3>Configured Conversions</h3>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner"></div>
          </div>
        ) : conversions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiRefreshCw />
            </div>
            <h3>No Unit Conversions</h3>
            <p>Add unit conversions to enable selling products in different units</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <FiPlus size={16} />
              Add First Conversion
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {Object.entries(groupedConversions).map(([product, productConversions]) => (
              <div key={product} style={{ 
                padding: '16px', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)'
              }}>
                <h4 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--primary)' }}>
                  {product}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {productConversions.map((conv) => (
                    <div key={conv.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>
                          1 {conv.base_unit} = {conv.conversion_factor} {conv.converted_unit}
                        </span>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Created: {new Date(conv.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-sm"
                          onClick={() => handleEdit(conv)}
                          title="Edit conversion factor"
                        >
                          <FiEdit2 size={14} />
                        </button>
                        <button 
                          className="btn btn-sm"
                          onClick={() => handleDelete(conv.id)}
                          style={{ color: '#ef4444' }}
                          title="Delete conversion"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="card" style={{ marginTop: '24px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
        <h4 style={{ marginTop: 0, color: '#3b82f6' }}>How Unit Conversions Work</h4>
        <ul style={{ marginBottom: 0, paddingLeft: '20px' }}>
          <li>Define how larger units break down into smaller units</li>
          <li>Example: 1 box = 50 packs, 1 pack = 10 pieces</li>
          <li>When selling, you can choose to sell in any configured unit</li>
          <li>System automatically tracks inventory in the base unit</li>
          <li>Useful for wholesale to retail conversions</li>
        </ul>
      </div>
    </div>
  );
}

export default UnitConversions;
