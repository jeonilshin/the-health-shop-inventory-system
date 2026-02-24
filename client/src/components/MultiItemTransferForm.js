import { useState } from 'react';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiPlus, FiX, FiCheck, FiAlertCircle, FiPackage } from 'react-icons/fi';

function MultiItemTransferForm({ 
  locations, 
  inventory, 
  loading, 
  userLocationId, 
  onSubmit, 
  onCancel,
  onLocationChange 
}) {
  const [formData, setFormData] = useState({
    from_location_id: userLocationId || '',
    to_location_id: '',
    notes: '',
    items: [{ inventory_item_id: '', quantity: '', selectedItem: null }]
  });

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { inventory_item_id: '', quantity: '', selectedItem: null }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    
    // If changing inventory item, update selected item details
    if (field === 'inventory_item_id' && value) {
      const item = inventory.find(inv => inv.id === parseInt(value));
      newItems[index].selectedItem = item;
      newItems[index].quantity = ''; // Reset quantity when item changes
    }
    
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
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        alert('Please enter valid quantities for all items');
        return;
      }
      if (parseFloat(item.quantity) > parseFloat(item.selectedItem.quantity)) {
        alert(`Insufficient quantity for ${item.selectedItem.description}. Available: ${item.selectedItem.quantity}`);
        return;
      }
    }
    
    // Submit each item as a separate transfer
    try {
      for (const item of formData.items) {
        await onSubmit({
          from_location_id: formData.from_location_id,
          to_location_id: formData.to_location_id,
          description: item.selectedItem.description,
          unit: item.selectedItem.unit,
          quantity: item.quantity,
          unit_cost: item.selectedItem.unit_cost,
          notes: formData.notes
        });
      }
      alert(`Successfully created ${formData.items.length} transfer(s)!`);
      onCancel(); // Close form
    } catch (error) {
      // Error already handled in parent
    }
  };

  const handleFromLocationChange = (e) => {
    const newFromLocation = e.target.value;
    setFormData({ 
      ...formData, 
      from_location_id: newFromLocation,
      items: [{ inventory_item_id: '', quantity: '', selectedItem: null }] // Reset items
    });
    onLocationChange(newFromLocation);
  };

  const getTotalValue = () => {
    return formData.items.reduce((sum, item) => {
      if (item.selectedItem && item.quantity) {
        return sum + (parseFloat(item.quantity) * parseFloat(item.selectedItem.unit_cost));
      }
      return sum;
    }, 0);
  };

  return (
    <form onSubmit={handleSubmit} style={{ 
      marginBottom: '20px', 
      padding: '24px', 
      backgroundColor: 'var(--bg-primary)', 
      borderRadius: 'var(--radius-md)', 
      border: '2px solid var(--border)' 
    }}>
      <h4 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FiPackage size={18} />
        Create Multi-Item Transfer
      </h4>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className="form-group">
          <label>From Location (Source)</label>
          <select
            value={formData.from_location_id}
            onChange={handleFromLocationChange}
            disabled={userLocationId}
            required
          >
            <option value="">Select source location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.type})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>To Location (Destination)</label>
          <select
            value={formData.to_location_id}
            onChange={(e) => setFormData({ ...formData, to_location_id: e.target.value })}
            required
          >
            <option value="">Select destination location</option>
            {locations.filter(loc => loc.id !== parseInt(formData.from_location_id)).map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {formData.from_location_id && (
        <>
          <h5 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiPackage size={16} />
            Items to Transfer
          </h5>
          
          {loading ? (
            <div className="spinner" style={{ width: '24px', height: '24px', margin: '20px 0' }}></div>
          ) : inventory.length === 0 ? (
            <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
              <FiAlertCircle size={16} />
              No inventory items available at this location
            </div>
          ) : (
            <>
              {formData.items.map((item, index) => (
                <div key={index} style={{ 
                  padding: '16px', 
                  backgroundColor: 'var(--bg-secondary)', 
                  borderRadius: 'var(--radius)', 
                  marginBottom: '12px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Select Item</label>
                      <select
                        value={item.inventory_item_id}
                        onChange={(e) => updateItem(index, 'inventory_item_id', e.target.value)}
                        required
                      >
                        <option value="">Select an item</option>
                        {inventory.map((invItem) => (
                          <option key={invItem.id} value={invItem.id}>
                            {invItem.description} - {formatQuantity(invItem.quantity)} {invItem.unit} @ ₱{formatPrice(invItem.unit_cost)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Quantity</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={item.selectedItem ? item.selectedItem.quantity : undefined}
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        placeholder={item.selectedItem ? `Max: ${item.selectedItem.quantity}` : 'Select item first'}
                        disabled={!item.selectedItem}
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
                        Remove
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        <div>
                          <strong>Available:</strong> <span style={{ color: 'var(--success)' }}>{formatQuantity(item.selectedItem.quantity)} {item.selectedItem.unit}</span>
                        </div>
                        <div>
                          <strong>Unit Cost:</strong> ₱{formatPrice(item.selectedItem.unit_cost)}
                        </div>
                        {item.quantity && (
                          <div>
                            <strong>Subtotal:</strong> <span style={{ fontWeight: 600 }}>₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.selectedItem.unit_cost))}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {item.selectedItem && item.quantity && parseFloat(item.quantity) > parseFloat(item.selectedItem.quantity) && (
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
                <FiPlus size={16} />
                Add Another Item
              </button>

              {getTotalValue() > 0 && (
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
                      ₱{formatPrice(getTotalValue())}
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

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="submit" 
                  className="btn btn-success"
                  disabled={loading || formData.items.some(i => !i.selectedItem || !i.quantity)}
                >
                  <FiCheck size={16} />
                  Create {formData.items.length} Transfer(s)
                </button>
                <button 
                  type="button" 
                  className="btn"
                  onClick={onCancel}
                >
                  <FiX size={16} />
                  Cancel
                </button>
              </div>
            </>
          )}
        </>
      )}
    </form>
  );
}

export default MultiItemTransferForm;
