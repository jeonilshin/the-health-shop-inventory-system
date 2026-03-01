import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatPrice } from '../utils/formatNumber';
import { FiFileText, FiPlus, FiEye, FiCheck, FiX, FiTrash2, FiFilter } from 'react-icons/fi';

function Reports() {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [viewReport, setViewReport] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    startDate: '',
    endDate: ''
  });

  // Track which auto-calculated fields have been manually edited
  const [manualOverrides, setManualOverrides] = useState({
    gross_sales: false,
    total_net_cash_sales: false,
    total_cash_receipts: false,
    gross_credit_sales: false,
    total_net_credit_receipts: false,
    total_disbursements: false,
    net_cash_receipts: false,
    cash_on_hand_available: false,
    cash_beginning_next_day: false,
    net_sales: false
  });

  // Helper function to format number with commas (for display only)
  const formatNumberInput = (value) => {
    if (!value) return '';
    // Check if it's a pure number
    const numStr = value.toString().replace(/[^\d.]/g, '');
    if (numStr === value.toString().replace(/,/g, '')) {
      // It's a number, format it
      const parts = numStr.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }
    // It's text, return as-is
    return value;
  };

  // Helper function to parse formatted number back to float
  const parseFormattedNumber = (value) => {
    if (!value) return '';
    // Remove commas and try to extract number
    const cleaned = value.toString().replace(/,/g, '');
    // If it's a pure number, return it
    if (!isNaN(cleaned) && cleaned !== '') {
      return cleaned;
    }
    // Try to extract first number from text (e.g., "Utilities 500" -> "500")
    const match = cleaned.match(/[\d.]+/);
    return match ? match[0] : '0';
  };

  // Helper to handle currency/text input change
  const handleCurrencyChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const [formData, setFormData] = useState({
    report_date: new Date().toISOString().split('T')[0],
    report_type: 'daily',
    location_id: user.location_id || '',
    // A. CASH SALES
    cash_beginning: '',
    cash_sales_external: '',
    consignment: '',
    gross_sales: '',
    sales_discount: '',
    sales_return: '',
    total_net_cash_sales: '',
    delivery_fee: '',
    other_income: '',
    total_cash_receipts: '',
    // B. CREDIT SALES
    maya_pos_qr: '',
    gcash_qr: '',
    gross_credit_sales: '',
    credit_sales_discount: '',
    credit_sales_return: '',
    total_net_credit_receipts: '',
    // C. DISBURSEMENTS
    meals: '',
    fare: '',
    other_disbursements: '',
    total_disbursements: '',
    // D. NET CASH RECEIPTS
    net_cash_receipts: '',
    actual_cash_deposited: '',
    cash_on_hand_available: '',
    cash_overage_shortage: '',
    cash_beginning_next_day: '',
    // E. SUMMARY
    net_sales: '',
    notes: ''
  });

  useEffect(() => {
    fetchReports();
    fetchLocations();
    // eslint-disable-next-line
  }, [filters]);

  const fetchReports = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append('type', filters.type);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.location) params.append('locationId', filters.location);
      
      const response = await api.get(`/sales-reports?${params.toString()}`);
      setReports(response.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  // Auto-calculate fields
  useEffect(() => {
    // Parse all values to remove any commas
    const cashBegin = parseFloat(parseFormattedNumber(formData.cash_beginning) || 0);
    const cashSalesExt = parseFloat(parseFormattedNumber(formData.cash_sales_external) || 0);
    const consign = parseFloat(parseFormattedNumber(formData.consignment) || 0);
    const salesDisc = parseFloat(parseFormattedNumber(formData.sales_discount) || 0);
    const salesRet = parseFloat(parseFormattedNumber(formData.sales_return) || 0);
    const delivFee = parseFloat(parseFormattedNumber(formData.delivery_fee) || 0);
    const otherInc = parseFloat(parseFormattedNumber(formData.other_income) || 0);
    
    const gross = cashSalesExt + consign;
    const netCash = gross - salesDisc - salesRet;
    // Total Cash Sales/Receipts includes Cash Beginning for section A
    const totalReceipts = cashBegin + netCash + delivFee + otherInc;
    // But for SUMMARY, we exclude Cash Beginning (actual sales only)
    const totalCashSalesOnly = netCash + delivFee + otherInc;
    
    const mayaPOS = parseFloat(parseFormattedNumber(formData.maya_pos_qr) || 0);
    const gcashQR = parseFloat(parseFormattedNumber(formData.gcash_qr) || 0);
    const creditDisc = parseFloat(parseFormattedNumber(formData.credit_sales_discount) || 0);
    const creditRet = parseFloat(parseFormattedNumber(formData.credit_sales_return) || 0);
    
    const grossCredit = mayaPOS + gcashQR;
    const netCredit = grossCredit - creditDisc - creditRet;
    
    const mealsAmt = parseFloat(parseFormattedNumber(formData.meals) || 0);
    const fareAmt = parseFloat(parseFormattedNumber(formData.fare) || 0);
    const otherDisb = parseFloat(parseFormattedNumber(formData.other_disbursements) || 0);
    
    const totalDisb = mealsAmt + fareAmt + otherDisb;
    
    const actualDeposit = parseFloat(parseFormattedNumber(formData.actual_cash_deposited) || 0);
    const cashOverShort = parseFloat(parseFormattedNumber(formData.cash_overage_shortage) || 0);
    
    const netCashReceipts = totalReceipts - totalDisb;
    const cashAvailable = netCashReceipts - actualDeposit;
    const cashNextDay = cashAvailable + cashOverShort;
    
    // Net Sales = actual sales only (excluding beginning cash)
    const netSales = totalCashSalesOnly + netCredit;
    
    // Only update fields that haven't been manually overridden
    setFormData(prev => ({
      ...prev,
      gross_sales: manualOverrides.gross_sales ? prev.gross_sales : gross.toFixed(2),
      total_net_cash_sales: manualOverrides.total_net_cash_sales ? prev.total_net_cash_sales : netCash.toFixed(2),
      total_cash_receipts: manualOverrides.total_cash_receipts ? prev.total_cash_receipts : totalCashSalesOnly.toFixed(2), // Changed to exclude beginning cash
      gross_credit_sales: manualOverrides.gross_credit_sales ? prev.gross_credit_sales : grossCredit.toFixed(2),
      total_net_credit_receipts: manualOverrides.total_net_credit_receipts ? prev.total_net_credit_receipts : netCredit.toFixed(2),
      total_disbursements: manualOverrides.total_disbursements ? prev.total_disbursements : totalDisb.toFixed(2),
      net_cash_receipts: manualOverrides.net_cash_receipts ? prev.net_cash_receipts : netCashReceipts.toFixed(2),
      cash_on_hand_available: manualOverrides.cash_on_hand_available ? prev.cash_on_hand_available : cashAvailable.toFixed(2),
      cash_beginning_next_day: manualOverrides.cash_beginning_next_day ? prev.cash_beginning_next_day : cashNextDay.toFixed(2),
      net_sales: manualOverrides.net_sales ? prev.net_sales : netSales.toFixed(2)
    }));
  }, [
    formData.cash_beginning, formData.cash_sales_external, formData.consignment, formData.sales_discount, formData.sales_return,
    formData.delivery_fee, formData.other_income, formData.maya_pos_qr, formData.gcash_qr,
    formData.credit_sales_discount, formData.credit_sales_return, formData.meals, formData.fare,
    formData.other_disbursements, formData.actual_cash_deposited, formData.cash_overage_shortage,
    manualOverrides
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Strip commas from all numeric fields before submitting
      const cleanedData = {};
      Object.keys(formData).forEach(key => {
        const value = formData[key];
        // For numeric fields, remove commas and extract numbers
        if (typeof value === 'string' && value && key !== 'notes' && key !== 'report_date' && key !== 'report_type') {
          cleanedData[key] = parseFormattedNumber(value);
        } else {
          cleanedData[key] = value;
        }
      });
      
      await api.post('/sales-reports', cleanedData);
      alert('Sales report submitted successfully!');
      setShowForm(false);
      resetForm();
      fetchReports();
    } catch (error) {
      alert(error.response?.data?.error || 'Error submitting report');
    }
  };

  const resetForm = () => {
    setFormData({
      report_date: new Date().toISOString().split('T')[0],
      report_type: 'daily',
      location_id: user.location_id || '',
      cash_beginning: '', cash_sales_external: '', consignment: '', gross_sales: '',
      sales_discount: '', sales_return: '', total_net_cash_sales: '',
      delivery_fee: '', other_income: '', total_cash_receipts: '',
      maya_pos_qr: '', gcash_qr: '', gross_credit_sales: '',
      credit_sales_discount: '', credit_sales_return: '', total_net_credit_receipts: '',
      meals: '', fare: '', other_disbursements: '', total_disbursements: '',
      net_cash_receipts: '', actual_cash_deposited: '', cash_on_hand_available: '',
      cash_overage_shortage: '', cash_beginning_next_day: '',
      net_sales: '', notes: ''
    });
    // Reset manual overrides
    setManualOverrides({
      gross_sales: false,
      total_net_cash_sales: false,
      total_cash_receipts: false,
      gross_credit_sales: false,
      total_net_credit_receipts: false,
      total_disbursements: false,
      net_cash_receipts: false,
      cash_on_hand_available: false,
      cash_beginning_next_day: false,
      net_sales: false
    });
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.patch(`/sales-reports/${id}/status`, { status });
      alert(`Report ${status} successfully!`);
      fetchReports();
    } catch (error) {
      alert(error.response?.data?.error || 'Error updating status');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    try {
      await api.delete(`/sales-reports/${id}`);
      alert('Report deleted successfully!');
      fetchReports();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting report');
    }
  };

  const canSubmit = ['admin', 'warehouse', 'branch_manager', 'branch_staff'].includes(user.role);

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiFileText size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Sales Reports</h2>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <FiFilter size={18} />
              <span style={{ fontWeight: 600 }}>Filters:</span>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
              <select value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})}>
                <option value="">All Types</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
              <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}>
                <option value="">All Status</option>
                <option value="submitted">Submitted</option>
                <option value="reviewed">Reviewed</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input type="date" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} placeholder="Start Date" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input type="date" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} placeholder="End Date" />
            </div>
          </div>
          {canSubmit && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              <FiPlus size={16} />
              {showForm ? 'Cancel' : 'New Report'}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>Submit Sales Report</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Report Date *</label>
                <input type="date" value={formData.report_date} onChange={(e) => setFormData({...formData, report_date: e.target.value})} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Report Type *</label>
                <select value={formData.report_type} onChange={(e) => setFormData({...formData, report_type: e.target.value})} required>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Location *</label>
                <select value={formData.location_id} onChange={(e) => setFormData({...formData, location_id: e.target.value})} required disabled={user.role !== 'admin' && user.location_id}>
                  <option value="">Select location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>A. CASH SALES</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Cash on Hand, Beginning</label>
                  <input type="text" value={formatNumberInput(formData.cash_beginning)} onChange={(e) => handleCurrencyChange('cash_beginning', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Cash Sales External</label>
                  <input type="text" value={formatNumberInput(formData.cash_sales_external)} onChange={(e) => handleCurrencyChange('cash_sales_external', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Consignment</label>
                  <input type="text" value={formatNumberInput(formData.consignment)} onChange={(e) => handleCurrencyChange('consignment', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Gross Sales (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.gross_sales)} 
                    onChange={(e) => {
                      handleCurrencyChange('gross_sales', e.target.value);
                      setManualOverrides(prev => ({ ...prev, gross_sales: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.gross_sales ? 'var(--bg-primary)' : 'var(--bg-secondary)' }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Sales Discount</label>
                  <input type="text" value={formatNumberInput(formData.sales_discount)} onChange={(e) => handleCurrencyChange('sales_discount', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Sales Return</label>
                  <input type="text" value={formatNumberInput(formData.sales_return)} onChange={(e) => handleCurrencyChange('sales_return', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Total Net Cash Sales (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.total_net_cash_sales)} 
                    onChange={(e) => {
                      handleCurrencyChange('total_net_cash_sales', e.target.value);
                      setManualOverrides(prev => ({ ...prev, total_net_cash_sales: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.total_net_cash_sales ? 'var(--bg-primary)' : 'var(--bg-secondary)' }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Delivery Fee</label>
                  <input type="text" value={formatNumberInput(formData.delivery_fee)} onChange={(e) => handleCurrencyChange('delivery_fee', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Other Income</label>
                  <input type="text" value={formatNumberInput(formData.other_income)} onChange={(e) => handleCurrencyChange('other_income', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Total Cash Sales/Receipts (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.total_cash_receipts)} 
                    onChange={(e) => {
                      handleCurrencyChange('total_cash_receipts', e.target.value);
                      setManualOverrides(prev => ({ ...prev, total_cash_receipts: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.total_cash_receipts ? 'var(--bg-primary)' : 'var(--bg-secondary)', fontWeight: 600 }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>B. CREDIT SALES</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Maya POS/QR</label>
                  <input type="text" value={formatNumberInput(formData.maya_pos_qr)} onChange={(e) => handleCurrencyChange('maya_pos_qr', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>GCash QR</label>
                  <input type="text" value={formatNumberInput(formData.gcash_qr)} onChange={(e) => handleCurrencyChange('gcash_qr', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Gross Credit Sales (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.gross_credit_sales)} 
                    onChange={(e) => {
                      handleCurrencyChange('gross_credit_sales', e.target.value);
                      setManualOverrides(prev => ({ ...prev, gross_credit_sales: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.gross_credit_sales ? 'var(--bg-primary)' : 'var(--bg-secondary)' }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Sales Discount</label>
                  <input type="text" value={formatNumberInput(formData.credit_sales_discount)} onChange={(e) => handleCurrencyChange('credit_sales_discount', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Sales Return</label>
                  <input type="text" value={formatNumberInput(formData.credit_sales_return)} onChange={(e) => handleCurrencyChange('credit_sales_return', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Total Net Credit Receipts (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.total_net_credit_receipts)} 
                    onChange={(e) => {
                      handleCurrencyChange('total_net_credit_receipts', e.target.value);
                      setManualOverrides(prev => ({ ...prev, total_net_credit_receipts: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.total_net_credit_receipts ? 'var(--bg-primary)' : 'var(--bg-secondary)', fontWeight: 600 }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>C. DISBURSEMENTS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Meals</label>
                  <input type="text" value={formatNumberInput(formData.meals)} onChange={(e) => handleCurrencyChange('meals', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fare</label>
                  <input type="text" value={formatNumberInput(formData.fare)} onChange={(e) => handleCurrencyChange('fare', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Others</label>
                  <input type="text" value={formatNumberInput(formData.other_disbursements)} onChange={(e) => handleCurrencyChange('other_disbursements', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Total Disbursements (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.total_disbursements)} 
                    onChange={(e) => {
                      handleCurrencyChange('total_disbursements', e.target.value);
                      setManualOverrides(prev => ({ ...prev, total_disbursements: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.total_disbursements ? 'var(--bg-primary)' : 'var(--bg-secondary)', fontWeight: 600 }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>D. NET CASH RECEIPTS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Net Cash Receipts (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.net_cash_receipts)} 
                    onChange={(e) => {
                      handleCurrencyChange('net_cash_receipts', e.target.value);
                      setManualOverrides(prev => ({ ...prev, net_cash_receipts: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.net_cash_receipts ? 'var(--bg-primary)' : 'var(--bg-secondary)' }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Actual Cash Deposited</label>
                  <input type="text" value={formatNumberInput(formData.actual_cash_deposited)} onChange={(e) => handleCurrencyChange('actual_cash_deposited', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Cash on Hand Available (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.cash_on_hand_available)} 
                    onChange={(e) => {
                      handleCurrencyChange('cash_on_hand_available', e.target.value);
                      setManualOverrides(prev => ({ ...prev, cash_on_hand_available: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.cash_on_hand_available ? 'var(--bg-primary)' : 'var(--bg-secondary)' }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Cash Overage/(Shortage)</label>
                  <input type="text" value={formatNumberInput(formData.cash_overage_shortage)} onChange={(e) => handleCurrencyChange('cash_overage_shortage', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Cash Beginning (Next Day) (Auto)</label>
                  <input 
                    type="text" 
                    value={formatNumberInput(formData.cash_beginning_next_day)} 
                    onChange={(e) => {
                      handleCurrencyChange('cash_beginning_next_day', e.target.value);
                      setManualOverrides(prev => ({ ...prev, cash_beginning_next_day: true }));
                    }}
                    style={{ backgroundColor: manualOverrides.cash_beginning_next_day ? 'var(--bg-primary)' : 'var(--bg-secondary)', fontWeight: 600 }} 
                    placeholder="Auto-calculated (editable)"
                  />
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px', backgroundColor: 'var(--bg-secondary)' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>E. SUMMARY OF SALES</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Total Cash Sales/Receipts</label>
                  <input type="text" value={formatNumberInput(formData.total_cash_receipts)} readOnly style={{ fontWeight: 600 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Total Net Credit Receipts</label>
                  <input type="text" value={formatNumberInput(formData.total_net_credit_receipts)} readOnly style={{ fontWeight: 600 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Net Sales</label>
                  <input type="text" value={formatNumberInput(formData.net_sales)} readOnly style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }} />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows="3" placeholder="Additional notes or comments..." />
            </div>

            <button type="submit" className="btn btn-success">
              <FiPlus size={16} />
              Submit Report
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Reports List</h3>
          {user.role === 'admin' && (
            <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
              <select value={filters.location || ''} onChange={(e) => setFilters({...filters, location: e.target.value})}>
                <option value="">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              {!filters.location && <th>Location</th>}
              <th>Net Sales</th>
              <th>Status</th>
              <th>Submitted By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={filters.location ? "6" : "7"} style={{ textAlign: 'center', padding: '20px' }}>No reports found</td>
              </tr>
            ) : (
              (() => {
                if (!filters.location && user.role === 'admin') {
                  // Group by location for admin when viewing all
                  let currentLocation = null;
                  return reports.map((report, index) => {
                    const showLocationHeader = currentLocation !== report.location_id;
                    currentLocation = report.location_id;
                    
                    return (
                      <>
                        {showLocationHeader && (
                          <tr key={`header-${report.location_id}`} style={{ backgroundColor: 'var(--bg-secondary)' }}>
                            <td colSpan="7" style={{ fontWeight: 700, fontSize: '14px', padding: '12px', color: 'var(--primary)' }}>
                              <span className={`badge ${report.location_type === 'warehouse' ? 'badge-primary' : 'badge-info'}`} style={{ marginRight: '8px' }}>
                                {report.location_type}
                              </span>
                              {report.location_name}
                            </td>
                          </tr>
                        )}
                        <tr key={report.id}>
                          <td>{new Date(report.report_date).toLocaleDateString()}</td>
                          <td><span className="badge badge-info">{report.report_type}</span></td>
                          <td style={{ fontWeight: 600 }}>₱{formatPrice(report.net_sales)}</td>
                          <td>
                            <span className={`badge ${
                              report.status === 'approved' ? 'badge-success' :
                              report.status === 'reviewed' ? 'badge-warning' :
                              'badge-secondary'
                            }`}>
                              {report.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px' }}>{report.submitted_by_full_name || report.submitted_by_name}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setViewReport(report)}>
                                <FiEye size={12} />
                                View
                              </button>
                              {user.role === 'admin' && report.status !== 'approved' && (
                                <>
                                  <button className="btn btn-success" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleStatusUpdate(report.id, 'approved')}>
                                    <FiCheck size={12} />
                                  </button>
                                  <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDelete(report.id)}>
                                    <FiTrash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      </>
                    );
                  });
                } else {
                  // Single location or filtered view
                  return reports.map(report => (
                    <tr key={report.id}>
                      <td>{new Date(report.report_date).toLocaleDateString()}</td>
                      <td><span className="badge badge-info">{report.report_type}</span></td>
                      {!filters.location && <td>{report.location_name}</td>}
                      <td style={{ fontWeight: 600 }}>₱{formatPrice(report.net_sales)}</td>
                      <td>
                        <span className={`badge ${
                          report.status === 'approved' ? 'badge-success' :
                          report.status === 'reviewed' ? 'badge-warning' :
                          'badge-secondary'
                        }`}>
                          {report.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{report.submitted_by_full_name || report.submitted_by_name}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setViewReport(report)}>
                            <FiEye size={12} />
                            View
                          </button>
                          {user.role === 'admin' && report.status !== 'approved' && (
                            <>
                              <button className="btn btn-success" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleStatusUpdate(report.id, 'approved')}>
                                <FiCheck size={12} />
                              </button>
                              <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDelete(report.id)}>
                                <FiTrash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ));
                }
              })()
            )}
          </tbody>
        </table>
      </div>

      {viewReport && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', maxWidth: '900px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Sales Report Details</h3>
              <button className="btn" onClick={() => setViewReport(null)}>
                <FiX size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px', padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div>
                <strong>Date:</strong> {new Date(viewReport.report_date).toLocaleDateString()}
              </div>
              <div>
                <strong>Type:</strong> {viewReport.report_type}
              </div>
              <div>
                <strong>Location:</strong> {viewReport.location_name}
              </div>
              <div>
                <strong>Status:</strong> <span className={`badge ${viewReport.status === 'approved' ? 'badge-success' : viewReport.status === 'reviewed' ? 'badge-warning' : 'badge-secondary'}`}>{viewReport.status}</span>
              </div>
              <div>
                <strong>Submitted By:</strong> {viewReport.submitted_by_full_name || viewReport.submitted_by_name}
              </div>
              <div>
                <strong>Submitted:</strong> {new Date(viewReport.created_at).toLocaleString()}
              </div>
            </div>

            <div style={{ border: '2px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>A. CASH SALES</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                <div>Cash on Hand, Beginning:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.cash_beginning)}</div>
                <div>Cash Sales External:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.cash_sales_external)}</div>
                <div>Consignment:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.consignment)}</div>
                <div>Gross Sales:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.gross_sales)}</div>
                <div>Less: Sales Discount:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.sales_discount)}</div>
                <div>Less: Sales Return:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.sales_return)}</div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', fontWeight: 700 }}>Total Net Cash Sales:</div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', textAlign: 'right', fontWeight: 700 }}>₱{formatPrice(viewReport.total_net_cash_sales)}</div>
                <div>Add: Delivery Fee:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.delivery_fee)}</div>
                <div>Add: Other Income:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.other_income)}</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', fontWeight: 700, color: 'var(--primary)' }}>Total Cash Sales/Receipts:</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(viewReport.total_cash_receipts)}</div>
              </div>
            </div>

            <div style={{ border: '2px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>B. CREDIT SALES</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                <div>Maya POS/QR:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.maya_pos_qr)}</div>
                <div>GCash QR:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.gcash_qr)}</div>
                <div>Gross Credit Sales:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.gross_credit_sales)}</div>
                <div>Less: Sales Discount:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.credit_sales_discount)}</div>
                <div>Less: Sales Return:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.credit_sales_return)}</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', fontWeight: 700, color: 'var(--primary)' }}>Total Net Credit Receipts:</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(viewReport.total_net_credit_receipts)}</div>
              </div>
            </div>

            <div style={{ border: '2px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>C. DISBURSEMENTS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                <div>Meals:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.meals)}</div>
                <div>Fare:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.fare)}</div>
                <div>Others:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.other_disbursements)}</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', fontWeight: 700, color: 'var(--primary)' }}>Total Disbursements:</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(viewReport.total_disbursements)}</div>
              </div>
            </div>

            <div style={{ border: '2px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>D. NET CASH RECEIPTS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                <div>Net Cash Receipts:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.net_cash_receipts)}</div>
                <div>Less: Actual Cash Deposited:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.actual_cash_deposited)}</div>
                <div>Cash on Hand Available:</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.cash_on_hand_available)}</div>
                <div>Add/(Less) Cash Overage/(Shortage):</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₱{formatPrice(viewReport.cash_overage_shortage)}</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', fontWeight: 700, color: 'var(--primary)' }}>Cash Beginning (Next Day):</div>
                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(viewReport.cash_beginning_next_day)}</div>
              </div>
            </div>

            <div style={{ border: '3px solid var(--primary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', backgroundColor: 'var(--bg-secondary)' }}>
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>E. SUMMARY OF SALES</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                <div>Total Cash Sales/Receipts:</div><div style={{ textAlign: 'right', fontWeight: 700 }}>₱{formatPrice(viewReport.total_cash_receipts)}</div>
                <div>Total Net Credit Receipts:</div><div style={{ textAlign: 'right', fontWeight: 700 }}>₱{formatPrice(viewReport.total_net_credit_receipts)}</div>
                <div style={{ borderTop: '3px solid var(--primary)', paddingTop: '8px', fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }}>NET SALES:</div>
                <div style={{ borderTop: '3px solid var(--primary)', paddingTop: '8px', textAlign: 'right', fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }}>₱{formatPrice(viewReport.net_sales)}</div>
              </div>
            </div>

            {viewReport.notes && (
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '16px' }}>
                <strong>Notes:</strong> {viewReport.notes}
              </div>
            )}

            {viewReport.reviewed_by && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px' }}>
                Reviewed by {viewReport.reviewed_by_full_name} on {new Date(viewReport.reviewed_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
