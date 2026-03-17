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
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateDetails, setDuplicateDetails] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState([]);
  const [updateOptions, setUpdateOptions] = useState({}); // { itemIndex: { updateQty: true, updatePrice: true } }
  const [showErrors, setShowErrors] = useState(false);
  const [showNewItems, setShowNewItems] = useState(false);

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
      const fileExt = selectedFile.name.toLowerCase();
      if (!fileExt.endsWith('.xlsx') && !fileExt.endsWith('.xls') && !fileExt.endsWith('.csv')) {
        showToast().error('Error', 'Please select an Excel (.xlsx, .xls) or CSV (.csv) file');
        return;
      }
      setFile(selectedFile);
      setPreviewData(null);
      setSheets([]);
      setSelectedSheet('');
      
      // Only detect sheets for Excel files
      if (fileExt.endsWith('.xlsx') || fileExt.endsWith('.xls')) {
        detectSheets(selectedFile);
      }
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

    if (!selectedLocation) {
      showToast().error('Error', 'Please select a location first');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', selectedLocation);
    
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

      // Check for duplicates
      const duplicates = response.data.duplicates || 0;
      const details = response.data.duplicateDetails || [];
      setDuplicateCount(duplicates);
      setDuplicateDetails(details);
      
      if (duplicates > 0) {
        // Pre-select all duplicates by default with both quantity and price updates
        setSelectedDuplicates(details.map((_, idx) => idx));
        const defaultOptions = {};
        details.forEach((_, idx) => {
          defaultOptions[idx] = { updateQty: true, updatePrice: true };
        });
        setUpdateOptions(defaultOptions);
        showToast().info('Duplicates Found', `${duplicates} product(s) already exist in inventory. Review them before importing.`);
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

    // If there are duplicates, show confirmation modal first
    if (duplicateCount > 0) {
      setShowDuplicateModal(true);
      return;
    }

    // No duplicates, proceed with import
    await performImport();
  };

  const performImport = async () => {
    if (!previewData || !selectedLocation) {
      showToast().error('Error', 'Please preview the file and select a location first');
      return;
    }

    // Filter out rows with critical errors (missing brand, description, unit, or selling price)
    // Note: quantity and unit_cost can be 0 or empty - that's valid
    const validData = previewData.preview.filter(item => 
      !item.is_category && item.brand && item.description && item.unit && item.suggested_selling_price > 0
    );

    const invalidData = previewData.preview.filter(item => 
      !item.is_category && (!item.brand || !item.description || !item.unit || !item.suggested_selling_price || item.suggested_selling_price <= 0)
    );
    
    console.log(`📊 Import validation: ${validData.length} valid, ${invalidData.length} invalid`);
    if (invalidData.length > 0) {
      console.warn('Invalid items:', invalidData.map(i => `${i.rowNumber}: ${i.description} (brand: ${i.brand}, unit: ${i.unit})`));
    }

    // If there are invalid rows, show detailed confirmation
    if (invalidData.length > 0) {
      const invalidRowsList = invalidData.map(item => {
        const issues = [];
        if (!item.brand) issues.push('Missing Brand');
        if (!item.description) issues.push('Missing Description');
        if (!item.unit) issues.push('Missing Unit');
        if (!item.suggested_selling_price || item.suggested_selling_price <= 0) issues.push('Missing/Invalid Selling Price');
        return `Row ${item.rowNumber}: ${item.description || '(no description)'} - ${issues.join(', ')}`;
      }).slice(0, 10); // Show first 10 errors

      const moreErrors = invalidData.length > 10 ? `\n... and ${invalidData.length - 10} more rows with errors` : '';
      
      const confirmMessage = `⚠️ IMPORT VALIDATION WARNING\n\n${invalidData.length} row(s) will NOT be imported due to missing required fields:\n\n${invalidRowsList.join('\n')}${moreErrors}\n\n✓ ${validData.length} valid row(s) will be imported.\n\nDo you want to continue with importing only the valid rows?`;
      
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
        
        console.log(`📦 Importing batch ${batchNumber}/${totalBatches} (${batch.length} items)...`);
        
        // Update progress
        setImportProgress(Math.round((batchNumber / totalBatches) * 100));
        
        try {
          const response = await api.post('/import/import', {
            data: batch,
            locationId: selectedLocation,
            branchId: selectedBranch || null,
            duplicateAction: 'update',
            selectedDuplicates: selectedDuplicates.map(idx => ({
              description: duplicateDetails[idx].description,
              unit: duplicateDetails[idx].unit,
              updateQty: updateOptions[idx]?.updateQty || false,
              updatePrice: updateOptions[idx]?.updatePrice || false
            }))
          });

          totalImported += response.data.imported;
          totalUpdated += response.data.updated;
          totalTransferred += response.data.transferred || 0;
          
          console.log(`✅ Batch ${batchNumber} complete: ${response.data.imported} imported, ${response.data.updated} updated`);
          
          if (response.data.errors) {
            console.warn(`⚠️ Batch ${batchNumber} errors:`, response.data.errors);
            allErrors.push(...response.data.errors);
          }
        } catch (batchError) {
          console.error(`❌ Batch ${batchNumber} failed:`, batchError);
          allErrors.push(`Batch ${batchNumber}: ${batchError.response?.data?.error || batchError.message}`);
        }
      }

      setImportProgress(0);

      const message = `Import complete: ${totalImported} new, ${totalUpdated} updated${totalTransferred > 0 ? `, ${totalTransferred} transferred` : ''}${invalidData.length > 0 ? `, ${invalidData.length} skipped (invalid)` : ''}`;
      
      if (allErrors.length > 0) {
        // Show in console with full details
        console.error('❌ IMPORT ERRORS (' + allErrors.length + ' total):', allErrors);
        console.table(allErrors.map((err, idx) => ({ '#': idx + 1, Error: err })));
        
        // Show in alert with first 5 errors
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
      setDuplicateCount(0);
      setDuplicateDetails([]);
      setSelectedDuplicates([]);
      setUpdateOptions({});
      setShowDuplicateModal(false);
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
                  BRAND, Number (optional), THE HEALTHSHOP PRODUCTS or PRODUCT DESCRIPTION, UoM, Ave Unit Cost (optional), Selling Price, QTY (optional), Expiry Date (optional)
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                  • Required: Brand, Description, Unit, Selling Price<br/>
                  • Optional: Number, Unit Cost (defaults to 0), QTY (defaults to 0), Expiry Date<br/>
                  • Batch numbers: If Number exists → BRAND-Number (CH-001). If not → auto-generated (CH-001, CH-002, etc.)<br/>
                  • Category rows (description only, no brand/unit) will be detected<br/>
                  • Title rows automatically skipped
                </p>
              </div>
            </div>

            {/* Duplicate Handling - Show only if duplicates found */}
            {duplicateCount > 0 && (
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Duplicate Handling <span style={{ color: 'var(--warning)' }}>({duplicateCount} duplicates found)</span>
                </label>
                <div style={{ 
                  padding: '16px', 
                  background: 'rgba(245, 158, 11, 0.05)', 
                  border: '1px solid rgba(245, 158, 11, 0.2)', 
                  borderRadius: 'var(--radius)'
                }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Some products already exist in inventory. Click "Import to Inventory" to review and select which ones to update.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: '0.875rem', padding: '8px 16px' }}
                    onClick={() => setShowDuplicateModal(true)}
                  >
                    📋 Review Duplicates ({duplicateCount})
                  </button>
                </div>
              </div>
            )}
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
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                    Preview ({previewData.totalRows} rows)
                  </h3>
                  {previewData.errors && previewData.errors.length > 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '4px 0 0 0', fontWeight: '600' }}>
                      ⚠️ {previewData.errors.length} rows will be skipped due to errors
                    </p>
                  )}
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || !selectedLocation}
                  className={previewData.errors && previewData.errors.length > 0 ? "btn btn-warning" : "btn btn-success"}
                  style={{ minWidth: '180px' }}
                >
                  {importing ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Importing... {importProgress > 0 && `${importProgress}%`}
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {previewData.errors && previewData.errors.length > 0 ? '⚠️ Import Valid Rows' : '✓ Import to Inventory'}
                    </span>
                  )}
                </button>
              </div>

              {previewData.errors && previewData.errors.length > 0 && (
                <div className="alert alert-error" style={{ margin: '16px 20px', borderRadius: 'var(--radius)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
                        <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        ⚠️ Validation Errors ({previewData.errors.length})
                      </h4>
                      <button
                        onClick={() => setShowErrors(!showErrors)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: 'var(--danger)',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius)',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          transition: 'var(--transition)'
                        }}
                      >
                        {showErrors ? '✕ Hide Errors' : '👁 View All Errors'}
                      </button>
                    </div>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.875rem', color: 'var(--danger)' }}>
                      These rows have missing required fields and will NOT be imported. Please fix them in your Excel file or continue without them.
                    </p>
                    {showErrors && (
                      <div style={{ 
                        marginTop: '12px',
                        padding: '12px',
                        background: 'rgba(239, 68, 68, 0.05)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                      }}>
                        <ul style={{ listStyle: 'none', paddingLeft: '0', margin: '0', maxHeight: '250px', overflowY: 'auto', fontSize: '0.875rem' }}>
                          {previewData.errors.map((error, idx) => (
                            <li key={idx} style={{ 
                              padding: '8px 12px',
                              marginBottom: '4px',
                              background: 'white',
                              borderRadius: 'var(--radius)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{ 
                                background: 'var(--danger)',
                                color: 'white',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: '700',
                                flexShrink: 0
                              }}>
                                {idx + 1}
                              </span>
                              <span>{error}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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

          {/* New Items Section */}
          {previewData && previewData.preview && (
            <div className="card" style={{ border: '1px solid var(--border)', marginTop: '16px' }}>
              <div 
                style={{ 
                  padding: '12px 20px', 
                  borderBottom: showNewItems ? '1px solid var(--border)' : 'none', 
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => setShowNewItems(!showNewItems)}
              >
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      background: 'var(--success)', 
                      color: 'white', 
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: '700'
                    }}>
                      🆕
                    </span>
                    New Items ({previewData.preview.filter(item => !item.is_category && item.brand && item.description && item.unit && !duplicateDetails.some(d => d.description === item.description && d.unit === item.unit)).length})
                  </h3>
                  <button
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: 'none',
                      color: 'var(--success)',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}
                  >
                    {showNewItems ? '▲ Hide' : '▼ Show'}
                  </button>
                </div>
                {showNewItems && (
                  <div style={{ padding: '16px 20px', maxHeight: '300px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {previewData.preview
                        .filter(item => !item.is_category && item.brand && item.description && item.unit && !duplicateDetails.some(d => d.description === item.description && d.unit === item.unit))
                        .map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '12px',
                              background: 'rgba(16, 185, 129, 0.05)',
                              border: '1px solid rgba(16, 185, 129, 0.2)',
                              borderRadius: 'var(--radius)',
                              display: 'grid',
                              gridTemplateColumns: '120px 1fr 80px 100px 120px',
                              gap: '12px',
                              alignItems: 'center',
                              fontSize: '0.875rem'
                            }}
                          >
                            <div style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--success)' }}>
                              {item.batch_number && item.batch_number.endsWith('-AUTO') ? (
                                <span>{item.brand}-###</span>
                              ) : (
                                item.batch_number
                              )}
                            </div>
                            <div style={{ fontWeight: '600' }}>{item.description}</div>
                            <div style={{ color: 'var(--text-muted)' }}>{item.unit}</div>
                            <div>Qty: <span style={{ fontWeight: '600' }}>{item.quantity}</span></div>
                            <div>₱{item.unit_cost.toFixed(2)}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Duplicate Confirmation Modal */}
      {showDuplicateModal && (
        <div className="modal-overlay" onClick={() => setShowDuplicateModal(false)} style={{ zIndex: 10000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', maxHeight: '80vh' }}>
            <div style={{ 
              padding: '20px 24px', 
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
                ⚠️ Review Duplicates ({duplicateCount} items)
              </h2>
              <button
                onClick={() => setShowDuplicateModal(false)}
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

            <div style={{ padding: '20px', overflowY: 'auto', maxHeight: 'calc(80vh - 180px)' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                The following items already exist in your inventory. Select which ones you want to update:
              </p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.875rem', padding: '6px 12px' }}
                  onClick={() => setSelectedDuplicates(duplicateDetails.map((_, idx) => idx))}
                >
                  Select All
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.875rem', padding: '6px 12px' }}
                  onClick={() => setSelectedDuplicates([])}
                >
                  Deselect All
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {duplicateDetails.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: `2px solid ${selectedDuplicates.includes(idx) ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)',
                      padding: '12px',
                      background: selectedDuplicates.includes(idx) ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                    onClick={() => {
                      if (selectedDuplicates.includes(idx)) {
                        setSelectedDuplicates(selectedDuplicates.filter(i => i !== idx));
                      } else {
                        setSelectedDuplicates([...selectedDuplicates, idx]);
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedDuplicates.includes(idx)}
                        onChange={() => {}}
                        style={{ marginTop: '4px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{item.batch_number}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>•</span>
                          <span>{item.description}</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>({item.unit})</span>
                          {item.priceChanged && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '2px 8px', 
                              background: 'var(--warning)', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontWeight: '600'
                            }}>
                              PRICE CHANGED
                            </span>
                          )}
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.875rem' }}>
                          <div>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '600' }}>Current in DB:</div>
                            <div>Qty: <span style={{ fontWeight: '600' }}>{item.existing.quantity}</span></div>
                            <div>Cost: <span style={{ fontWeight: '600' }}>₱{parseFloat(item.existing.unit_cost).toFixed(2)}</span></div>
                            <div>Price: <span style={{ fontWeight: '600' }}>₱{parseFloat(item.existing.selling_price).toFixed(2)}</span></div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '600' }}>New from File:</div>
                            <div>Qty: <span style={{ fontWeight: '600', color: 'var(--success)' }}>+{item.new.quantity}</span></div>
                            <div>Cost: <span style={{ fontWeight: '600', color: item.priceChanged ? 'var(--warning)' : 'inherit' }}>₱{parseFloat(item.new.unit_cost).toFixed(2)}</span></div>
                            <div>Price: <span style={{ fontWeight: '600', color: item.priceChanged ? 'var(--warning)' : 'inherit' }}>₱{parseFloat(item.new.selling_price).toFixed(2)}</span></div>
                          </div>
                        </div>

                        {selectedDuplicates.includes(idx) && (
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '12px', 
                            background: 'rgba(16, 185, 129, 0.1)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '0.875rem'
                          }}>
                            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--success)' }}>
                              ✓ Update Options:
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginLeft: '8px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={updateOptions[idx]?.updateQty || false}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setUpdateOptions({
                                      ...updateOptions,
                                      [idx]: {
                                        ...updateOptions[idx],
                                        updateQty: e.target.checked
                                      }
                                    });
                                  }}
                                />
                                <span>Add Quantity (+{item.new.quantity})</span>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={updateOptions[idx]?.updatePrice || false}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setUpdateOptions({
                                      ...updateOptions,
                                      [idx]: {
                                        ...updateOptions[idx],
                                        updatePrice: e.target.checked
                                      }
                                    });
                                  }}
                                />
                                <span>Update Prices</span>
                              </label>
                            </div>
                            <div style={{ 
                              marginTop: '8px', 
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              paddingLeft: '8px'
                            }}>
                              {updateOptions[idx]?.updateQty && updateOptions[idx]?.updatePrice && (
                                `→ Qty: ${item.existing.quantity} + ${item.new.quantity} = ${parseInt(item.existing.quantity) + parseInt(item.new.quantity)}, Cost: ₱${parseFloat(item.new.unit_cost).toFixed(2)}, Price: ₱${parseFloat(item.new.selling_price).toFixed(2)}`
                              )}
                              {updateOptions[idx]?.updateQty && !updateOptions[idx]?.updatePrice && (
                                `→ Qty: ${item.existing.quantity} + ${item.new.quantity} = ${parseInt(item.existing.quantity) + parseInt(item.new.quantity)} (prices unchanged)`
                              )}
                              {!updateOptions[idx]?.updateQty && updateOptions[idx]?.updatePrice && (
                                `→ Cost: ₱${parseFloat(item.new.unit_cost).toFixed(2)}, Price: ₱${parseFloat(item.new.selling_price).toFixed(2)} (quantity unchanged)`
                              )}
                              {!updateOptions[idx]?.updateQty && !updateOptions[idx]?.updatePrice && (
                                `⚠️ No changes will be made`
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ 
              padding: '16px 24px', 
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-secondary)'
            }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {selectedDuplicates.length} of {duplicateCount} selected for update
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowDuplicateModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    performImport();
                  }}
                >
                  Confirm & Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportModal;
