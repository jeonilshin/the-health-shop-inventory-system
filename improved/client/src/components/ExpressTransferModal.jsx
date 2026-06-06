import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

function StepBar({ step }) {
  const labels = ['Select Locations', 'Add Items', 'Review & Transfer'];
  return (
    <div className="flex items-center gap-0 mb-6">
      {labels.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <React.Fragment key={num}>
            <div className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : num}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < labels.length - 1 && <div className={`flex-1 h-px mx-2 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ExpressTransferModal({ isOpen, onClose, locations, onTransferComplete }) {
  const [step, setStep] = useState(1);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [notes, setNotes] = useState('');
  const [inventory, setInventory] = useState([]); // source warehouse inventory
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]); // [{product_id, name, unit, quantity, available, unit_cost}]
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const warehouses = locations.filter(l => l.type === 'warehouse' || l.type === 'main');

  const reset = () => {
    setStep(1); setFromId(''); setToId(''); setNotes('');
    setInventory([]); setSelectedItems([]); setSearch('');
  };

  useEffect(() => { if (!isOpen) reset(); }, [isOpen]);

  const fetchInventory = useCallback(async (locId) => {
    if (!locId) return;
    setInventoryLoading(true);
    try {
      const res = await apiClient.get('/api/inventory', { params: { location_id: locId } });
      // Aggregate by product_id (sum across batches)
      const map = new Map();
      for (const row of res.data) {
        if (!map.has(row.product_id)) {
          map.set(row.product_id, { product_id: row.product_id, name: row.product_name, unit: row.unit, available: 0, unit_cost: row.unit_cost });
        }
        const entry = map.get(row.product_id);
        entry.available += parseFloat(row.quantity || 0);
        entry.unit_cost = row.unit_cost; // take latest
      }
      setInventory(Array.from(map.values()).filter(p => p.available > 0));
    } catch (err) {
      alert('Error loading inventory: ' + (err.response?.data?.error || err.message));
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  const handleFromChange = (id) => {
    setFromId(id);
    setSelectedItems([]);
    setInventory([]);
    fetchInventory(id);
  };

  const handleStep1Next = () => {
    if (!fromId || !toId) { alert('Please select both locations.'); return; }
    if (fromId === toId) { alert('Source and destination must be different.'); return; }
    setStep(2);
  };

  const addItem = (product) => {
    if (selectedItems.find(i => i.product_id === product.product_id)) return;
    setSelectedItems(prev => [...prev, { ...product, quantity: '' }]);
  };

  const removeItem = (product_id) => {
    setSelectedItems(prev => prev.filter(i => i.product_id !== product_id));
  };

  const updateQty = (product_id, qty) => {
    setSelectedItems(prev => prev.map(i => i.product_id === product_id ? { ...i, quantity: qty } : i));
  };

  const handleStep2Next = () => {
    if (selectedItems.length === 0) { alert('Please add at least one item.'); return; }
    for (const item of selectedItems) {
      const qty = parseFloat(item.quantity);
      if (!qty || qty <= 0) { alert(`Enter a valid quantity for ${item.name}`); return; }
      if (qty > item.available) { alert(`Insufficient stock for ${item.name}. Available: ${item.available}`); return; }
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const transfer = {
        from_location_id: parseInt(fromId),
        to_location_id: parseInt(toId),
        notes: notes || `Express Transfer — ${new Date().toLocaleDateString('en-PH')}`,
        items: selectedItems.map(i => ({ product_id: i.product_id, quantity: parseFloat(i.quantity) })),
      };
      const res = await apiClient.post('/api/transfers/batch', { transfers: [transfer] });
      if (!res.data.success && res.data.errors?.length > 0) {
        throw new Error(res.data.errors.join(', '));
      }
      onTransferComplete?.();
      reset();
      onClose();
    } catch (err) {
      alert('Transfer failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredInv = inventory.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const fromName = locations.find(l => String(l.id) === String(fromId))?.name;
  const toName = locations.find(l => String(l.id) === String(toId))?.name;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Express Transfer</h2>
            <p className="text-xs text-gray-500 mt-0.5">Instantly move stock between warehouses</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <StepBar step={step} />

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Source Warehouse <span className="text-red-500">*</span></label>
                <select
                  value={fromId}
                  onChange={e => handleFromChange(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select source...</option>
                  {warehouses.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <div className="text-gray-400 text-sm font-medium">→</div>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Destination Warehouse <span className="text-red-500">*</span></label>
                <select
                  value={toId}
                  onChange={e => setToId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select destination...</option>
                  {warehouses.filter(l => String(l.id) !== String(fromId)).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Reason for transfer..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Add Items */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                <div className="font-semibold text-blue-800">{fromName}</div>
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <div className="font-semibold text-blue-800">{toName}</div>
              </div>

              {/* Selected items */}
              {selectedItems.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                    Selected Items ({selectedItems.length})
                  </div>
                  <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {selectedItems.map(item => (
                      <div key={item.product_id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                          <div className="text-xs text-gray-500">Available: {item.available.toLocaleString()} {item.unit}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => updateQty(item.product_id, e.target.value)}
                            min="0.001"
                            max={item.available}
                            step="1"
                            placeholder="Qty"
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-500 w-10">{item.unit}</span>
                          <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product search */}
              <div>
                <div className="relative mb-2">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search products..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {inventoryLoading ? (
                  <div className="text-center py-8 text-gray-400 text-sm">Loading inventory...</div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    {filteredInv.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">No products found</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {filteredInv.map(product => {
                          const added = selectedItems.find(i => i.product_id === product.product_id);
                          return (
                            <div key={product.product_id} className={`flex items-center justify-between px-3 py-2.5 ${added ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                <div className="text-xs text-gray-500">{product.available.toLocaleString()} {product.unit} available</div>
                              </div>
                              <button
                                onClick={() => added ? removeItem(product.product_id) : addItem(product)}
                                className={`text-xs px-3 py-1 rounded-lg font-semibold transition-colors ${added ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                              >
                                {added ? 'Remove' : '+ Add'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                <div className="text-center">
                  <div className="font-bold text-blue-800">{fromName}</div>
                  <div className="text-xs text-blue-500">Source</div>
                </div>
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <div className="text-center">
                  <div className="font-bold text-blue-800">{toName}</div>
                  <div className="text-xs text-blue-500">Destination</div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                  Transfer Items ({selectedItems.length})
                </div>
                <div className="divide-y divide-gray-100">
                  {selectedItems.map(item => (
                    <div key={item.product_id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.unit}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">{parseFloat(item.quantity).toLocaleString()}</div>
                        <div className="text-xs text-gray-500">of {item.available.toLocaleString()} available</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {notes && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
                  <span className="font-medium">Notes:</span> {notes}
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                This transfer will be <strong>immediately completed</strong>. Inventory will be deducted from {fromName} and added to {toName} right away.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={step === 1 ? handleStep1Next : handleStep2Next}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {submitting ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
