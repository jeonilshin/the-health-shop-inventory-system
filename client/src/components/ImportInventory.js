import React, { useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

function ImportInventory() {
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
    fetchLocations();
  }, [fetchLocations]);

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
      document.getElementById('fileInput').value = '';
    } catch (error) {
      showToast().error('Error', error.response?.data?.error || 'Failed to import data');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Import Inventory from Excel</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Warehouse Location
          </label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Send to Branch (Optional)
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- No Transfer (Import to Warehouse Only) --</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          <p className="text-sm text-gray-500 mt-1">
            If selected, items will be imported to warehouse and automatically transferred to the branch
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Excel File
          </label>
          <input
            id="fileInput"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-sm text-gray-500 mt-2">
            Expected columns: Brand, Number, THE HEALTHSHOP PRODUCTS, UoM, Content, Ave Unit Cost, Selling Price, QTY
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Preview Data'}
          </button>

          {previewData && (
            <button
              onClick={handleImport}
              disabled={importing || !selectedLocation}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing...' : 'Import to Inventory'}
            </button>
          )}
        </div>
      </div>

      {previewData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">
            Preview ({previewData.totalRows} rows)
          </h2>

          {previewData.errors && previewData.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
              <h3 className="font-semibold text-red-800 mb-2">Validation Errors:</h3>
              <ul className="list-disc list-inside text-sm text-red-700">
                {previewData.errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch Number</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selling Price</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewData.preview.map((item, idx) => (
                  <tr key={idx} className={!item.batch_number || !item.description ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-sm">{item.rowNumber}</td>
                    <td className="px-3 py-2 text-sm font-medium">{item.batch_number || '❌'}</td>
                    <td className="px-3 py-2 text-sm">{item.description || '❌'}</td>
                    <td className="px-3 py-2 text-sm">{item.unit || '❌'}</td>
                    <td className="px-3 py-2 text-sm">{item.quantity}</td>
                    <td className="px-3 py-2 text-sm">₱{item.unit_cost.toFixed(2)}</td>
                    <td className="px-3 py-2 text-sm">₱{item.suggested_selling_price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportInventory;
