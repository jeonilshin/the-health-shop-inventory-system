import React, { useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

function ImportModal({ isOpen, onClose, onImportComplete }) {
  const showToast = useToast();
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
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
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        showToast().error('Error', 'Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setFile(selectedFile);
      setPreviewData(null);
    }
  };

  const handlePreview = async () => {
    if (!file) {
      showToast().error('Error', 'Please select a file first');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

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

    if (previewData.errors && previewData.errors.length > 0) {
      if (!window.confirm('There are validation errors. Do you want to continue importing valid rows?')) {
        return;
      }
    }

    setImporting(true);

    try {
      const response = await api.post('/import/import', {
        data: previewData.preview,
        locationId: selectedLocation,
        branchId: selectedBranch || null
      });

      showToast().success(
        'Success',
        `Import complete: ${response.data.imported} new, ${response.data.updated} updated${response.data.transferred > 0 ? `, ${response.data.transferred} transferred` : ''}, ${response.data.skipped} skipped`
      );

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h2 className="text-2xl font-bold text-white">Import Inventory from Excel</h2>
          <button
            onClick={handleClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4 mb-6">
            {/* Location Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Import to Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Also Transfer to Branch (Optional)
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  disabled={!selectedLocation || branches.some(b => b.id === parseInt(selectedLocation))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- No Transfer --</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>🏪 {branch.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {branches.some(b => b.id === parseInt(selectedLocation)) 
                    ? 'Not available when importing directly to branch'
                    : 'Create automatic transfer after import'}
                </p>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Excel File <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="fileInput"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <button
                  onClick={handlePreview}
                  disabled={!file || loading || !selectedLocation}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading...
                    </span>
                  ) : 'Preview'}
                </button>
              </div>
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800 font-medium">Expected columns (case-insensitive):</p>
                <p className="text-xs text-blue-700 mt-1">BRAND, Number, PRODUCT DESCRIPTION (or THE HEALTHSHOP PRODUCTS), UoM, CONTENT, Ave Unit Cost, Selling Price, QTY</p>
                <p className="text-xs text-blue-600 mt-1 italic">Note: The file can have title rows at the top - they will be automatically detected and skipped.</p>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          {previewData && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">
                  Preview ({previewData.totalRows} rows)
                </h3>
                <button
                  onClick={handleImport}
                  disabled={importing || !selectedLocation}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                >
                  {importing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Importing...
                    </span>
                  ) : '✓ Import to Inventory'}
                </button>
              </div>

              {previewData.errors && previewData.errors.length > 0 && (
                <div className="bg-red-50 border-b border-red-200 p-4">
                  <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Validation Errors ({previewData.errors.length})
                  </h4>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                    {previewData.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Row</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Batch #</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Description</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Unit</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Qty</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Unit Cost</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Selling Price</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewData.preview.map((item, idx) => (
                      <tr key={idx} className={!item.batch_number || !item.description ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-sm text-gray-600">{item.rowNumber}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.batch_number || <span className="text-red-500">❌ Missing</span>}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{item.description || <span className="text-red-500">❌ Missing</span>}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{item.unit || <span className="text-red-500">❌ Missing</span>}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{item.quantity}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">₱{item.unit_cost.toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">₱{item.suggested_selling_price.toFixed(2)}</td>
                      </tr>
                    ))}
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
