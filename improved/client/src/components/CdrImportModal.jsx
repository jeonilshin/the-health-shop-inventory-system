import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

const STEP_LABELS = ['Upload CSV', 'Map Branches', 'Validate Items', 'Review & Import'];

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <React.Fragment key={num}>
            <div className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {done ? '✓' : num}
              </div>
              <span className={`text-[11px] font-medium whitespace-nowrap ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <div className={`flex-1 h-px mx-1 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Fuzzy branch name matcher
function findBestMatch(outlet, branches) {
  if (!outlet) return null;
  const lower = outlet.toLowerCase();
  const exact = branches.find(b => b.name.toLowerCase() === lower);
  if (exact) return exact;
  const words = lower.replace(/\b(the|and|or|branch|store|shop|mall|center|centre)\b/g, '').split(/[\s\-_]+/).filter(w => w.length > 2);
  let best = null, bestScore = 0;
  for (const b of branches) {
    const bl = b.name.toLowerCase();
    const score = words.filter(w => bl.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return bestScore > 0 ? best : null;
}

export default function CdrImportModal({ isOpen, onClose, locations, onImportComplete }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [cdrRows, setCdrRows] = useState([]);   // parsed CDR rows
  const [mappings, setMappings] = useState({}); // outlet -> branch id
  const [unmapped, setUnmapped] = useState([]); // outlets without match
  const [validatedRows, setValidatedRows] = useState([]); // rows with suggested inventory
  const [warehouseInv, setWarehouseInv] = useState([]); // source warehouse inventory
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  const branches = locations.filter(l => l.type === 'branch');
  const warehouses = locations.filter(l => l.type === 'warehouse' || l.type === 'main');

  const reset = () => {
    setStep(1); setFile(null); setFromWarehouse(''); setCdrRows([]);
    setMappings({}); setUnmapped([]); setValidatedRows([]); setWarehouseInv([]);
    setShowErrorsOnly(false);
  };

  useEffect(() => { if (!isOpen) reset(); }, [isOpen]);

  const parseCsv = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n');
      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('DATE') && lines[i].includes('OUTLET') && lines[i].includes('ITEM DESCRIPTION')) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) throw new Error('Could not find header row. File must have DATE, OUTLET, ITEM DESCRIPTION columns.');

      const headers = lines[headerIdx].split(',').map(h => h.replace(/"/g, '').trim());
      const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim() && !l.startsWith(','));

      const rows = [];
      const outlets = new Set();

      for (const line of dataLines) {
        const vals = line.split(',').map(v => v.replace(/"/g, '').trim());
        const row = {};
        headers.forEach((h, i) => { row[h] = vals[i] || ''; });
        if (!row['OUTLET'] || !row['ITEM DESCRIPTION'] || !row['QUANTITY']) continue;
        if (row['OUTLET'] === 'LGD') continue; // skip LGD for now
        outlets.add(row['OUTLET']);
        rows.push({
          outlet: row['OUTLET'],
          description: row['ITEM DESCRIPTION'],
          unit: row['UoM'] || row['UOM'] || '',
          quantity: parseInt(row['QUANTITY']) || 0,
          brand: row['BRAND'] || '',
          date: row['DATE'] || '',
        });
      }

      if (rows.length === 0) throw new Error('No valid data rows found in CSV.');

      // Auto-map outlets
      const autoMappings = {};
      const noMatch = [];
      for (const outlet of outlets) {
        const match = findBestMatch(outlet, branches);
        if (match) autoMappings[outlet] = match.id;
        else noMatch.push(outlet);
      }

      setCdrRows(rows);
      setMappings(autoMappings);
      setUnmapped(noMatch);
      setStep(2);
    } catch (err) {
      alert('Error parsing CSV: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAndValidate = useCallback(async () => {
    if (!fromWarehouse) { alert('Please select a source warehouse.'); return; }
    const allMapped = [...new Set(cdrRows.map(r => r.outlet))].every(o => mappings[o]);
    if (!allMapped) { alert('Please map all outlets to branches.'); return; }

    setLoading(true);
    try {
      const invRes = await apiClient.get('/api/inventory', { params: { location_id: fromWarehouse } });
      // Aggregate by product name+unit
      const map = new Map();
      for (const row of invRes.data) {
        const key = `${row.product_name.toLowerCase()}|||${row.unit.toLowerCase()}`;
        if (!map.has(key)) map.set(key, { product_id: row.product_id, name: row.product_name, unit: row.unit, available: 0 });
        map.get(key).available += parseFloat(row.quantity || 0);
      }
      const invList = Array.from(map.values());
      setWarehouseInv(invList);

      // Validate each CDR row
      const validated = cdrRows.map(row => {
        const key = `${row.description.toLowerCase()}|||${row.unit.toLowerCase()}`;
        let match = invList.find(inv => `${inv.name.toLowerCase()}|||${inv.unit.toLowerCase()}` === key);
        if (!match) {
          // Fuzzy: name contains
          match = invList.find(inv =>
            inv.name.toLowerCase().includes(row.description.toLowerCase()) ||
            row.description.toLowerCase().includes(inv.name.toLowerCase())
          );
        }
        let error = null;
        if (!match) error = 'Product not found in warehouse inventory';
        else if (match.available < row.quantity) error = `Insufficient stock. Available: ${match.available}, Requested: ${row.quantity}`;
        return { ...row, match, error, branchId: mappings[row.outlet] };
      });

      setValidatedRows(validated);
      setStep(3);
    } catch (err) {
      alert('Validation error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [fromWarehouse, cdrRows, mappings, branches]);

  const handleSubmit = async () => {
    const validRows = validatedRows.filter(r => !r.error && r.match);
    if (validRows.length === 0) { alert('No valid items to transfer.'); return; }

    // Group by outlet → branch
    const byBranch = new Map();
    for (const row of validRows) {
      if (!byBranch.has(row.branchId)) byBranch.set(row.branchId, []);
      byBranch.get(row.branchId).push(row);
    }

    const transfers = [];
    for (const [branchId, rows] of byBranch) {
      // Aggregate by product_id (sum quantities)
      const productMap = new Map();
      for (const row of rows) {
        if (!productMap.has(row.match.product_id)) productMap.set(row.match.product_id, 0);
        productMap.set(row.match.product_id, productMap.get(row.match.product_id) + row.quantity);
      }
      transfers.push({
        from_location_id: parseInt(fromWarehouse),
        to_location_id: branchId,
        notes: `CDR Import — ${new Date().toLocaleDateString('en-PH')}`,
        items: Array.from(productMap.entries()).map(([product_id, quantity]) => ({ product_id, quantity })),
      });
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/api/transfers/batch', { transfers });
      const { results, errors } = res.data;
      let msg = `CDR Import complete! ${results.length} transfer(s) created.`;
      if (errors.length > 0) msg += `\n${errors.length} error(s): ${errors.slice(0, 3).join(', ')}`;
      alert(msg);
      onImportComplete?.();
      reset();
      onClose();
    } catch (err) {
      alert('Import failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const outlets = [...new Set(cdrRows.map(r => r.outlet))];
  const validCount = validatedRows.filter(r => !r.error).length;
  const errorCount = validatedRows.filter(r => r.error).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">CDR Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">Import delivery records from CDR CSV and dispatch to branches</p>
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
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <div className="font-semibold mb-1">Expected CDR CSV columns:</div>
                <div className="flex flex-wrap gap-1">
                  {['DATE', 'OUTLET', 'BRAND', 'ITEM DESCRIPTION', 'UoM', 'QUANTITY', 'REMARKS'].map(c => (
                    <code key={c} className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{c}</code>
                  ))}
                </div>
                <div className="mt-1.5 text-blue-600">The CSV header row must contain DATE, OUTLET, and ITEM DESCRIPTION.</div>
              </div>

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {file ? (
                    <span className="text-sm font-medium text-blue-700">{file.name}</span>
                  ) : (
                    <span className="text-sm text-gray-500">Click to choose CDR CSV file</span>
                  )}
                </div>
                <input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])} className="hidden" />
              </label>
            </div>
          )}

          {/* Step 2: Map Branches */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Source Warehouse <span className="text-red-500">*</span></label>
                <select
                  value={fromWarehouse}
                  onChange={e => setFromWarehouse(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select warehouse...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Outlet → Branch Mapping</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${unmapped.length === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {outlets.length - unmapped.length}/{outlets.length} mapped
                  </span>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {outlets.map(outlet => (
                    <div key={outlet} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 text-sm font-medium text-gray-900">{outlet}</div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <select
                        value={mappings[outlet] || ''}
                        onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : undefined;
                          setMappings(prev => {
                            const next = { ...prev };
                            if (val) { next[outlet] = val; setUnmapped(u => u.filter(o => o !== outlet)); }
                            else { delete next[outlet]; if (!unmapped.includes(outlet)) setUnmapped(u => [...u, outlet]); }
                            return next;
                          });
                        }}
                        className={`flex-1 px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${mappings[outlet] ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}
                      >
                        <option value="">— Not mapped —</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Validate */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{validCount}</div>
                  <div className="text-xs text-green-600">Ready</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-red-700">{errorCount}</div>
                  <div className="text-xs text-red-600">Errors</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{outlets.length}</div>
                  <div className="text-xs text-blue-600">Branches</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Items ({validatedRows.length})</span>
                <button
                  onClick={() => setShowErrorsOnly(v => !v)}
                  className={`text-xs px-2 py-1 rounded border ${showErrorsOnly ? 'bg-red-600 text-white border-red-600' : 'text-gray-500 border-gray-300 hover:bg-gray-50'}`}
                >
                  {showErrorsOnly ? 'Show All' : `Errors Only (${errorCount})`}
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-y-auto max-h-64">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Outlet → Branch</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Product</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {validatedRows
                        .filter(r => !showErrorsOnly || r.error)
                        .map((r, i) => (
                          <tr key={i} className={r.error ? 'bg-red-50' : 'hover:bg-gray-50'}>
                            <td className="px-3 py-2 text-gray-600">
                              <div>{r.outlet}</div>
                              <div className="text-gray-400">{locations.find(l => l.id === r.branchId)?.name}</div>
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              <div>{r.description}</div>
                              <div className="text-gray-400">{r.unit}</div>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-900">{r.quantity}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="text-red-600 font-medium">{r.error}</span>
                              ) : (
                                <span className="text-green-600 font-semibold">✓ Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {errorCount > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  {errorCount} item(s) with errors will be skipped. {validCount} item(s) will proceed.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
                Back
              </button>
            )}
            {step === 1 && (
              <button
                onClick={parseCsv}
                disabled={!file || loading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg"
              >
                {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {loading ? 'Parsing...' : 'Parse File →'}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={fetchAndValidate}
                disabled={!fromWarehouse || loading || unmapped.length > 0}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg"
              >
                {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {loading ? 'Validating...' : 'Validate Items →'}
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSubmit}
                disabled={submitting || validCount === 0}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold rounded-lg"
              >
                {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {submitting ? 'Importing...' : `Import ${validCount} Items`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
