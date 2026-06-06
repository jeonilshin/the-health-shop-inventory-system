import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

const STEP_LABELS = ['Upload File', 'Preview & Review', 'Import'];

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <React.Fragment key={num}>
            <div className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : num}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <div className={`flex-1 h-px mx-2 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ImportModal({ isOpen, onClose, locations, selectedLocation, onImported }) {
  const { isAdmin, isWarehouse, user } = useAuth();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [locationId, setLocationId] = useState('');
  const [previewData, setPreviewData] = useState([]);
  const [duplicateDetails, setDuplicateDetails] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dupAction, setDupAction] = useState('update'); // 'update' | 'skip'
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setFile(null); setLocationId(''); setPreviewData([]);
      setDuplicateDetails([]); setErrors([]); setResult(null); setDupAction('update');
      setShowErrorsOnly(false);
    } else {
      // Pre-select location for non-admin
      if (!isAdmin && user?.location_id) setLocationId(String(user.location_id));
      else if (selectedLocation) setLocationId(String(selectedLocation));
    }
  }, [isOpen, isAdmin, user, selectedLocation]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const handlePreview = async () => {
    if (!file) return;
    if (!locationId) { alert('Please select a location first.'); return; }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('locationId', locationId);
      const res = await apiClient.post('/api/import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!res.data.success) throw new Error(res.data.error || 'Preview failed');
      setPreviewData(res.data.preview || []);
      setDuplicateDetails(res.data.duplicateDetails || []);
      setErrors(res.data.errors || []);
      setStep(2);
    } catch (err) {
      alert('Preview error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await apiClient.post('/api/import/import', {
        data: previewData.filter(item => !item.is_category),
        locationId,
        duplicateAction: dupAction,
        selectedDuplicates: [],
      });
      setResult(res.data);
      setStep(3);
      onImported?.();
    } catch (err) {
      alert('Import error: ' + (err.response?.data?.error || err.message));
    } finally {
      setImporting(false);
    }
  };

  const items = previewData.filter(item => !item.is_category);
  const categories = previewData.filter(item => item.is_category);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import Excel / CSV</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload an inventory spreadsheet to bulk-import products</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <StepBar step={step} />

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Import to Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={locationId}
                  onChange={e => setLocationId(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                >
                  <option value="">Select location...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </select>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <div className="font-semibold mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Expected Excel column headers:
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {['BRAND', 'NUMBER', 'THE HEALTHSHOP PRODUCTS / DESCRIPTION', 'UOM', 'AVE UNIT COST', 'QTY', 'EXPIRY DATE', 'CONTENT'].map(c => (
                    <code key={c} className="text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">{c}</code>
                  ))}
                </div>
                <div className="mt-2 text-blue-600">The file should have a header row with these columns. Category rows (no brand/unit) are auto-detected.</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Select Excel File (.xlsx, .xls, .csv) <span className="text-red-500">*</span>
                </label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {file ? (
                      <span className="text-sm font-medium text-blue-700">{file.name}</span>
                    ) : (
                      <span className="text-sm text-gray-500">Click to choose file or drag and drop</span>
                    )}
                  </div>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{items.length}</div>
                  <div className="text-xs text-blue-600 mt-0.5">Products</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">{duplicateDetails.length}</div>
                  <div className="text-xs text-amber-600 mt-0.5">Duplicates</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-700">{categories.length}</div>
                  <div className="text-xs text-gray-600 mt-0.5">Categories</div>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <div className="font-semibold mb-1">{errors.length} validation errors:</div>
                  {errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                  {errors.length > 5 && <div>...and {errors.length - 5} more</div>}
                </div>
              )}

              {duplicateDetails.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-800">Duplicate Handling</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDupAction('update')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${dupAction === 'update' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                      Add Quantity
                    </button>
                    <button
                      onClick={() => setDupAction('skip')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${dupAction === 'skip' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                      Skip Duplicates
                    </button>
                  </div>
                  <div className="text-xs text-amber-700">
                    {dupAction === 'update' ? 'Quantities will be added to existing stock.' : 'Duplicate items will be skipped.'}
                  </div>
                </div>
              )}

              {/* Preview table */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Preview ({items.length} products)</span>
                <button
                  onClick={() => setShowErrorsOnly(v => !v)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${showErrorsOnly ? 'bg-red-600 text-white border-red-600' : 'text-gray-500 border-gray-300 hover:bg-gray-50'}`}
                >
                  {showErrorsOnly ? 'Show All' : 'Errors Only'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Qty</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Cost</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Expiry</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.filter(item => !showErrorsOnly || !item.description || !item.unit).map((item, i) => {
                        const isDup = duplicateDetails.some(d => d.description === item.description && d.unit === item.unit);
                        return (
                          <tr key={i} className={`${isDup ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {item.description || <span className="text-red-500 italic">Missing</span>}
                              {isDup && <span className="ml-1 text-amber-600 text-[10px] font-semibold">(DUP)</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{item.unit || <span className="text-red-500 italic">Missing</span>}</td>
                            <td className="px-3 py-2 text-right text-gray-900">{item.quantity || 0}</td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {item.unit_cost > 0 ? `₱${parseFloat(item.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{item.expiry_date || '—'}</td>
                            <td className="px-3 py-2 text-gray-400">{item.main_category || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && result && (
            <div className="flex flex-col items-center py-6 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900">Import Complete</h3>
                <p className="text-sm text-gray-500 mt-1">{result.message}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-green-700">{result.imported}</div>
                  <div className="text-xs text-green-600">New</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-blue-700">{result.updated}</div>
                  <div className="text-xs text-blue-600">Updated</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-700">{result.skipped}</div>
                  <div className="text-xs text-gray-600">Skipped</div>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <div className="font-semibold mb-1">Errors:</div>
                  {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            {step === 3 ? 'Close' : 'Cancel'}
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
            )}
            {step === 1 && (
              <button
                onClick={handlePreview}
                disabled={!file || !locationId || loading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {loading ? 'Parsing...' : 'Preview File'}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={handleImport}
                disabled={importing || items.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {importing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {importing ? 'Importing...' : `Import ${items.length} Products`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
