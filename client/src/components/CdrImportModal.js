import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { FiX, FiCheck, FiAlertCircle, FiEdit2, FiTruck, FiSearch } from 'react-icons/fi';
import SimpleAutocomplete from './SimpleAutocomplete';

function CdrImportModal({ isOpen, onClose, onImportComplete, locations }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Select Warehouse, 3: Review & Fix
  const [file, setFile] = useState(null);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [cdrData, setCdrData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editData, setEditData] = useState({});
  const [warehouseInventory, setWarehouseInventory] = useState([]);

  // Branch mapping - maps CDR outlet names to actual branch names
  const branchMapping = {
    'KCC GENSAN': 'THS - Gensan KCC',
    'LGD': null // Ignore LGD entries
  };

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setStep(1);
      setFile(null);
      setFromWarehouse('');
      setCdrData([]);
      setErrors([]);
      setEditingIndex(null);
      setEditData({});
      setWarehouseInventory([]);
    }
  }, [isOpen]);

  const handleFileUpload = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      alert('Please select a valid CSV file');
    }
  };

  const parseCdrFile = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n');
      
      // Find the header row (should contain DATE, OUTLET, etc.)
      let headerIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('DATE') && lines[i].includes('OUTLET') && lines[i].includes('ITEM DESCRIPTION')) {
          headerIndex = i;
          break;
        }
      }

      if (headerIndex === -1) {
        throw new Error('Invalid CDR format: Could not find header row');
      }

      const headers = lines[headerIndex].split(',').map(h => h.trim());
      const dataLines = lines.slice(headerIndex + 1).filter(line => line.trim() && !line.startsWith(','));

      const parsedData = [];

      for (let i = 0; i < dataLines.length; i++) {
        const values = dataLines[i].split(',').map(v => v.trim());
        
        if (values.length < headers.length) continue; // Skip incomplete rows

        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Skip empty rows or rows without essential data
        if (!row['OUTLET'] || !row['ITEM DESCRIPTION'] || !row['QUANTITY']) continue;

        // Skip LGD entries
        if (row['OUTLET'] === 'LGD') continue;

        // Map outlet to branch
        const mappedBranch = branchMapping[row['OUTLET']];
        if (mappedBranch === null) continue; // Skip ignored outlets

        const item = {
          originalIndex: i,
          date: row['DATE'],
          outlet: row['OUTLET'],
          mappedBranch: mappedBranch || row['OUTLET'], // Use mapped name or original
          brand: row['BRAND'],
          description: row['ITEM DESCRIPTION'],
          unit: row['UoM'],
          quantity: parseInt(row['QUANTITY']) || 0,
          remarks: row['REMARKS'] || '',
          error: null,
          suggested: null
        };

        parsedData.push(item);
      }

      setCdrData(parsedData);
      setStep(2);
    } catch (error) {
      alert('Error parsing CDR file: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const validateAndSuggestProducts = async () => {
    if (!fromWarehouse) {
      alert('Please select a warehouse first');
      return;
    }

    setLoading(true);
    try {
      // Get inventory from selected warehouse
      const response = await api.get(`/inventory/location/${fromWarehouse}`);
      const warehouseInventory = response.data;
      setWarehouseInventory(warehouseInventory); // Store for search functionality

      const updatedData = cdrData.map(item => {
        // Try to find exact match first
        let match = warehouseInventory.find(inv => 
          inv.description.toLowerCase() === item.description.toLowerCase() &&
          inv.unit.toLowerCase() === item.unit.toLowerCase()
        );

        if (!match) {
          // Try partial match on description
          match = warehouseInventory.find(inv => 
            inv.description.toLowerCase().includes(item.description.toLowerCase()) ||
            item.description.toLowerCase().includes(inv.description.toLowerCase())
          );
        }

        if (!match) {
          // Try fuzzy match (remove common words and check)
          const cleanDescription = item.description.toLowerCase()
            .replace(/\b(the|and|or|with|w\/|mg|ml|g|s|capsule|tablet|bottle|box|pack)\b/g, '')
            .trim();
          
          match = warehouseInventory.find(inv => {
            const cleanInvDesc = inv.description.toLowerCase()
              .replace(/\b(the|and|or|with|w\/|mg|ml|g|s|capsule|tablet|bottle|box|pack)\b/g, '')
              .trim();
            return cleanInvDesc.includes(cleanDescription) || cleanDescription.includes(cleanInvDesc);
          });
        }

        return {
          ...item,
          error: !match ? 'Product not found in warehouse inventory' : null,
          suggested: match || null
        };
      });

      setCdrData(updatedData);
      setErrors(updatedData.filter(item => item.error));
      setStep(3);
    } catch (error) {
      alert('Error validating products: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (index) => {
    setEditingIndex(index);
    setEditData({
      description: cdrData[index].description,
      unit: cdrData[index].unit,
      quantity: cdrData[index].quantity,
      searchText: cdrData[index].description
    });
  };

  const saveEdit = () => {
    const updatedData = [...cdrData];
    updatedData[editingIndex] = {
      ...updatedData[editingIndex],
      description: editData.description,
      unit: editData.unit,
      quantity: parseInt(editData.quantity) || 0,
      error: null, // Clear error after edit
      suggested: null // Will need re-validation
    };
    setCdrData(updatedData);
    setEditingIndex(null);
    setEditData({});
  };

  const handleProductSelect = (selectedProduct) => {
    setEditData({
      ...editData,
      description: selectedProduct.description,
      unit: selectedProduct.unit,
      searchText: selectedProduct.description
    });
    
    // Auto-apply the selection
    const updatedData = [...cdrData];
    updatedData[editingIndex] = {
      ...updatedData[editingIndex],
      description: selectedProduct.description,
      unit: selectedProduct.unit,
      suggested: selectedProduct,
      error: null
    };
    setCdrData(updatedData);
    setErrors(updatedData.filter(item => item.error));
  };

  const selectSuggestion = (index, suggestion) => {
    const updatedData = [...cdrData];
    updatedData[index] = {
      ...updatedData[index],
      description: suggestion.description,
      unit: suggestion.unit,
      suggested: suggestion,
      error: null
    };
    setCdrData(updatedData);
    
    // Update errors list
    setErrors(updatedData.filter(item => item.error));
  };

  const processCdrImport = async () => {
    const validItems = cdrData.filter(item => !item.error && item.suggested);
    
    if (validItems.length === 0) {
      alert('No valid items to import');
      return;
    }

    setLoading(true);
    try {
      // Group items by branch
      const itemsByBranch = {};
      validItems.forEach(item => {
        if (!itemsByBranch[item.mappedBranch]) {
          itemsByBranch[item.mappedBranch] = [];
        }
        itemsByBranch[item.mappedBranch].push(item);
      });

      // Prepare transfers array for batch API
      const transfers = [];

      for (const [branchName, items] of Object.entries(itemsByBranch)) {
        // Find branch location
        const branch = locations.find(loc => 
          loc.name.toLowerCase().includes(branchName.toLowerCase()) ||
          branchName.toLowerCase().includes(loc.name.toLowerCase())
        );

        if (!branch) {
          alert(`Branch not found: ${branchName}`);
          continue;
        }

        transfers.push({
          from_location_id: fromWarehouse,
          to_location_id: branch.id,
          notes: `CDR Import - ${new Date().toLocaleDateString()} - ${branchName}`,
          items: items.map(item => ({
            inventory_item_id: item.suggested.id,
            quantity: item.quantity,
            description: item.description,
            unit: item.unit,
            unit_cost: item.suggested.unit_cost
          }))
        });
      }

      // Call batch transfer API
      const response = await api.post('/transfers/batch', { transfers });
      
      if (response.data.success) {
        const { results, errors } = response.data;
        let message = `CDR import completed!\n${results.length} transfers created successfully.`;
        
        if (errors.length > 0) {
          message += `\n${errors.length} errors occurred:\n${errors.slice(0, 5).join('\n')}`;
          if (errors.length > 5) {
            message += `\n... and ${errors.length - 5} more errors.`;
          }
        }
        
        alert(message);
        onImportComplete();
      } else {
        throw new Error('Batch transfer failed');
      }
    } catch (error) {
      alert('Error processing CDR import: ' + (error.response?.data?.error || error.message));
      console.error('CDR Import Error:', error.response?.data || error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh' }}>
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiTruck size={20} />
              Import CDR (Consignment Delivery Receipt)
            </h2>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
              Step {step} of 3: {step === 1 ? 'Upload File' : step === 2 ? 'Select Warehouse' : 'Review & Import'}
            </div>
          </div>
          <button
            onClick={onClose}
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

        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
          {step === 1 && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                <FiAlertCircle size={16} />
                Upload your CDR CSV file. The system will automatically map outlet names to branches and validate products.
              </div>

              <div className="form-group">
                <label>Select CDR CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  style={{ width: '100%' }}
                />
              </div>

              {file && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                    <strong>Selected file:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                  
                  <button 
                    className="btn btn-primary" 
                    onClick={parseCdrFile}
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    {loading ? 'Parsing...' : 'Parse CDR File'}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                <FiCheck size={16} />
                Found {cdrData.length} items in CDR file. Now select the source warehouse.
              </div>

              <div className="form-group">
                <label>From Warehouse *</label>
                <select
                  value={fromWarehouse}
                  onChange={(e) => setFromWarehouse(e.target.value)}
                  required
                  style={{ width: '100%' }}
                >
                  <option value="">Select warehouse...</option>
                  {locations
                    .filter(loc => loc.type === 'warehouse')
                    .map(location => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ marginTop: '20px' }}>
                <h4>Preview of CDR Items:</h4>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <table style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th style={{ padding: '8px' }}>Outlet</th>
                        <th style={{ padding: '8px' }}>Mapped Branch</th>
                        <th style={{ padding: '8px' }}>Description</th>
                        <th style={{ padding: '8px' }}>Unit</th>
                        <th style={{ padding: '8px' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cdrData.slice(0, 10).map((item, index) => (
                        <tr key={index}>
                          <td style={{ padding: '8px' }}>{item.outlet}</td>
                          <td style={{ padding: '8px' }}>{item.mappedBranch}</td>
                          <td style={{ padding: '8px' }}>{item.description}</td>
                          <td style={{ padding: '8px' }}>{item.unit}</td>
                          <td style={{ padding: '8px' }}>{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {cdrData.length > 10 && (
                    <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      ... and {cdrData.length - 10} more items
                    </div>
                  )}
                </div>
              </div>

              <button 
                className="btn btn-primary" 
                onClick={validateAndSuggestProducts}
                disabled={!fromWarehouse || loading}
                style={{ width: '100%', marginTop: '20px' }}
              >
                {loading ? 'Validating Products...' : 'Continue to Review'}
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              {errors.length > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
                  <FiAlertCircle size={16} />
                  {errors.length} items need attention. Please review and fix errors below.
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <h4>Review Items ({cdrData.length} total, {errors.length} errors)</h4>
                <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <table style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th style={{ padding: '8px' }}>Status</th>
                        <th style={{ padding: '8px' }}>Branch</th>
                        <th style={{ padding: '8px' }}>Description</th>
                        <th style={{ padding: '8px' }}>Unit</th>
                        <th style={{ padding: '8px' }}>Qty</th>
                        <th style={{ padding: '8px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cdrData.map((item, index) => (
                        <tr key={index} style={{ backgroundColor: item.error ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                          <td style={{ padding: '8px' }}>
                            {item.error ? (
                              <span className="badge badge-danger" style={{ fontSize: '10px' }}>Error</span>
                            ) : (
                              <span className="badge badge-success" style={{ fontSize: '10px' }}>OK</span>
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>{item.mappedBranch}</td>
                          <td style={{ padding: '8px' }}>
                            {editingIndex === index ? (
                              <div style={{ position: 'relative' }}>
                                <SimpleAutocomplete
                                  items={warehouseInventory}
                                  value={editData.searchText || ''}
                                  onChange={(value) => setEditData({...editData, searchText: value, description: value})}
                                  onSelect={handleProductSelect}
                                  displayField="description"
                                  placeholder="Search warehouse products..."
                                  style={{ width: '100%', fontSize: '11px' }}
                                />
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  <FiSearch size={10} style={{ marginRight: '4px' }} />
                                  Type to search warehouse inventory
                                </div>
                              </div>
                            ) : (
                              item.description
                            )}
                            {item.error && (
                              <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>
                                {item.error}
                              </div>
                            )}
                            {item.suggested && (
                              <div style={{ fontSize: '10px', color: 'var(--success)', marginTop: '2px' }}>
                                Suggested: {item.suggested.description}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            {editingIndex === index ? (
                              <input
                                type="text"
                                value={editData.unit}
                                onChange={(e) => setEditData({...editData, unit: e.target.value})}
                                style={{ width: '60px', padding: '2px 4px', fontSize: '11px' }}
                              />
                            ) : (
                              item.unit
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            {editingIndex === index ? (
                              <input
                                type="number"
                                value={editData.quantity}
                                onChange={(e) => setEditData({...editData, quantity: e.target.value})}
                                style={{ width: '60px', padding: '2px 4px', fontSize: '11px' }}
                              />
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {editingIndex === index ? (
                                <>
                                  <button 
                                    className="btn btn-success" 
                                    onClick={saveEdit}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                  >
                                    <FiCheck size={10} />
                                  </button>
                                  <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setEditingIndex(null)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                  >
                                    <FiX size={10} />
                                  </button>
                                </>
                              ) : (
                                <button 
                                  className="btn btn-primary" 
                                  onClick={() => handleEditItem(index)}
                                  style={{ padding: '2px 6px', fontSize: '10px' }}
                                >
                                  <FiEdit2 size={10} />
                                </button>
                              )}
                              {item.suggested && (
                                <button 
                                  className="btn btn-success" 
                                  onClick={() => selectSuggestion(index, item.suggested)}
                                  style={{ padding: '2px 6px', fontSize: '10px' }}
                                  title="Use suggested product"
                                >
                                  Use
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setStep(2)}
                  style={{ flex: 1 }}
                >
                  Back to Warehouse Selection
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={processCdrImport}
                  disabled={errors.length > 0 || loading}
                  style={{ flex: 2 }}
                >
                  {loading ? 'Creating Transfers...' : `Import ${cdrData.filter(item => !item.error).length} Items`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CdrImportModal;