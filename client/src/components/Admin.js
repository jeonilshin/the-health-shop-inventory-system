import React, { useState, useEffect } from 'react';
import api from '../utils/api';

function Admin() {
  const [activeTab, setActiveTab] = useState('locations');
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const [locationForm, setLocationForm] = useState({
    name: '',
    type: 'branch',
    address: '',
    contact_number: ''
  });

  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'branch_staff',
    location_id: ''
  });

  useEffect(() => {
    fetchLocations();
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Location handlers
  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLocation) {
        await api.put(`/locations/${editingLocation.id}`, locationForm);
        alert('Location updated successfully!');
      } else {
        await api.post('/locations', locationForm);
        alert('Location created successfully!');
      }
      setShowLocationForm(false);
      setEditingLocation(null);
      setLocationForm({ name: '', type: 'branch', address: '', contact_number: '' });
      fetchLocations();
    } catch (error) {
      alert(error.response?.data?.error || 'Error saving location');
    }
  };

  const handleEditLocation = (location) => {
    setEditingLocation(location);
    setLocationForm({
      name: location.name,
      type: location.type,
      address: location.address || '',
      contact_number: location.contact_number || ''
    });
    setShowLocationForm(true);
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this location? This will also delete all associated inventory.')) {
      return;
    }
    try {
      await api.delete(`/locations/${id}`);
      alert('Location deleted successfully!');
      fetchLocations();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting location');
    }
  };

  // User handlers
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const updateData = { ...userForm };
        if (!updateData.password) {
          delete updateData.password;
        }
        await api.put(`/users/${editingUser.id}`, updateData);
        alert('User updated successfully!');
      } else {
        await api.post('/users', userForm);
        alert('User created successfully!');
      }
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ username: '', password: '', full_name: '', role: 'branch_staff', location_id: '' });
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Error saving user');
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: '',
      full_name: user.full_name,
      role: user.role,
      location_id: user.location_id || ''
    });
    setShowUserForm(true);
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    try {
      await api.delete(`/users/${id}`);
      alert('User deleted successfully!');
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting user');
    }
  };

  const cancelForm = () => {
    setShowLocationForm(false);
    setShowUserForm(false);
    setEditingLocation(null);
    setEditingUser(null);
    setLocationForm({ name: '', type: 'branch', address: '', contact_number: '' });
    setUserForm({ username: '', password: '', full_name: '', role: 'branch_staff', location_id: '' });
  };

  return (
    <div className="container">
      <h2>🎯 Admin Dashboard</h2>

      <div style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('locations')}
          style={{
            padding: '12px 24px',
            marginRight: '10px',
            border: 'none',
            borderBottom: activeTab === 'locations' ? '3px solid #3498db' : 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'locations' ? 'bold' : 'normal',
            color: activeTab === 'locations' ? '#3498db' : '#555',
            transition: 'all 0.2s ease'
          }}
        >
          Locations
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'users' ? '3px solid #3498db' : 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'users' ? 'bold' : 'normal',
            color: activeTab === 'users' ? '#3498db' : '#555',
            transition: 'all 0.2s ease'
          }}
        >
          Users
        </button>
      </div>

      {/* LOCATIONS TAB */}
      {activeTab === 'locations' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3>Locations ({locations.length})</h3>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingLocation(null);
                setLocationForm({ name: '', type: 'branch', address: '', contact_number: '' });
                setShowLocationForm(!showLocationForm);
              }}
            >
              {showLocationForm ? 'Cancel' : 'Add Location'}
            </button>
          </div>

          {showLocationForm && (
            <form onSubmit={handleLocationSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <h4>{editingLocation ? 'Edit Location' : 'Add New Location'}</h4>
              <div className="form-group">
                <label>Location Name *</label>
                <input
                  type="text"
                  value={locationForm.name}
                  onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                  placeholder="e.g., Branch 1 - Downtown"
                  required
                />
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select
                  value={locationForm.type}
                  onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value })}
                  required
                >
                  <option value="branch">Branch</option>
                  <option value="warehouse">Warehouse</option>
                </select>
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  value={locationForm.address}
                  onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                  placeholder="Full address"
                  rows="2"
                />
              </div>
              <div className="form-group">
                <label>Contact Number</label>
                <input
                  type="text"
                  value={locationForm.contact_number}
                  onChange={(e) => setLocationForm({ ...locationForm, contact_number: e.target.value })}
                  placeholder="e.g., 555-1234"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-success">
                  {editingLocation ? 'Update Location' : 'Create Location'}
                </button>
                <button type="button" className="btn" onClick={cancelForm}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
            {locations.map((location) => (
              <div
                key={location.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: location.type === 'warehouse' ? '#e3f2fd' : '#fff'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0' }}>{location.name}</h4>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: location.type === 'warehouse' ? '#2196f3' : '#4caf50',
                        color: 'white'
                      }}
                    >
                      {location.type.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p style={{ margin: '10px 0', fontSize: '14px', color: '#666' }}>
                  <strong>Address:</strong> {location.address || 'N/A'}
                </p>
                <p style={{ margin: '10px 0', fontSize: '14px', color: '#666' }}>
                  <strong>Contact:</strong> {location.contact_number || 'N/A'}
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '5px' }}
                    onClick={() => handleEditLocation(location)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn"
                    style={{ flex: 1, padding: '5px', backgroundColor: '#dc3545', color: 'white' }}
                    onClick={() => handleDeleteLocation(location.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {locations.length === 0 && (
            <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
              No locations yet. Click "Add Location" to create your first location.
            </p>
          )}
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3>Users ({users.length})</h3>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingUser(null);
                setUserForm({ username: '', password: '', full_name: '', role: 'branch_staff', location_id: '' });
                setShowUserForm(!showUserForm);
              }}
            >
              {showUserForm ? 'Cancel' : 'Add User'}
            </button>
          </div>

          {showUserForm && (
            <form onSubmit={handleUserSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <h4>{editingUser ? 'Edit User' : 'Add New User'}</h4>
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  placeholder="e.g., john.doe"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Enter password"
                  required={!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={userForm.full_name}
                  onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                  placeholder="e.g., John Doe"
                  required
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  required
                >
                  <option value="admin">Admin</option>
                  <option value="warehouse">Warehouse Staff</option>
                  <option value="branch_manager">Branch Manager</option>
                  <option value="branch_staff">Branch Staff</option>
                </select>
              </div>
              <div className="form-group">
                <label>Assigned Location (optional for admin)</label>
                <select
                  value={userForm.location_id}
                  onChange={(e) => setUserForm({ ...userForm, location_id: e.target.value })}
                >
                  <option value="">No Location (Admin only)</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-success">
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
                <button type="button" className="btn" onClick={cancelForm}>Cancel</button>
              </div>
            </form>
          )}

          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Location</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name}</td>
                  <td>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor:
                          user.role === 'admin' ? '#ff9800' :
                          user.role === 'warehouse' ? '#2196f3' :
                          user.role === 'branch_manager' ? '#4caf50' : '#9e9e9e',
                        color: 'white'
                      }}
                    >
                      {user.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>{user.location_name || 'N/A'}</td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => handleEditUser(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#dc3545', color: 'white' }}
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
              No users yet. Click "Add User" to create your first user.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Admin;
