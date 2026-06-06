import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

export default function UnitConversions() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [conversions, setConversions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ product_id: '', from_unit: '', to_unit: '', factor: '' });
  const [editFactor, setEditFactor] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [convRes, prodRes] = await Promise.all([
        apiClient.get('/api/unit-conversions'),
        apiClient.get('/api/products'),
      ]);
      setConversions(convRes.data || []);
      setProducts(prodRes.data || []);
    } catch {
      showToast('Failed to load.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.product_id || !form.from_unit || !form.to_unit || !form.factor) {
      showToast('All fields required.', 'warning'); return;
    }
    setSaving(true);
    try {
      await apiClient.post('/api/unit-conversions', {
        product_id: parseInt(form.product_id),
        from_unit: form.from_unit,
        to_unit: form.to_unit,
        factor: parseFloat(form.factor),
      });
      showToast('Conversion saved.', 'success');
      setShowCreate(false);
      setForm({ product_id: '', from_unit: '', to_unit: '', factor: '' });
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editFactor || parseFloat(editFactor) <= 0) { showToast('Factor must be > 0.', 'warning'); return; }
    setSaving(true);
    try {
      await apiClient.put(`/api/unit-conversions/${editRow.id}`, { factor: parseFloat(editFactor) });
      showToast('Updated.', 'success');
      setShowEdit(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this conversion?')) return;
    try {
      await apiClient.delete(`/api/unit-conversions/${id}`);
      showToast('Deleted.', 'success');
      fetchAll();
    } catch {
      showToast('Failed to delete.', 'error');
    }
  };

  const filtered = conversions.filter((c) =>
    !search || c.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.from_unit?.toLowerCase().includes(search.toLowerCase()) ||
    c.to_unit?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unit Conversions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define how product units convert (e.g. 1 box = 12 pieces).</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setForm({ product_id: '', from_unit: '', to_unit: '', factor: '' }); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Conversion
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or unit..."
          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">No conversions found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  {['Product', 'From Unit', 'To Unit', 'Factor', 'Meaning', ...(isAdmin ? ['Actions'] : [])].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{c.product_name}</td>
                    <td className="px-5 py-3 text-gray-700">{c.from_unit}</td>
                    <td className="px-5 py-3 text-gray-700">{c.to_unit}</td>
                    <td className="px-5 py-3 font-mono text-gray-900">{+parseFloat(c.factor)}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      1 {c.from_unit} = {parseFloat(c.factor)} {c.to_unit}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditRow(c); setEditFactor(String(c.factor)); setShowEdit(true); }}
                            className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Unit Conversion" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <select
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select product...</option>
              {products.filter((p) => p.is_active !== false).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Unit</label>
              <input type="text" value={form.from_unit} onChange={(e) => setForm((f) => ({ ...f, from_unit: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. box" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Unit</label>
              <input type="text" value={form.to_unit} onChange={(e) => setForm((f) => ({ ...f, to_unit: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. piece" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conversion Factor</label>
            <input type="number" min="0.000001" step="any" value={form.factor} onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 12 (1 box = 12 pieces)" />
          </div>
          {form.from_unit && form.to_unit && form.factor && (
            <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
              1 {form.from_unit} = {form.factor} {form.to_unit}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium flex items-center gap-2">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Conversion Factor" size="sm">
        {editRow && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Updating: <strong>1 {editRow.from_unit} = ? {editRow.to_unit}</strong> for <strong>{editRow.product_name}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Factor</label>
              <input type="number" min="0.000001" step="any" value={editFactor} onChange={(e) => setEditFactor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {editFactor && (
              <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                1 {editRow.from_unit} = {editFactor} {editRow.to_unit}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleEdit} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {saving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
