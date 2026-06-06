import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const ROLES = ['admin', 'warehouse', 'manager', 'staff', 'audit'];
const LOCATION_TYPES = ['warehouse', 'branch'];

const roleColors = {
  admin: 'bg-red-100 text-red-700',
  warehouse: 'bg-blue-100 text-blue-700',
  manager: 'bg-purple-100 text-purple-700',
  staff: 'bg-green-100 text-green-700',
  audit: 'bg-gray-100 text-gray-700',
};

const locationTypeColors = {
  warehouse: 'bg-blue-100 text-blue-700',
  branch: 'bg-green-100 text-green-700',
};

export default function Admin() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);

  // Users
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Locations
  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(true);

  // Products
  const [products, setProducts] = useState([]);
  const [prodLoading, setProdLoading] = useState(true);

  // Modals
  const [modal, setModal] = useState(null); // {type: 'addUser'|'editUser'|'deleteUser'|...}
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchLocations();
    fetchProducts();
  }, []);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try { const r = await apiClient.get('/api/users'); setUsers(r.data || []); } catch { showToast('Failed to load users.', 'error'); }
    finally { setUsersLoading(false); }
  };

  const fetchLocations = async () => {
    setLocLoading(true);
    try { const r = await apiClient.get('/api/locations'); setLocations(r.data || []); } catch {}
    finally { setLocLoading(false); }
  };

  const fetchProducts = async () => {
    setProdLoading(true);
    try { const r = await apiClient.get('/api/products'); setProducts(r.data || []); } catch {}
    finally { setProdLoading(false); }
  };

  const openModal = (type, item = null, initialForm = {}) => {
    setModal(type);
    setSelected(item);
    setForm(initialForm);
    setFormErrors({});
  };

  const closeModal = () => { setModal(null); setSelected(null); setForm({}); setFormErrors({}); };

  const handleFormChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // ===== USERS =====
  const validateUserForm = (isEdit = false) => {
    const e = {};
    if (!form.username && !isEdit) e.username = 'Username is required.';
    if (!form.password && !isEdit) e.password = 'Password is required.';
    if (!form.full_name) e.full_name = 'Full name is required.';
    if (!form.role) e.role = 'Role is required.';
    return e;
  };

  const handleAddUser = async () => {
    const e = validateUserForm();
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      await apiClient.post('/api/users', form);
      showToast('User created.', 'success');
      closeModal();
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create user.', 'error');
    } finally { setSaving(false); }
  };

  const handleEditUser = async () => {
    const e = validateUserForm(true);
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      await apiClient.put(`/api/users/${selected.id}`, {
        full_name: form.full_name,
        role: form.role,
        location_id: form.location_id || null,
        is_active: form.is_active,
      });
      showToast('User updated.', 'success');
      closeModal();
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update user.', 'error');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (user) => {
    try {
      await apiClient.put(`/api/users/${user.id}`, { ...user, is_active: !user.is_active });
      showToast(`User ${user.is_active ? 'deactivated' : 'activated'}.`, 'success');
      fetchUsers();
    } catch { showToast('Failed to update user status.', 'error'); }
  };

  const handleDeleteUser = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/api/users/${selected.id}`);
      showToast('User deleted.', 'success');
      closeModal();
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete user.', 'error');
    } finally { setSaving(false); }
  };

  // ===== LOCATIONS =====
  const validateLocForm = () => {
    const e = {};
    if (!form.name) e.name = 'Name is required.';
    if (!form.type) e.type = 'Type is required.';
    return e;
  };

  const handleAddLocation = async () => {
    const e = validateLocForm();
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      await apiClient.post('/api/locations', form);
      showToast('Location created.', 'success');
      closeModal();
      fetchLocations();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create location.', 'error');
    } finally { setSaving(false); }
  };

  const handleEditLocation = async () => {
    const e = validateLocForm();
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      await apiClient.put(`/api/locations/${selected.id}`, form);
      showToast('Location updated.', 'success');
      closeModal();
      fetchLocations();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update location.', 'error');
    } finally { setSaving(false); }
  };

  const handleDeleteLocation = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/api/locations/${selected.id}`);
      showToast('Location deleted.', 'success');
      closeModal();
      fetchLocations();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete location.', 'error');
    } finally { setSaving(false); }
  };

  // ===== PRODUCTS =====
  const validateProdForm = () => {
    const e = {};
    if (!form.name) e.name = 'Name is required.';
    if (!form.unit) e.unit = 'Unit is required.';
    return e;
  };

  const handleAddProduct = async () => {
    const e = validateProdForm();
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      await apiClient.post('/api/products', form);
      showToast('Product created.', 'success');
      closeModal();
      fetchProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create product.', 'error');
    } finally { setSaving(false); }
  };

  const handleEditProduct = async () => {
    const e = validateProdForm();
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      await apiClient.put(`/api/products/${selected.id}`, form);
      showToast('Product updated.', 'success');
      closeModal();
      fetchProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update product.', 'error');
    } finally { setSaving(false); }
  };

  const handleDeleteProduct = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/api/products/${selected.id}`);
      showToast('Product deleted.', 'success');
      closeModal();
      fetchProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete product.', 'error');
    } finally { setSaving(false); }
  };

  // Input helper
  const Field = ({ name, label, type = 'text', required, options, ...props }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {options ? (
        <select
          value={form[name] ?? ''}
          onChange={(e) => handleFormChange(name, e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors[name] ? 'border-red-400' : 'border-gray-300'}`}
        >
          <option value="">Select...</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[name] ?? ''}
          onChange={(e) => handleFormChange(name, e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors[name] ? 'border-red-400' : 'border-gray-300'}`}
          {...props}
        />
      )}
      {formErrors[name] && <p className="mt-1 text-xs text-red-600">{formErrors[name]}</p>}
    </div>
  );

  const LoadingRows = ({ cols }) => (
    <tbody>{[...Array(5)].map((_, i) => (<tr key={i}>{[...Array(cols)].map((_, j) => (<td key={j} className="px-5 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>))}</tr>))}</tbody>
  );

  const DeleteConfirmModal = ({ title, entity, onConfirm }) => (
    <Modal isOpen={modal?.startsWith('delete')} onClose={closeModal} title={title} size="sm">
      <p className="text-sm text-gray-600 mb-5">Are you sure you want to delete <strong>{entity}</strong>? This cannot be undone.</p>
      <div className="flex justify-end gap-3">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg flex items-center gap-2"
        >
          {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Delete
        </button>
      </div>
    </Modal>
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-6xl font-bold text-gray-200 mb-4">403</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Access Denied</h2>
        <p className="text-gray-500">Only administrators can access this panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, locations, and products.</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1">
        {['Users', 'Locations', 'Products'].map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === i ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ===== USERS TAB ===== */}
      {tab === 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Users ({users.length})</h2>
            <button
              onClick={() => openModal('addUser', null, { is_active: true })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Username', 'Full Name', 'Role', 'Location', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                {usersLoading ? <LoadingRows cols={6} /> : (
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{u.username}</td>
                        <td className="px-5 py-3 text-gray-700">{u.full_name}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[u.role] || 'bg-gray-100 text-gray-700'}`}>{u.role}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{u.location_name || '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openModal('editUser', u, { full_name: u.full_name, role: u.role, location_id: u.location_id || '', is_active: u.is_active })}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium"
                            >Edit</button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${u.is_active ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}
                            >{u.is_active ? 'Deactivate' : 'Activate'}</button>
                            <button
                              onClick={() => openModal('deleteUser', u)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium"
                            >Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </div>

          {/* Add User Modal */}
          <Modal isOpen={modal === 'addUser'} onClose={closeModal} title="Add User" size="md">
            <div className="space-y-4">
              <Field name="username" label="Username" required autoComplete="off" />
              <Field name="password" label="Password" type="password" required />
              <Field name="full_name" label="Full Name" required />
              <Field name="role" label="Role" required options={ROLES.map((r) => ({ value: r, label: r }))} />
              <Field name="location_id" label="Location" options={locations.map((l) => ({ value: l.id, label: l.name }))} />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleAddUser} disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Create User
              </button>
            </div>
          </Modal>

          {/* Edit User Modal */}
          <Modal isOpen={modal === 'editUser'} onClose={closeModal} title={`Edit User: ${selected?.username}`} size="md">
            <div className="space-y-4">
              <Field name="full_name" label="Full Name" required />
              <Field name="role" label="Role" required options={ROLES.map((r) => ({ value: r, label: r }))} />
              <Field name="location_id" label="Location" options={locations.map((l) => ({ value: l.id, label: l.name }))} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) => handleFormChange('is_active', e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleEditUser} disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </Modal>

          {/* Delete User */}
          {modal === 'deleteUser' && (
            <Modal isOpen={true} onClose={closeModal} title="Delete User" size="sm">
              <p className="text-sm text-gray-600 mb-5">Delete user <strong>{selected?.username}</strong>? This cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handleDeleteUser} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2">
                  {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Delete
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ===== LOCATIONS TAB ===== */}
      {tab === 1 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Locations ({locations.length})</h2>
            <button
              onClick={() => openModal('addLocation')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Location
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Name', 'Type', 'Address', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                {locLoading ? <LoadingRows cols={4} /> : (
                  <tbody className="divide-y divide-gray-100">
                    {locations.map((loc) => (
                      <tr key={loc.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{loc.name}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${locationTypeColors[loc.type] || 'bg-gray-100 text-gray-700'}`}>{loc.type}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{loc.address || '—'}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openModal('editLocation', loc, { name: loc.name, type: loc.type, address: loc.address || '' })}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium"
                            >Edit</button>
                            <button
                              onClick={() => openModal('deleteLocation', loc)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium"
                            >Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </div>

          {/* Add/Edit Location Modal */}
          <Modal isOpen={modal === 'addLocation' || modal === 'editLocation'} onClose={closeModal} title={modal === 'addLocation' ? 'Add Location' : 'Edit Location'} size="md">
            <div className="space-y-4">
              <Field name="name" label="Name" required />
              <Field name="type" label="Type" required options={LOCATION_TYPES.map((t) => ({ value: t, label: t }))} />
              <Field name="address" label="Address" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button
                onClick={modal === 'addLocation' ? handleAddLocation : handleEditLocation}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg flex items-center gap-2"
              >
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {modal === 'addLocation' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </Modal>

          {modal === 'deleteLocation' && (
            <Modal isOpen={true} onClose={closeModal} title="Delete Location" size="sm">
              <p className="text-sm text-gray-600 mb-5">Delete location <strong>{selected?.name}</strong>?</p>
              <div className="flex justify-end gap-3">
                <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handleDeleteLocation} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2">
                  {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Delete
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ===== PRODUCTS TAB ===== */}
      {tab === 2 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Products ({products.length})</h2>
            <button
              onClick={() => openModal('addProduct')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Product
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Name', 'Unit', 'Category', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                {prodLoading ? <LoadingRows cols={4} /> : (
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-5 py-3 text-gray-600">{p.unit}</td>
                        <td className="px-5 py-3 text-gray-600">{p.category || '—'}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openModal('editProduct', p, { name: p.name, unit: p.unit, category: p.category || '' })}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium"
                            >Edit</button>
                            <button
                              onClick={() => openModal('deleteProduct', p)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium"
                            >Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </div>

          {/* Add/Edit Product Modal */}
          <Modal isOpen={modal === 'addProduct' || modal === 'editProduct'} onClose={closeModal} title={modal === 'addProduct' ? 'Add Product' : 'Edit Product'} size="md">
            <div className="space-y-4">
              <Field name="name" label="Product Name" required />
              <Field name="unit" label="Unit (e.g. bottle, box, kg)" required />
              <Field name="category" label="Category" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button
                onClick={modal === 'addProduct' ? handleAddProduct : handleEditProduct}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg flex items-center gap-2"
              >
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {modal === 'addProduct' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </Modal>

          {modal === 'deleteProduct' && (
            <Modal isOpen={true} onClose={closeModal} title="Delete Product" size="sm">
              <p className="text-sm text-gray-600 mb-5">Delete product <strong>{selected?.name}</strong>?</p>
              <div className="flex justify-end gap-3">
                <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handleDeleteProduct} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2">
                  {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Delete
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
