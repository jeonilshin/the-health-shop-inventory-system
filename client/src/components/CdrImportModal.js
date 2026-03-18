import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { FiX, FiCheck, FiAlertCircle, FiEdit2, FiTruck, FiSearch, FiTrash2 } from 'react-icons/fi';
import SimpleAutocomplete from './SimpleAutocomplete';

function CdrImportModal({ isOpen, onClose, onImportComplete, locations }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Select Warehouse, 3: Map Branches, 4: Review & Fix
  const [file, setFile] = useState(null);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [cdrData, setCdrData] = useState([]);
  const [lgdData, setLgdData] = useState([]); // Separate LGD items
  const [branchMappings, setBranchMappings] = useState({}); // CDR outlet -> branch mapping
  const [unmappedOutlets, setUnmappedOutlets] = useState([]); // Outlets that need manual mapping
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editData, setEditData] = useState({});
  const [warehouseInventory, setWarehouseInventory] = useState([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false); // Filter toggle

  // Smart branch mapping function
  const findBestBranchMatch = (cdrOutlet) => {
    if (!cdrOutlet) return null;
    
    const cdrLower = cdrOutlet.toLowerCase();
    const branches = locations.filter(loc => loc.type === 'branch');
    
    // First, try exact match
    let match = branches.find(branch => 
      branch.name.toLowerCase() === cdrLower
    );
    if (match) return match;
    
    // Extract key words from CDR outlet (remove common words)
    const cdrWords = cdrLower
      .replace(/\b(the|and|or|branch|store|shop|mall|center|centre)\b/g, '')
      .split(/[\s\-_]+/)
      .filter(word => word.length > 2);
    
    // Try to find branch that contains all key words
    match = branches.find(branch => {
      const branchLower = branch.name.toLowerCase();
      return cdrWords.every(word => branchLower.includes(word));
    });
    if (match) return match;
    
    // Try to find branch that contains most key words
    let bestMatch = null;
    let bestScore = 0;
    
    branches.forEach(branch => {
      const branchLower = branch.name.toLowerCase();
      const score = cdrWords.reduce((count, word) => {
        return branchLower.includes(word) ? count + 1 : count;
      }, 0);
      
      if (score > bestScore && score > 0) {
        bestScore = score;
        bestMatch = branch;
      }
    });
    
    return bestMatch;
  };

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setStep(1);
      setFile(null);
      setFromWarehouse('');
      setCdrData([]);
      setLgdData([]);
      setBranchMappings({});
      setUnmappedOutlets([]);
      setErrors([]);
      setEditingIndex(null);
      setEditData({});
      setWarehouseInventory([]);
      setShowErrorsOnly(false);
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
      const lgdItems = []; // Separate array for LGD items
      const outletSet = new Set(); // Track unique outlets

      for (let i = 0; i < dataLines.length; i++) {
        const values = dataLines[i].split(',').map(v => v.trim());
        
        if (values.length < headers.length) continue; // Skip incomplete rows

        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Skip empty rows or rows without essential data
        if (!row['OUTLET'] || !row['ITEM DESCRIPTION'] || !row['QUANTITY']) continue;

        const item = {
          originalIndex: i,
          date: row['DATE'],
          outlet: row['OUTLET'],
          brand: row['BRAND'],
          description: row['ITEM DESCRIPTION'],
          unit: row['UoM'],
          quantity: parseInt(row['QUANTITY']) || 0,
          remarks: row['REMARKS'] || '',
          error: null,
          suggested: null
        };

        // Handle LGD items separately
        if (row['OUTLET'] === 'LGD') {
          lgdItems.push(item);
          continue;
        }

        // Track unique outlets for mapping
        outletSet.add(row['OUTLET']);
        parsedData.push(item);
      }

      setCdrData(parsedData);
      setLgdData(lgdItems);
      
      // Auto-map branches and identify unmapped outlets
      const mappings = {};
      const unmapped = [];
      
      Array.from(outletSet).forEach(outlet => {
        const bestMatch = findBestBranchMatch(outlet);
        if (bestMatch) {
          mappings[outlet] = parseInt(bestMatch.id); // Ensure ID is stored as number
        } else {
          unmapped.push(outlet);
        }
      });
      
      setBranchMappings(mappings);
      setUnmappedOutlets(unmapped);
      setStep(2);
    } catch (error) {
      alert('Error parsing CDR file: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const proceedToValidation = () => {
    // Check if all outlets are mapped
    if (unmappedOutlets.length > 0) {
      alert('Please map all outlets to branches before proceeding');
      return;
    }
    
    // Update CDR data with mapped branches
    const updatedData = cdrData.map(item => ({
      ...item,
      mappedBranchId: branchMappings[item.outlet],
      mappedBranchName: locations.find(loc => loc.id === branchMappings[item.outlet])?.name || item.outlet
    }));
    
    setCdrData(updatedData);
    setStep(3);
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

      // Aggregate quantities by description + unit (sum across all cost batches)
      const aggregatedInventory = {};
      warehouseInventory.forEach(inv => {
        const key = `${inv.description.toLowerCase()}|||${inv.unit.toLowerCase()}`;
        if (!aggregatedInventory[key]) {
          aggregatedInventory[key] = {
            ...inv,
            totalQuantity: 0,
            batches: []
          };
        }
        aggregatedInventory[key].totalQuantity += parseFloat(inv.quantity || 0);
        aggregatedInventory[key].batches.push({
          id: inv.id,
          quantity: inv.quantity,
          unit_cost: inv.unit_cost,
          batch_number: inv.batch_number
        });
      });

      const updatedData = cdrData.map(item => {
        const key = `${item.description.toLowerCase()}|||${item.unit.toLowerCase()}`;
        const aggregated = aggregatedInventory[key];
        
        // If exact match found in aggregated inventory
        if (aggregated) {
          let error = null;
          if (aggregated.totalQuantity < parseFloat(item.quantity)) {
            error = `Insufficient quantity in warehouse. Available: ${aggregated.totalQuantity}, Requested: ${item.quantity}`;
          }

          return {
            ...item,
            error: error,
            suggested: aggregated // Use aggregated data with totalQuantity
          };
        }

        // Try to find match with fuzzy search
        let match = null;
        
        // Try partial match on description
        match = warehouseInventory.find(inv => 
          inv.description.toLowerCase().includes(item.description.toLowerCase()) ||
          item.description.toLowerCase().includes(inv.description.toLowerCase())
        );

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
          error: match ? null : 'Product not found in warehouse inventory',
          suggested: match || null
        };
      });

      setCdrData(updatedData);
      setErrors(updatedData.filter(item => item.error));
      setStep(4);
    } catch (error) {
      alert('Error validating products: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (index) => {
    const item = cdrData[index];
    setEditingIndex(index);
    setEditData({
      description: item.description, // Keep original CDR description
      unit: item.unit, // Keep original CDR unit
      quantity: item.quantity, // Keep original CDR quantity
      searchText: item.description // Start search with original description
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
    // Only update the edit form, don't auto-apply
    setEditData({
      ...editData,
      description: selectedProduct.description,
      unit: selectedProduct.unit,
      searchText: selectedProduct.description
      // Keep original quantity - don't change it
    });
  };

  const selectSuggestion = (index, suggestion) => {
    const updatedData = [...cdrData];
    updatedData[index] = {
      ...updatedData[index],
      description: suggestion.description,
      unit: suggestion.unit,
      suggested: suggestion,
      error: null
      // Keep original quantity - don't change it
    };
    setCdrData(updatedData);
    
    // Update errors list
    setErrors(updatedData.filter(item => item.error));
  };

  const removeItem = (originalIndex) => {
    const updatedData = cdrData.filter((_, i) => i !== originalIndex);
    setCdrData(updatedData);
    setErrors(updatedData.filter(item => item.error));
    
    // Clear editing state if we're editing the removed item
    if (editingIndex === originalIndex) {
      setEditingIndex(null);
      setEditData({});
    }
  };

  // Filter warehouse inventory for better suggestions
  const getFilteredSuggestions = (searchText) => {
    if (!searchText || searchText.length < 2) return [];
    
    const searchLower = searchText.toLowerCase();
    
    // First, try exact matches
    const exactMatches = warehouseInventory.filter(item =>
      item.description.toLowerCase().includes(searchLower)
    );
    
    // If no exact matches, try fuzzy matching
    if (exactMatches.length === 0) {
      const cleanSearch = searchLower
        .replace(/\b(the|and|or|with|w\/|mg|ml|g|s|capsule|tablet|bottle|box|pack)\b/g, '')
        .trim();
      
      return warehouseInventory.filter(item => {
        const cleanDesc = item.description.toLowerCase()
          .replace(/\b(the|and|or|with|w\/|mg|ml|g|s|capsule|tablet|bottle|box|pack)\b/g, '')
          .trim();
        return cleanDesc.includes(cleanSearch) || cleanSearch.includes(cleanDesc);
      }).slice(0, 10); // Limit to 10 suggestions
    }
    
    return exactMatches.slice(0, 10); // Limit to 10 suggestions
  };

  const processCdrImport = async () => {
    const validItems = cdrData.filter(item => !item.error && item.suggested);
    
    if (validItems.length === 0 && lgdData.length === 0) {
      alert('No valid items to import');
      return;
    }

    setLoading(true);
    try {
      const transfers = [];

      // Process regular CDR items
      if (validItems.length > 0) {
        // Group items by branch ID
        const itemsByBranch = {};
        validItems.forEach(item => {
          const branchId = item.mappedBranchId;
          if (!itemsByBranch[branchId]) {
            itemsByBranch[branchId] = [];
          }
          itemsByBranch[branchId].push(item);
        });

        for (const [branchId, items] of Object.entries(itemsByBranch)) {
          // Find branch location
          const branch = locations.find(loc => loc.id === parseInt(branchId));

          if (!branch) {
            console.error(`Branch not found with ID: ${branchId}. Available branches:`, 
              locations.filter(loc => loc.type === 'branch').map(b => ({ id: b.id, name: b.name })));
            errors.push(`Branch not found with ID: ${branchId}`);
            continue;
          }

          transfers.push({
            from_location_id: fromWarehouse,
            to_location_id: branch.id,
            notes: `CDR Import - ${new Date().toLocaleDateString()} - ${branch.name}`,
            items: items.map(item => {
              // Find the first batch with sufficient quantity
              let selectedBatch = item.suggested.batches.find(b => parseFloat(b.quantity) >= parseFloat(item.quantity));
              
              // If no single batch has enough, use the first batch with any quantity
              if (!selectedBatch) {
                selectedBatch = item.suggested.batches.find(b => parseFloat(b.quantity) > 0);
              }
              
              // Fallback to first batch if all are 0
              if (!selectedBatch) {
                selectedBatch = item.suggested.batches[0];
              }

              return {
                inventory_item_id: selectedBatch.id,
                quantity: item.quantity,
                description: item.description,
                unit: item.unit,
                unit_cost: selectedBatch.unit_cost
              };
            })
          });
        }
      }

      // Process LGD items - create completed transfers and remove from inventory
      if (lgdData.length > 0) {
        // Find LGD location (create if doesn't exist)
        let lgdLocation = locations.find(loc => 
          loc.name.toLowerCase().includes('lgd') || 
          loc.name.toLowerCase().includes('lost goods')
        );

        if (!lgdLocation) {
          // Create LGD location
          const lgdResponse = await api.post('/locations', {
            name: 'LGD (Lost Goods Department)',
            type: 'branch',
            address: 'Virtual Location for Lost Goods'
          });
          lgdLocation = lgdResponse.data;
        }

        // Process each LGD item
        for (const lgdItem of lgdData) {
          // Find matching inventory item in warehouse
          const warehouseItem = warehouseInventory.find(inv => 
            inv.description.toLowerCase() === lgdItem.description.toLowerCase() &&
            inv.unit.toLowerCase() === lgdItem.unit.toLowerCase()
          );

          if (warehouseItem && warehouseItem.quantity >= lgdItem.quantity) {
            transfers.push({
              from_location_id: fromWarehouse,
              to_location_id: lgdLocation.id,
              notes: `LGD Transfer - ${new Date().toLocaleDateString()} - Auto-completed`,
              status: 'completed', // Mark as completed immediately
              items: [{
                inventory_item_id: warehouseItem.id,
                quantity: lgdItem.quantity,
                description: lgdItem.description,
                unit: lgdItem.unit,
                unit_cost: warehouseItem.unit_cost
              }]
            });
          }
        }
      }

      if (transfers.length === 0) {
        alert('No valid transfers to create');
        return;
      }

      // Call batch transfer API
      const response = await api.post('/transfers/batch', { transfers });
      
      if (response.data.success) {
        const { results, errors } = response.data;
        let message = `CDR import completed!\n${results.length} transfers created successfully.`;
        
        if (lgdData.length > 0) {
          message += `\n${lgdData.length} LGD items processed and completed automatically.`;
        }
        
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
              Step {step} of 4: {step === 1 ? 'Upload File' : step === 2 ? 'Select Warehouse' : step === 3 ? 'Map Branches' : 'Review & Import'}
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
                Found {cdrData.length} regular items and {lgdData.length} LGD items in CDR file. Now select the source warehouse.
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
                      {cdrData.slice(0, 8).map((item, index) => (
                        <tr key={index}>
                          <td style={{ padding: '8px' }}>{item.outlet}</td>
                          <td style={{ padding: '8px' }}>
                            {branchMappings[item.outlet] ? 
                              locations.find(loc => loc.id === branchMappings[item.outlet])?.name || 'Unknown' :
                              <span style={{ color: 'var(--warning)' }}>Needs mapping</span>
                            }
                          </td>
                          <td style={{ padding: '8px' }}>{item.description}</td>
                          <td style={{ padding: '8px' }}>{item.unit}</td>
                          <td style={{ padding: '8px' }}>{item.quantity}</td>
                        </tr>
                      ))}
                      {lgdData.slice(0, 2).map((item, index) => (
                        <tr key={`lgd-${index}`} style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                          <td style={{ padding: '8px' }}>
                            <span className="badge badge-warning" style={{ fontSize: '10px' }}>LGD</span>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-complete</span>
                          </td>
                          <td style={{ padding: '8px' }}>{item.description}</td>
                          <td style={{ padding: '8px' }}>{item.unit}</td>
                          <td style={{ padding: '8px' }}>{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(cdrData.length + lgdData.length) > 10 && (
                    <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      ... and {(cdrData.length + lgdData.length) - 10} more items
                    </div>
                  )}
                </div>
                
                {lgdData.length > 0 && (
                  <div className="alert alert-warning" style={{ marginTop: '12px' }}>
                    <FiAlertCircle size={16} />
                    <strong>{lgdData.length} LGD items</strong> will be automatically transferred to LGD location and marked as completed.
                  </div>
                )}
              </div>

              <button 
                className="btn btn-primary" 
                onClick={proceedToValidation}
                disabled={!fromWarehouse || loading}
                style={{ width: '100%', marginTop: '20px' }}
              >
                {loading ? 'Processing...' : 'Continue to Branch Mapping'}
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                <FiCheck size={16} />
                Map CDR outlets to your existing branches. Auto-suggestions are provided based on name similarity.
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4>Branch Mapping</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Review and confirm the branch mappings below. Items will be transferred to the selected branches.
                </p>
                
                {/* Auto-mapped branches */}
                {Object.keys(branchMappings).length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ color: 'var(--success)', marginBottom: '12px' }}>
                      ✓ Auto-Mapped Outlets ({Object.keys(branchMappings).length})
                    </h5>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {Object.entries(branchMappings).map(([outlet, branchId]) => {
                        const branch = locations.find(loc => loc.id === branchId);
                        return (
                          <div key={outlet} style={{ 
                            padding: '12px', 
                            border: '1px solid var(--success)', 
                            borderRadius: 'var(--radius)',
                            backgroundColor: 'rgba(16, 185, 129, 0.05)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <strong>{outlet}</strong> → {branch?.name}
                              </div>
                              <select
                                value={branchId}
                                onChange={(e) => setBranchMappings({
                                  ...branchMappings,
                                  [outlet]: parseInt(e.target.value)
                                })}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                {locations
                                  .filter(loc => loc.type === 'branch')
                                  .map(branch => (
                                    <option key={branch.id} value={branch.id}>
                                      {branch.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Unmapped outlets */}
                {unmappedOutlets.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ color: 'var(--warning)', marginBottom: '12px' }}>
                      ⚠ Unmapped Outlets ({unmappedOutlets.length}) - Requires Manual Mapping
                    </h5>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {unmappedOutlets.map(outlet => (
                        <div key={outlet} style={{ 
                          padding: '12px', 
                          border: '1px solid var(--warning)', 
                          borderRadius: 'var(--radius)',
                          backgroundColor: 'rgba(245, 158, 11, 0.05)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong>{outlet}</strong> → 
                              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                Select branch
                              </span>
                            </div>
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  setBranchMappings({
                                    ...branchMappings,
                                    [outlet]: parseInt(e.target.value)
                                  });
                                  setUnmappedOutlets(unmappedOutlets.filter(o => o !== outlet));
                                }
                              }}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              <option value="">Select branch...</option>
                              {locations
                                .filter(loc => loc.type === 'branch')
                                .map(branch => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="alert alert-info">
                  <FiAlertCircle size={16} />
                  <strong>Summary:</strong> {Object.keys(branchMappings).length} outlets mapped, {unmappedOutlets.length} pending
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
                  onClick={validateAndSuggestProducts}
                  disabled={unmappedOutlets.length > 0 || loading}
                  style={{ flex: 2 }}
                >
                  {loading ? 'Validating Products...' : 'Continue to Review'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              {errors.length > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
                  <FiAlertCircle size={16} />
                  {errors.length} items need attention. Please review and fix errors below.
                </div>
              )}

              {lgdData.length > 0 && (
                <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                  <FiAlertCircle size={16} />
                  <strong>{lgdData.length} LGD items</strong> will be automatically processed and completed.
                </div>
              )}

              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <h4>Review Items ({cdrData.length} regular, {lgdData.length} LGD, {errors.length} errors)</h4>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {errors.length > 0 && (
                    <button 
                      className="btn btn-danger" 
                      onClick={() => {
                        if (window.confirm(`Remove all ${errors.length} items with errors from import?`)) {
                          const updatedData = cdrData.filter(item => !item.error);
                          setCdrData(updatedData);
                          setErrors([]);
                          setEditingIndex(null);
                          setEditData({});
                        }
                      }}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      title="Remove all items with errors"
                    >
                      <FiTrash2 size={12} style={{ marginRight: '4px' }} />
                      Remove All Errors
                    </button>
                  )}
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={showErrorsOnly}
                      onChange={(e) => setShowErrorsOnly(e.target.checked)}
                    />
                    Show errors only
                  </label>
                </div>
              </div>

              {/* Regular CDR Items */}
              <div style={{ marginBottom: '20px' }}>
                <h5 style={{ marginBottom: '12px', color: 'var(--primary)' }}>Regular CDR Items</h5>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
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
                      {cdrData
                        .map((item, originalIndex) => ({ ...item, originalIndex })) // Add original index
                        .filter(item => !showErrorsOnly || item.error)
                        .map((item, filteredIndex) => (
                        <tr key={item.originalIndex} style={{ backgroundColor: item.error ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                          <td style={{ padding: '8px' }}>
                            {item.error ? (
                              <span className="badge badge-danger" style={{ fontSize: '10px' }}>Error</span>
                            ) : (
                              <span className="badge badge-success" style={{ fontSize: '10px' }}>OK</span>
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>{item.mappedBranch}</td>
                          <td style={{ padding: '8px' }}>
                            {editingIndex === item.originalIndex ? (
                              <div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>
                                  Original CDR: {item.description}
                                </div>
                                <div style={{ position: 'relative' }}>
                                  <SimpleAutocomplete
                                    items={getFilteredSuggestions(editData.searchText)}
                                    value={editData.searchText || ''}
                                    onChange={(value) => setEditData({...editData, searchText: value})}
                                    onSelect={handleProductSelect}
                                    displayField="description"
                                    placeholder="Search warehouse products..."
                                    style={{ width: '100%', fontSize: '11px' }}
                                  />
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    <FiSearch size={10} style={{ marginRight: '4px' }} />
                                    {getFilteredSuggestions(editData.searchText).length > 0 
                                      ? `${getFilteredSuggestions(editData.searchText).length} suggestions found`
                                      : 'No matching products found'
                                    }
                                  </div>
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
                            {editingIndex === item.originalIndex ? (
                              <div>
                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                  CDR: {item.unit}
                                </div>
                                <input
                                  type="text"
                                  value={editData.unit}
                                  onChange={(e) => setEditData({...editData, unit: e.target.value})}
                                  style={{ width: '60px', padding: '2px 4px', fontSize: '11px' }}
                                />
                              </div>
                            ) : (
                              item.unit
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            {editingIndex === item.originalIndex ? (
                              <div>
                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                  CDR: {item.quantity}
                                </div>
                                <input
                                  type="number"
                                  value={editData.quantity}
                                  onChange={(e) => setEditData({...editData, quantity: e.target.value})}
                                  style={{ width: '60px', padding: '2px 4px', fontSize: '11px' }}
                                />
                              </div>
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {editingIndex === item.originalIndex ? (
                                <>
                                  <button 
                                    className="btn btn-success" 
                                    onClick={saveEdit}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                    title="Save changes"
                                  >
                                    <FiCheck size={10} />
                                  </button>
                                  <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setEditingIndex(null)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                    title="Cancel edit"
                                  >
                                    <FiX size={10} />
                                  </button>
                                  {getFilteredSuggestions(editData.searchText).length > 0 && (
                                    <button 
                                      className="btn btn-info" 
                                      onClick={() => {
                                        const suggestions = getFilteredSuggestions(editData.searchText);
                                        if (suggestions.length > 0) {
                                          handleProductSelect(suggestions[0]);
                                        }
                                      }}
                                      style={{ padding: '2px 6px', fontSize: '10px' }}
                                      title="Use first suggestion"
                                    >
                                      Use
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button 
                                    className="btn btn-primary" 
                                    onClick={() => handleEditItem(item.originalIndex)}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                    title="Edit item"
                                  >
                                    <FiEdit2 size={10} />
                                  </button>
                                  <button 
                                    className="btn btn-danger" 
                                    onClick={() => {
                                      if (window.confirm(`Remove "${item.description}" from import?`)) {
                                        removeItem(item.originalIndex);
                                      }
                                    }}
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                    title="Remove item from import"
                                  >
                                    <FiTrash2 size={10} />
                                  </button>
                                </>
                              )}
                              {item.suggested && editingIndex !== item.originalIndex && (
                                <button 
                                  className="btn btn-success" 
                                  onClick={() => selectSuggestion(item.originalIndex, item.suggested)}
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

              {/* LGD Items */}
              {lgdData.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{ marginBottom: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiAlertCircle size={16} />
                    LGD Items (Auto-Complete)
                  </h5>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #f59e0b', borderRadius: 'var(--radius)', backgroundColor: 'rgba(245, 158, 11, 0.05)' }}>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                          <th style={{ padding: '8px' }}>Status</th>
                          <th style={{ padding: '8px' }}>Description</th>
                          <th style={{ padding: '8px' }}>Unit</th>
                          <th style={{ padding: '8px' }}>Qty</th>
                          <th style={{ padding: '8px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lgdData.map((item, index) => (
                          <tr key={`lgd-${index}`}>
                            <td style={{ padding: '8px' }}>
                              <span className="badge badge-warning" style={{ fontSize: '10px' }}>LGD</span>
                            </td>
                            <td style={{ padding: '8px' }}>{item.description}</td>
                            <td style={{ padding: '8px' }}>{item.unit}</td>
                            <td style={{ padding: '8px' }}>{item.quantity}</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Auto-complete transfer</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setStep(3)}
                  style={{ flex: 1 }}
                >
                  Back to Branch Mapping
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={processCdrImport}
                  disabled={loading || (cdrData.filter(item => !item.error).length === 0 && lgdData.length === 0)}
                  style={{ flex: 2 }}
                >
                  {loading ? 'Creating Transfers...' : `Import ${cdrData.filter(item => !item.error).length + lgdData.length} Items`}
                  {errors.length > 0 && (
                    <span style={{ fontSize: '10px', display: 'block', opacity: 0.8 }}>
                      ({errors.length} items will be skipped)
                    </span>
                  )}
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