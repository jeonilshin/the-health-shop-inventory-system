import { useState, useEffect } from 'react';
import api from '../utils/api';
import { FiX, FiPackage, FiTruck, FiAlertCircle, FiCheck } from 'react-icons/fi';
import AutocompleteSearch from './AutocompleteSearch';

function ExpressTransferModal({ isOpen, onClose, onTransferComplete, locations }) {
  const [step, setStep] = useState(1);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [warehouseInventory, setWarehouseInventory] = useState([]);

  const warehouses = locations.filter(loc => loc.type === 'warehouse');

  useEffect(() => {
    if (fromWarehouse) {
      fetchWarehouseInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromWarehouse]);

  const fetchWarehouseInventory = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/inventory/location/${fromWarehouse}`);
      setWarehouseInventory(response.data);
    } catch (error) {
      alert('Error loading inventory: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const response = await api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        const items = response.data.preview
          .filter(item => !item.is_category && item.description && item.unit)
          .map(item => {
            // Try to find matching item in warehouse inventory
            const match = warehouseInventory.find(inv => 
              inv.description.toLowerCase() === item.description.toLowerCase() &&
              inv.unit.toLowerCase() === item.unit.toLowerCase()
            );

            let error = null;
            if (!match) {
              error = 'Product not found in warehouse inventory';
            } else if (parseFloat(match.quantity) < parseFloat(item.quantity)) {
              error = `Insufficient quantity. Available: ${match.quantity}, Requested: ${item.quantity}`;
            }

            return {
              inventory_item_id: match?.id || null,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity || '',
              unit_cost: match?.unit_cost || 0,
              available: match?.quantity || 0,
              error: error,
              suggested: match || null
            };
          });

        setParsedData(items);
        setSelectedItems(items.filter(item => !item.error));
      }
    } catch (error) {
      alert('Error parsing file: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setSelectedItems([...selectedItems, { 
      inventory_item_id: null, 
      description: '', 
      unit: '', 
      quantity: '', 
      unit_cost: 0,
      available: 0
    }]);
  };

  const handleRemoveItem = (index) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleItemSelect = (index, item) => {
    const newItems = [...selectedItems];
    newItems[index] = {
      inventory_item_id: item.id,
      description: item.description,
      unit: item.unit,
      quantity: '',
      unit_cost: item.unit_cost,
      available: item.quantity
    };
    setSelectedItems(newItems);
  };

  const handleQuantityChange = (index, quantity) => {
    const newItems = [...selectedItems];
    newItems[index].quantity = quantity;
    setSelectedItems(newItems);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!fromWarehouse || !toWarehouse) {
        alert('Please select both source and destination warehouses');
        return;
      }
      if (fromWarehouse === toWarehouse) {
        alert('Source and destination warehouses must be different');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedItems.length === 0) {
        alert('Please add at least one item');
        return;
      }
      
      // Validate all items
      for (const item of selectedItems) {
        if (!item.inventory_item_id) {
          alert('Please select an item for all rows');
          return;
        }
        if (!item.quantity || parseFloat(item.quantity) <= 0) {
          alert('Please enter valid quantities for all items');
          return;
        }
        if (parseFloat(item.quantity) > parseFloat(item.available)) {
          alert(`Insufficient quantity for ${item.description}. Available: ${item.available}`);
          return;
        }
      }
      
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const transfer = {
        from_location_id: parseInt(fromWarehouse),
        to_location_id: parseInt(toWarehouse),
        notes: `Express Transfer - ${new Date().toLocaleDateString()} - Warehouse to Warehouse`,
        items: selectedItems.map(item => ({
          inventory_item_id: item.inventory_item_id,
          quantity: parseFloat(item.quantity),
          description: item.description,
          unit: item.unit,
          unit_cost: item.unit_cost
        }))
      };

      const response = await api.post('/transfers/batch', { transfers: [transfer] });
      
      if (response.data.success) {
        alert(`Express transfer created successfully!\n${selectedItems.length} items transferred.`);
        onTransferComplete();
        handleClose();
      } else {
        throw new Error('Transfer failed');
      }
    } catch (error) {
      alert('Error creating transfer: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setFromWarehouse('');
    setToWarehouse('');
    setSelectedItems([]);
    setFile(null);
    setParsedData([]);
    setWarehouseInventory([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh' }}>
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiTruck size={20} />
              Express Transfer (Warehouse to Warehouse)
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9 }}>
              Step {step} of 3: {step === 1 ? 'Select Warehouses' : step === 2 ? 'Select Items' : 'Review & Transfer'}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{ 
              background: 'rgba(255, 255, 255, 0.2)', 
              border: 'none', 
              color: 'white', 
              width: '32px', 
              height: '32px', 
              borderRadius: 'var(--radius)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FiX size={20} />
          </button>
        </div>

        <div style={{ padding: '24px', maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          {/* Step 1: Select Warehouses */}
          {step === 1 && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                <FiAlertCircle size={16} />
                Select source and destination warehouses for express transfer
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>From Warehouse (Source) *</label>
                  <select
                    value={fromWarehouse}
                    onChange={(e) => setFromWarehouse(e.target.value)}
                    required
                  >
                    <option value="">Select source warehouse</option>
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>To Warehouse (Destination) *</label>
                  <select
                    value={toWarehouse}
                    onChange={(e) => setToWarehouse(e.target.value)}
                    required
                  >
                    <option value="">Select destination warehouse</option>
                    {warehouses.filter(wh => wh.id !== parseInt(fromWarehouse)).map(wh => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Select Items */}
          {step === 2 && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                <FiAlertCircle size={16} />
                Add items to transfer from {warehouses.find(w => w.id === parseInt(fromWarehouse))?.name} to {warehouses.find(w => w.id === parseInt(toWarehouse))?.name}
              </div>

              {/* File Upload Option */}
              <div style={{ 
                padding: '16px', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: 'var(--radius)', 
                marginBottom: '20px',
                border: '2px dashed var(--border)'
              }}>
                <h4 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiPackage size={16} />
                  Upload CSV/Excel File (Optional)
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Upload a file with the same format as CDR import: Brand, Description, UoM, Quantity
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  style={{ marginBottom: '8px' }}
                />
                {file && (
                  <div style={{ fontSize: '13px', color: 'var(--success)', marginTop: '8px' }}>
                    ✓ File uploaded: {file.name} - {parsedData.length} items found
                    {parsedData.filter(item => item.error).length > 0 && (
                      <span style={{ color: 'var(--warning)', marginLeft: '8px' }}>
                        ({parsedData.filter(item => item.error).length} errors)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></div>
                  <p>Processing...</p>
                </div>
              ) : (
                <>
                  {/* Show parsed items with errors */}
                  {parsedData.length > 0 && parsedData.filter(item => item.error).length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ color: 'var(--warning)', marginBottom: '12px' }}>
                        Items with Errors ({parsedData.filter(item => item.error).length})
                      </h4>
                      {parsedData.filter(item => item.error).map((item, index) => (
                        <div key={`error-${index}`} style={{ 
                          padding: '12px', 
                          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                          borderRadius: 'var(--radius)', 
                          marginBottom: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                            {item.description} ({item.unit}) - Qty: {item.quantity}
                          </div>
                          <div style={{ fontSize: '13px', color: '#ef4444' }}>
                            ⚠️ {item.error}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Manual item selection */}
                  <h4 style={{ marginBottom: '12px' }}>
                    {parsedData.length > 0 ? 'Valid Items' : 'Add Items Manually'}
                  </h4>

                  {selectedItems.map((item, index) => (
                    <div key={index} style={{ 
                      padding: '16px', 
                      backgroundColor: item.suggested ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)', 
                      borderRadius: 'var(--radius)', 
                      marginBottom: '12px',
                      border: item.suggested ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Search Item *</label>
                          {item.suggested ? (
                            <div style={{ 
                              padding: '8px 12px', 
                              backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                              borderRadius: 'var(--radius)',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              <div style={{ fontWeight: '600' }}>{item.description}</div>
                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                {item.unit} - Available: {item.available}
                              </div>
                            </div>
                          ) : (
                            <>
                              <AutocompleteSearch
                                locationId={fromWarehouse}
                                placeholder="Search for product..."
                                onSelect={(invItem) => handleItemSelect(index, invItem)}
                              />
                              {item.description && (
                                <div style={{ 
                                  marginTop: '8px', 
                                  padding: '8px', 
                                  backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                                  borderRadius: 'var(--radius)',
                                  fontSize: '13px',
                                  color: 'var(--primary)'
                                }}>
                                  Selected: {item.description} ({item.unit}) - Available: {item.available}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Quantity *</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max={item.available || undefined}
                            value={item.quantity}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            placeholder={item.available ? `Max: ${item.available}` : 'Select item first'}
                            disabled={!item.inventory_item_id}
                            required
                          />
                        </div>

                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleRemoveItem(index)}
                          style={{ padding: '8px 12px' }}
                        >
                          <FiX size={16} />
                        </button>
                      </div>

                      {item.quantity && parseFloat(item.quantity) > parseFloat(item.available) && (
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
                    onClick={handleAddItem}
                    style={{ marginTop: '12px' }}
                  >
                    <FiPackage size={16} />
                    Add Item
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                <FiCheck size={16} />
                Review transfer details before submitting
              </div>

              <div style={{ 
                padding: '16px', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: 'var(--radius)',
                marginBottom: '20px'
              }}>
                <h4 style={{ margin: '0 0 12px 0' }}>Transfer Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <strong>From:</strong> {warehouses.find(w => w.id === parseInt(fromWarehouse))?.name}
                  </div>
                  <div>
                    <strong>To:</strong> {warehouses.find(w => w.id === parseInt(toWarehouse))?.name}
                  </div>
                  <div>
                    <strong>Total Items:</strong> {selectedItems.length}
                  </div>
                  <div>
                    <strong>Total Value:</strong> ₱{selectedItems.reduce((sum, item) => 
                      sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0)), 0
                    ).toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th style={{ padding: '12px 8px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left' }}>Unit</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Quantity</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 8px', fontWeight: '600' }}>{item.description}</td>
                        <td style={{ padding: '12px 8px' }}>{item.unit}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>₱{parseFloat(item.unit_cost).toFixed(2)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600' }}>
                          ₱{(parseFloat(item.quantity) * parseFloat(item.unit_cost)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ 
          padding: '16px 24px', 
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 1 && (
              <button 
                className="btn btn-secondary" 
                onClick={handleBack}
                disabled={loading}
              >
                Back
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            {step < 3 ? (
              <button 
                className="btn btn-primary" 
                onClick={handleNext}
                disabled={loading}
              >
                Next
              </button>
            ) : (
              <button 
                className="btn btn-success" 
                onClick={handleSubmit}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <FiCheck size={16} />
                    Create Transfer
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpressTransferModal;
