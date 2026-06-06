import React, { useState } from 'react';
import apiClient from '../api/client';
import { useToast } from '../context/ToastContext';

export default function ChangePassword() {
  const { showToast } = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.current_password) e.current_password = 'Current password is required.';
    if (!form.new_password) e.new_password = 'New password is required.';
    else if (form.new_password.length < 6) e.new_password = 'Password must be at least 6 characters.';
    if (form.new_password !== form.confirm_password) e.confirm_password = 'Passwords do not match.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setErrors({});
    try {
      await apiClient.post('/api/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      showToast('Password changed successfully.', 'success');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to change password.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ name, label, ...props }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type="password"
        value={form[name]}
        onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
        className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${errors[name] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
        disabled={loading}
        {...props}
      />
      {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Change Password</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field name="current_password" label="Current Password" autoComplete="current-password" />
          <Field name="new_password" label="New Password" autoComplete="new-password" />
          <Field name="confirm_password" label="Confirm New Password" autoComplete="new-password" />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
