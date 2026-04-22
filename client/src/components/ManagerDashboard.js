import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import api from '../utils/api';

const ManagerDashboard = () => {
  const { user } = useContext(AuthContext);
  const { showToast } = useContext(ToastContext);
  
  const [overview, setOverview] = useState({
    branches: [],
    totalInventoryValue: 0,
    totalSalesToday: 0,
    pendingTransfers: 0,
    lowStockItems: 0
  });
  
  const [pendingApprovals, setPendingApprovals] = useState({
    transfers: [],
    deliveries: []
  });
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (user?.role === 'branch_manager') {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [overviewRes, approvalsRes] = await Promise.all([
        api.get('/manager/overview'),
        api.get('/manager/pending-approvals')
      ]);
      
      setOverview(overviewRes.data);
      setPendingApprovals(approvalsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      showToast('Error loading dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveTransfer = async (transferId) => {
    try {
      await api.post(`/manager/transfers/${transferId}/approve`, {
        notes: 'Approved by manager'
      });
      
      showToast('Transfer approved successfully', 'success');
      fetchDashboardData(); // Refresh data
    } catch (error) {
      console.error('Error approving transfer:', error);
      showToast(error.response?.data?.error || 'Error approving transfer', 'error');
    }
  };

  const handleConfirmDelivery = async (deliveryId) => {
    try {
      await api.post(`/manager/deliveries/${deliveryId}/confirm`, {
        notes: 'Confirmed by manager'
      });
      
      showToast('Delivery confirmed successfully', 'success');
      fetchDashboardData(); // Refresh data
    } catch (error) {
      console.error('Error confirming delivery:', error);
      showToast(error.response?.data?.error || 'Error confirming delivery', 'error');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (user?.role !== 'branch_manager') {
    return (
      <div className="container mt-4">
        <div className="alert alert-warning">
          <h4>Access Denied</h4>
          <p>This dashboard is only available for branch managers.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading manager dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid mt-4">
      <div className="row">
        <div className="col-12">
          <h2 className="mb-4">
            <i className="fas fa-tachometer-alt me-2"></i>
            Manager Dashboard
          </h2>
          
          {/* Navigation Tabs */}
          <ul className="nav nav-tabs mb-4">
            <li className="nav-item">
              <button 
                className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <i className="fas fa-chart-line me-1"></i>
                Overview
              </button>
            </li>
            <li className="nav-item">
              <button 
                className={`nav-link ${activeTab === 'approvals' ? 'active' : ''}`}
                onClick={() => setActiveTab('approvals')}
              >
                <i className="fas fa-tasks me-1"></i>
                Pending Approvals
                {(pendingApprovals.transfers.length + pendingApprovals.deliveries.length) > 0 && (
                  <span className="badge bg-danger ms-1">
                    {pendingApprovals.transfers.length + pendingApprovals.deliveries.length}
                  </span>
                )}
              </button>
            </li>
          </ul>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              {/* Summary Cards */}
              <div className="row mb-4">
                <div className="col-md-3">
                  <div className="card bg-primary text-white">
                    <div className="card-body">
                      <div className="d-flex justify-content-between">
                        <div>
                          <h6 className="card-title">Total Inventory Value</h6>
                          <h4>{formatCurrency(overview.totalInventoryValue)}</h4>
                        </div>
                        <div className="align-self-center">
                          <i className="fas fa-boxes fa-2x"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="col-md-3">
                  <div className="card bg-success text-white">
                    <div className="card-body">
                      <div className="d-flex justify-content-between">
                        <div>
                          <h6 className="card-title">Sales Today</h6>
                          <h4>{formatCurrency(overview.totalSalesToday)}</h4>
                        </div>
                        <div className="align-self-center">
                          <i className="fas fa-cash-register fa-2x"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="col-md-3">
                  <div className="card bg-warning text-white">
                    <div className="card-body">
                      <div className="d-flex justify-content-between">
                        <div>
                          <h6 className="card-title">Pending Transfers</h6>
                          <h4>{overview.pendingTransfers}</h4>
                        </div>
                        <div className="align-self-center">
                          <i className="fas fa-truck fa-2x"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="col-md-3">
                  <div className="card bg-danger text-white">
                    <div className="card-body">
                      <div className="d-flex justify-content-between">
                        <div>
                          <h6 className="card-title">Low Stock Items</h6>
                          <h4>{overview.lowStockItems}</h4>
                        </div>
                        <div className="align-self-center">
                          <i className="fas fa-exclamation-triangle fa-2x"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Branch Details */}
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">
                    <i className="fas fa-store me-2"></i>
                    Managed Branches ({overview.branches.length})
                  </h5>
                </div>
                <div className="card-body">
                  {overview.branches.length === 0 ? (
                    <div className="text-center text-muted py-4">
                      <i className="fas fa-store fa-3x mb-3"></i>
                      <p>No branches assigned to manage</p>
                    </div>
                  ) : (
                    <div className="row">
                      {overview.branches.map(branch => (
                        <div key={branch.id} className="col-md-6 col-lg-4 mb-3">
                          <div className="card h-100">
                            <div className="card-body">
                              <h6 className="card-title">
                                <i className="fas fa-map-marker-alt me-1"></i>
                                {branch.name}
                              </h6>
                              <div className="small text-muted mb-2">{branch.address}</div>
                              
                              <div className="row text-center">
                                <div className="col-6">
                                  <div className="border-end">
                                    <div className="h6 mb-0">{branch.total_items}</div>
                                    <small className="text-muted">Items</small>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div className="h6 mb-0">{formatCurrency(branch.total_inventory_value)}</div>
                                  <small className="text-muted">Value</small>
                                </div>
                              </div>
                              
                              <hr className="my-2" />
                              
                              <div className="row text-center">
                                <div className="col-6">
                                  <div className="border-end">
                                    <div className="h6 mb-0 text-success">{formatCurrency(branch.sales_today)}</div>
                                    <small className="text-muted">Today's Sales</small>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div className="h6 mb-0 text-warning">{branch.low_stock_items}</div>
                                  <small className="text-muted">Low Stock</small>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Approvals Tab */}
          {activeTab === 'approvals' && (
            <>
              {/* Transfer Approvals */}
              {pendingApprovals.transfers.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header">
                    <h5 className="mb-0">
                      <i className="fas fa-truck me-2"></i>
                      Transfer Requests Awaiting Approval ({pendingApprovals.transfers.length})
                    </h5>
                  </div>
                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Item</th>
                            <th>Quantity</th>
                            <th>Requested By</th>
                            <th>Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingApprovals.transfers.map(transfer => (
                            <tr key={transfer.id}>
                              <td>#{transfer.id}</td>
                              <td>{transfer.from_location_name}</td>
                              <td>{transfer.to_location_name}</td>
                              <td>
                                <div>{transfer.description}</div>
                                <small className="text-muted">{transfer.unit}</small>
                              </td>
                              <td>{transfer.quantity}</td>
                              <td>
                                <div>{transfer.requested_by_name}</div>
                                <small className="text-muted">{transfer.requested_by_role}</small>
                              </td>
                              <td>{formatDate(transfer.transfer_date)}</td>
                              <td>
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleApproveTransfer(transfer.id)}
                                >
                                  <i className="fas fa-check me-1"></i>
                                  Approve
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Delivery Confirmations */}
              {pendingApprovals.deliveries.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header">
                    <h5 className="mb-0">
                      <i className="fas fa-clipboard-check me-2"></i>
                      Delivery Confirmations Needed ({pendingApprovals.deliveries.length})
                    </h5>
                  </div>
                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Items</th>
                            <th>Accepted By</th>
                            <th>Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingApprovals.deliveries.map(delivery => (
                            <tr key={delivery.id}>
                              <td>#{delivery.id}</td>
                              <td>{delivery.from_location_name}</td>
                              <td>{delivery.to_location_name}</td>
                              <td>
                                {delivery.items.map((item, index) => (
                                  <div key={index} className="small">
                                    {item.quantity} {item.unit} of {item.description}
                                  </div>
                                ))}
                              </td>
                              <td>{delivery.accepted_by_name}</td>
                              <td>{formatDate(delivery.created_at)}</td>
                              <td>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleConfirmDelivery(delivery.id)}
                                >
                                  <i className="fas fa-check me-1"></i>
                                  Confirm
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* No Pending Approvals */}
              {pendingApprovals.transfers.length === 0 && pendingApprovals.deliveries.length === 0 && (
                <div className="card">
                  <div className="card-body text-center py-5">
                    <i className="fas fa-check-circle fa-3x text-success mb-3"></i>
                    <h5>All Caught Up!</h5>
                    <p className="text-muted">No pending approvals at this time.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;