import React, { useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import * as XLSX from 'xlsx';

function ImportModal({ isOpen, onClose, onImportComplete }) {
  const showToast = useToast();
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [locations, setLocations] = useState([]);
  const [branches, setBranches] = useState([]);

  const fetchLocations = useCallback(async () => {
    try {
      const response = await api.get('/locations');
      const warehouses = response.data.filter(loc => loc.type === 'warehouse');
      const branchList = response.data.filter(loc => loc.type === 'branch');
      setLocations(warehouses);
      setBranches(branchList);
      if (warehouses.length > 0) {
        setSelectedLocation(warehouses[0].id);
      }
    } catch (error) {
      showToast().error('Error', 'Failed to load locations');
    }
  }, [showToast]);

  React.useEffect(() => {
    if (isOpen) {
      fetchLocations();
    }
  }, [isOpen, fetchLocations]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls') && !selectedFile.name.endsWith('.csv')) {
        showToast().error('Error', 'Please select an Excel or CSV file');
        return;
      }
      setFile(selectedFile);
      setPreviewData(null);
      setSheets([]);
      setSelectedSheet('');
      
      // Read file to detect sheets
      detectSheets(selectedFile);
    }
  };

  const detectSheets = async (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length > 1) {
          setSheets(workbook.SheetNames);
          setSelectedSheet(workbook.SheetNames[0]); // Default to first sheet
          showToast().info('Info', `Found ${workbook.SheetNames.length} sheets. Please select which one to import.`);
        } else {
          setSheets([]);
          setSelectedSheet('');
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePreview = async () => {
    if (!file) {
      showToast().error('Error', 'Please select a file first');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    // Add sheet name if multiple sheets exist
    if (sheets.length > 0 && selectedSheet) {
      formData.append('sheetName', selectedSheet);
    }

    try {
      const response = await api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.errors && response.data.errors.length > 0) {
        showToast().warning('Warning', `Found ${response.data.errors.length} validation errors`);
      } else {
        showToast().success('Success', 'Preview loaded successfully');
      }

      setPreviewData(response.data);
    } catch (error) {
      showToast().error('Error', error.response?.data?.error || 'Failed to preview file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!previewData || !selectedLocation) {
      showToast().error('Error', 'Please preview the file and select a location first');
      return;
    }

    // Filter out rows with critical errors (missing brand or description)
    const validData = previewData.preview.filter(item => 
      !item.is_category && item.brand && item.description && item.unit
    );

    const invalidData = previewData.preview.filter(item => 
      !item.is_category && (!item.brand || !item.description || !item.unit)
    );

    // If there are invalid rows, show detailed confirmation
    if (invalidData.length > 0) {
      const invalidRowsList = invalidData.map(item => {
        const issues = [];
        if (!item.brand) issues.push('Missing Brand');
        if (!item.description) issues.push('Missing Description');
        if (!item.unit) issues.push('Missing Unit');
        return `Row ${item.rowNumber}: ${issues.join(', ')}`;
      }).slice(0, 20); // Show first 20 errors

      const moreErrors = invalidData.length > 20 ? `\n... and ${invalidData.length - 20} more rows` : '';
      
      const confirmMessage = `${invalidData.length} row(s) will NOT be imported due to missing required fields:\n\n${invalidRowsList.join('\n')}${moreErrors}\n\n${validData.length} valid row(s) will be imported.\n\nDo you want to proceed?`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }

    if (validData.length === 0) {
      showToast().error('Error', 'No valid rows to import. All rows have missing required fields.');
      return;
    }

    setImporting(true);

    try {
      // Process in batches of 100 items to avoid payload size issues
      const batchSize = 100;
      const totalBatches = Math.ceil(validData.length / batchSize);
      let totalImported = 0;
      let totalUpdated = 0;
      let totalTransferred = 0;
      const allErrors = [];

      for (let i = 0; i < validData.length; i += batchSize) {
        const batch = validData.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        // Update progress
        setImportProgress(Math.round((batchNumber / totalBatches) * 100));
        
        try {
          const response = await api.post('/import/import', {
            data: batch,
            locationId: selectedLocation,
            branchId: selectedBranch || null
          });

          totalImported += response.data.imported;
          totalUpdated += response.data.updated;
          totalTransferred += response.data.transferred || 0;
          
          if (response.data.errors) {
            allErrors.push(...response.data.errors);
          }
        } catch (batchError) {
          console.error(`Error importing batch ${batchNumber}:`, batchError);
          allErrors.push(`Batch ${batchNumber}: ${batchError.response?.data?.error || batchError.message}`);
        }
      }

      setImportProgress(0);

      const message = `Import complete: ${totalImported} new, ${totalUpdated} updated${totalTransferred > 0 ? `, ${totalTransferred} transferred` : ''}${invalidData.length > 0 ? `, ${invalidData.length} skipped (invalid)` : ''}`;
      
      if (allErrors.length > 0) {
        // Create detailed error report
        const errorReport = allErrors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
        
        // Show in console
        console.error('❌ IMPORT ERRORS:', allErrors);
        
        // Show in alert with scrollable content
        const errorSummary = allErrors.slice(0, 5).join('\n');
        const moreCount = allErrors.length > 5 ? `\n\n... and ${allErrors.length - 5} more errors` : '';
        
        alert(`⚠️ Import completed with ${allErrors.length} errors:\n\n${errorSummary}${moreCount}\n\nFull error list is in the browser console (F12).`);
        
        showToast().warning('Partial Success', `${message}. ${allErrors.length} errors occurred.`);
      } else {
        showToast().success('Success', message);
      }

      // Reset form
      setFile(null);
      setPreviewData(null);
      if (document.getElementById('fileInput')) {
        document.getElementById('fileInput').value = '';
      }
      
      // Call callback and close modal
      if (onImportComplete) {
        onImportComplete();
      }
      onClose();
    } catch (error) {
      console.error('Import error:', error);
      showToast().error('Error', error.response?.data?.error || 'Failed to import data');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreviewData(null);
    setSelectedBranch('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          color: 'white',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          marginTop: '-32px',
          marginLeft: '-32px',
          marginRight: '-32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Import Inventory from Excel</h2>
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
              justifyContent: 'center',
              transition: 'var(--transition)'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          >
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
          <div style={{ marginBottom: '24px' }}>
            {/* Location Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group">
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Import to Location <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="form-control"
                >
                  <option value="">-- Select Location --</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>📦 {loc.name} (Warehouse)</option>
                  ))}
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>🏪 {branch.name} (Branch)</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Also Transfer to Branch (Optional)
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  disabled={!selectedLocation || branches.some(b => b.id === parseInt(selectedLocation))}
                  className="form-control"
                >
                  <option value="">-- No Transfer --</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>🏪 {branch.name}</option>
                  ))}
                </select>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  {branches.some(b => b.id === parseInt(selectedLocation)) 
                    ? 'Not available when importing directly to branch'
                    : 'Create automatic transfer after import'}
                </small>
              </div>
            </div>

            {/* File Upload */}
            <div className="form-group">
              <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Select Excel File <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  id="fileInput"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="form-control"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={handlePreview}
                  disabled={!file || loading || !selectedLocation}
                  className="btn btn-primary"
                >
                  {loading ? 'Loading...' : 'Preview'}
                </button>
              </div>
              
              {/* Sheet Selector - only show if multiple sheets */}
              {sheets.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block', fontSize: '0.875rem' }}>
                    Select Sheet to Import <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => {
                      setSelectedSheet(e.target.value);
                      setPreviewData(null); // Clear preview when sheet changes
                    }}
                    className="form-control"
                  >
                    {sheets.map((sheet, idx) => (
                      <option key={idx} value={sheet}>
                        📄 {sheet}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                    This file has {sheets.length} sheets. Select the one containing your inventory data.
                  </small>
                </div>
              )}
              
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: 'rgba(37, 99, 235, 0.05)', 
                border: '1px solid rgba(37, 99, 235, 0.2)', 
                borderRadius: 'var(--radius)'
              }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '600', margin: '0 0 4px 0' }}>
                  Expected columns (case-insensitive):
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>
                  BRAND, Number (optional), THE HEALTHSHOP PRODUCTS or PRODUCT DESCRIPTION, UoM, Ave Unit Cost, Selling Price, QTY, Expiry Date (optional)
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                  • Batch numbers: If Number column exists → BRAND-Number (CH-001). If not → auto-generated (CH-001, CH-002, etc.)<br/>
                  • QTY: 0 or blank = 0 quantity<br/>
                  • Category rows (description only, no brand/unit) will be detected<br/>
                  • Title rows automatically skipped
                </p>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          {previewData && (
            <div className="card" style={{ border: '1px solid var(--border)', marginTop: '24px' }}>
              <div style={{ 
                padding: '16px 20px', 
                borderBottom: '1px solid var(--border)', 
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                  Preview ({previewData.totalRows} rows)
                </h3>
                <button
                  onClick={handleImport}
                  disabled={importing || !selectedLocation}
                  className="btn btn-success"
                >
                  {importing ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Importing... {importProgress > 0 && `${importProgress}%`}
                    </span>
                  ) : '✓ Import to Inventory'}
                </button>
              </div>

              {previewData.errors && previewData.errors.length > 0 && (
                <div className="alert alert-error" style={{ margin: '16px 20px', borderRadius: 'var(--radius)' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Validation Errors ({previewData.errors.length})
                    </h4>
                    <ul style={{ listStyle: 'disc', paddingLeft: '20px', margin: 0, maxHeight: '120px', overflowY: 'auto', fontSize: '0.875rem' }}>
                      {previewData.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                <table className="data-table">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <tr>
                      <th>Row</th>
                      <th>Batch #</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th>Unit Cost</th>
                      <th>Selling Price</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.map((item, idx) => {
                      if (item.is_category) {
                        if (item.category_type === 'main') {
                          return (
                            <tr key={idx} style={{ background: 'linear-gradient(to right, rgba(37, 99, 235, 0.1), rgba(37, 99, 235, 0.05))' }}>
                              <td>{item.rowNumber}</td>
                              <td colSpan={7} style={{ fontWeight: '700', color: 'var(--primary)', fontSize: '15px', padding: '12px' }}>
                                📂 {item.description}
                              </td>
                            </tr>
                          );
                        } else if (item.category_type === 'sub') {
                          return (
                            <tr key={idx} style={{ background: 'rgba(16, 185, 129, 0.05)' }}>
                              <td>{item.rowNumber}</td>
                              <td colSpan={7} style={{ fontWeight: '600', color: 'var(--secondary)', fontSize: '14px', paddingLeft: '32px' }}>
                                📁 {item.description}
                              </td>
                            </tr>
                          );
                        }
                      }
                      
                      return (
                        <tr key={idx} style={!item.brand || !item.description ? { background: 'rgba(239, 68, 68, 0.05)' } : {}}>
                          <td>{item.rowNumber}</td>
                          <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>
                            {item.batch_number ? (
                              item.batch_number.endsWith('-AUTO') ? (
                                <span style={{ color: 'var(--warning)' }}>
                                  {item.brand}-### <small style={{ fontSize: '9px', color: 'var(--text-muted)' }}>(auto)</small>
                                </span>
                              ) : (
                                item.batch_number
                              )
                            ) : (
                              <span style={{ color: 'var(--danger)' }}>❌ No Brand</span>
                            )}
                            {item.main_category && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'system-ui' }}>
                                {item.main_category}{item.sub_category && ` → ${item.sub_category}`}
                              </div>
                            )}
                          </td>
                          <td>{item.description || <span style={{ color: 'var(--danger)' }}>❌ Missing</span>}</td>
                          <td>{item.unit || <span style={{ color: 'var(--danger)' }}>❌ Missing</span>}</td>
                          <td>{item.quantity}</td>
                          <td>₱{item.unit_cost.toFixed(2)}</td>
                          <td>₱{item.suggested_selling_price.toFixed(2)}</td>
                          <td style={{ fontSize: '11px' }}>
                            {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportModal;
