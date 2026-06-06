import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmtMoney = (v) => {
  const n = parseFloat(v) || 0;
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' });
};
const fmtDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const n = (v) => parseFloat(v) || 0;

const defaultForm = () => ({
  report_date: new Date().toISOString().split('T')[0],
  report_type: 'daily',
  location_id: '',
  cash_beginning: '', cash_sales_external: '', consignment: '', gross_sales: '',
  sales_discount: '', sales_return: '', total_net_cash_sales: '',
  delivery_fee: '', other_income: '', total_cash_receipts: '',
  maya_pos_qr: '', gcash_qr: '', gross_credit_sales: '',
  credit_sales_discount: '', credit_sales_return: '', total_net_credit_receipts: '',
  meals: '', fare: '', other_disbursements: '', total_disbursements: '',
  net_cash_receipts: '', actual_cash_deposited: '', cash_on_hand_available: '',
  cash_overage_shortage: '', cash_beginning_next_day: '',
  net_sales: '', notes: '',
});

/* ─── Badges ──────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    submitted: 'bg-amber-100 text-amber-700 border border-amber-300',
    approved:  'bg-green-100 text-green-700 border border-green-300',
    reviewed:  'bg-blue-100  text-blue-700  border border-blue-300',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {(status || '').toUpperCase()}
    </span>
  );
}
function TypeBadge({ type }) {
  const map = {
    daily:   'bg-blue-100 text-blue-700',
    weekly:  'bg-purple-100 text-purple-700',
    monthly: 'bg-indigo-100 text-indigo-700',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${map[type] || 'bg-gray-100 text-gray-600'}`}>
      {(type || '').toUpperCase()}
    </span>
  );
}
function LocTypeBadge({ type }) {
  return type === 'warehouse'
    ? <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-600 border border-blue-200">WAREHOUSE</span>
    : <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-600 border border-green-200">BRANCH</span>;
}

/* ─── Branch Selector ─────────────────────────────────────────────────── */
function BranchSelector({ locations, reportCounts, viewMode, setViewMode, onSelect }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900">Select a Branch</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['BRANCH NAME', 'TYPE', 'REPORTS', 'ACTION'].map((h) => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {locations.map((loc) => (
              <tr key={loc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{loc.name}</td>
                <td className="px-6 py-4"><LocTypeBadge type={loc.type} /></td>
                <td className="px-6 py-4 text-gray-600">{(reportCounts[loc.id] || 0)} report{reportCounts[loc.id] !== 1 ? 's' : ''}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => onSelect(loc)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    View Reports
                  </button>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-sm">No locations found.</td></tr>
            )}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => onSelect(loc)}
              className="flex flex-col items-start p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left bg-white"
            >
              <LocTypeBadge type={loc.type} />
              <div className="font-semibold text-gray-900 mt-2 text-sm">{loc.name}</div>
              <div className="text-xs text-gray-400 mt-1">{reportCounts[loc.id] || 0} reports</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Report Detail Modal ─────────────────────────────────────────────── */
function ReportDetailModal({ report, onClose }) {
  if (!report) return null;
  const Row = ({ label, value, bold, blue }) => (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'font-bold' : ''}`}>
      <span className={`text-sm ${blue ? 'text-blue-700 font-semibold' : bold ? 'text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${blue ? 'text-blue-700' : 'text-gray-900'}`}>{fmtMoney(value)}</span>
    </div>
  );
  const Divider = () => <div className="border-t border-blue-200 my-1" />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">Sales Report Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Meta */}
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-sm">
            <div><span className="font-bold text-gray-700">Date:</span> <span className="text-gray-600">{fmtDate(report.report_date)}</span></div>
            <div><span className="font-bold text-gray-700">Type:</span> <span className="text-gray-600">{report.report_type}</span></div>
            <div><span className="font-bold text-gray-700">Location:</span> <span className="text-gray-600">{report.location_name}</span></div>
            <div><span className="font-bold text-gray-700">Status:</span> <StatusBadge status={report.status} /></div>
            <div><span className="font-bold text-gray-700">Submitted By:</span> <span className="text-gray-600">{report.submitted_by_full_name || report.submitted_by_name || '—'}</span></div>
            <div><span className="font-bold text-gray-700">Submitted:</span> <span className="text-gray-600">{fmtDateTime(report.created_at)}</span></div>
          </div>

          {/* Section A */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-blue-600 font-bold text-sm mb-3">A. CASH SALES</h3>
            <Row label="Cash on Hand, Beginning:" value={report.cash_beginning} />
            <Row label="Cash Sales External:" value={report.cash_sales_external} />
            <Row label="Consignment:" value={report.consignment} />
            <Row label="Gross Sales:" value={report.gross_sales} />
            <Row label="Less: Sales Discount:" value={report.sales_discount} />
            <Row label="Less: Sales Return:" value={report.sales_return} />
            <Row label="Total Net Cash Sales:" value={report.total_net_cash_sales} bold />
            <Row label="Add: Delivery Fee:" value={report.delivery_fee} />
            <Row label="Add: Other Income:" value={report.other_income} />
            <Divider />
            <Row label="Total Cash Sales/Receipts:" value={report.total_cash_receipts} blue />
          </div>

          {/* Section B */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-blue-600 font-bold text-sm mb-3">B. CREDIT SALES</h3>
            <Row label="Maya POS/QR:" value={report.maya_pos_qr} />
            <Row label="GCash QR:" value={report.gcash_qr} />
            <Row label="Gross Credit Sales:" value={report.gross_credit_sales} />
            <Row label="Less: Sales Discount:" value={report.credit_sales_discount} />
            <Row label="Less: Sales Return:" value={report.credit_sales_return} />
            <Divider />
            <Row label="Total Net Credit Receipts:" value={report.total_net_credit_receipts} blue />
          </div>

          {/* Section C */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-blue-600 font-bold text-sm mb-3">C. DISBURSEMENTS</h3>
            <Row label="Meals:" value={report.meals} />
            <Row label="Fare / Transportation:" value={report.fare} />
            <Row label="Other Disbursements:" value={report.other_disbursements} />
            <Divider />
            <Row label="Total Disbursements:" value={report.total_disbursements} blue />
          </div>

          {/* Section D */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-blue-600 font-bold text-sm mb-3">D. NET CASH RECEIPTS</h3>
            <Row label="Net Cash Receipts:" value={report.net_cash_receipts} bold />
            <Row label="Less: Actual Cash Deposited:" value={report.actual_cash_deposited} />
            <Row label="Cash on Hand Available:" value={report.cash_on_hand_available} />
            <Row label="Cash Overage / Shortage:" value={report.cash_overage_shortage} />
            <Divider />
            <Row label="Cash on Hand Beginning (Next Day):" value={report.cash_beginning_next_day} blue />
          </div>

          {/* Section E */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
            <h3 className="text-blue-700 font-bold text-sm mb-3">E. NET SALES SUMMARY</h3>
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-800">Net Sales:</span>
              <span className="text-xl font-bold text-blue-700">{fmtMoney(report.net_sales)}</span>
            </div>
          </div>

          {report.notes && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Notes</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Submit Report Form Modal ────────────────────────────────────────── */
function SubmitReportModal({ locations, user, isAdmin, isManager, onClose, onSave }) {
  const [form, setForm] = useState({ ...defaultForm(), location_id: isAdmin ? '' : (user?.location_id || '') });
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Auto-calculate
  useEffect(() => {
    const cashSalesExt = n(form.cash_sales_external);
    const consignment  = n(form.consignment);
    const cashBegin    = n(form.cash_beginning);
    const salesDisc    = n(form.sales_discount);
    const salesRet     = n(form.sales_return);
    const delivFee     = n(form.delivery_fee);
    const otherInc     = n(form.other_income);
    const mayaPOS      = n(form.maya_pos_qr);
    const gcashQR      = n(form.gcash_qr);
    const creditDisc   = n(form.credit_sales_discount);
    const creditRet    = n(form.credit_sales_return);
    const mealsAmt     = n(form.meals);
    const fareAmt      = n(form.fare);
    const otherDisb    = n(form.other_disbursements);
    const actualDep    = n(form.actual_cash_deposited);
    const overShort    = n(form.cash_overage_shortage);

    const gross           = cashSalesExt + consignment;
    const netCash         = gross - salesDisc - salesRet;
    const totalCash       = cashBegin + netCash + delivFee + otherInc;
    const grossCredit     = mayaPOS + gcashQR;
    const netCredit       = grossCredit - creditDisc - creditRet;
    const totalDisb       = mealsAmt + fareAmt + otherDisb;
    const netCashReceipts = totalCash - totalDisb;
    const cashAvail       = netCashReceipts - actualDep;
    const cashNextDay     = cashAvail + overShort;
    const netSales        = netCash + delivFee + otherInc + netCredit;

    setForm((p) => ({
      ...p,
      gross_sales: gross.toFixed(2),
      total_net_cash_sales: netCash.toFixed(2),
      total_cash_receipts: totalCash.toFixed(2),
      gross_credit_sales: grossCredit.toFixed(2),
      total_net_credit_receipts: netCredit.toFixed(2),
      total_disbursements: totalDisb.toFixed(2),
      net_cash_receipts: netCashReceipts.toFixed(2),
      cash_on_hand_available: cashAvail.toFixed(2),
      cash_beginning_next_day: cashNextDay.toFixed(2),
      net_sales: netSales.toFixed(2),
    }));
  }, [
    form.cash_beginning, form.cash_sales_external, form.consignment,
    form.sales_discount, form.sales_return, form.delivery_fee, form.other_income,
    form.maya_pos_qr, form.gcash_qr, form.credit_sales_discount, form.credit_sales_return,
    form.meals, form.fare, form.other_disbursements, form.actual_cash_deposited, form.cash_overage_shortage,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.report_date) { showToast('Select a date.', 'warning'); return; }
    const locId = isAdmin || isManager ? form.location_id : user?.location_id;
    if (!locId) { showToast('Select a location.', 'warning'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/api/sales-reports', { ...form, location_id: locId });
      showToast('Report submitted successfully.', 'success');
      onSave();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit report.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const Field = ({ label, name, readOnly, highlight }) => (
    <div className="flex items-center justify-between py-1.5">
      <label className={`text-sm flex-1 ${highlight ? 'font-bold text-blue-700' : 'text-gray-600'}`}>{label}</label>
      <input
        type="number" step="0.01" min="0"
        value={form[name]}
        readOnly={readOnly}
        onChange={(e) => !readOnly && set(name, e.target.value)}
        className={`w-36 px-2.5 py-1.5 text-sm text-right rounded-lg border transition-colors ${
          readOnly
            ? highlight
              ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold cursor-default'
              : 'bg-gray-50 border-gray-100 text-gray-700 font-semibold cursor-default'
            : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
        }`}
      />
    </div>
  );

  const SectionHeader = ({ letter, title }) => (
    <h3 className="text-blue-600 font-bold text-sm border-b border-blue-100 pb-1.5 mb-2">{letter}. {title.toUpperCase()}</h3>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">Submit Sales Report</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <input type="date" value={form.report_date} onChange={(e) => set('report_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Report Type</label>
              <select value={form.report_type} onChange={(e) => set('report_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {(isAdmin || isManager) ? (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                <select value={form.location_id} onChange={(e) => set('location_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                  <option value="">Select location...</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700 font-medium">
                  {locations.find((l) => l.id === user?.location_id)?.name || 'Your location'}
                </div>
              </div>
            )}
          </div>

          {/* Section A */}
          <div className="bg-gray-50/70 rounded-xl p-4">
            <SectionHeader letter="A" title="Cash Sales" />
            <Field label="Cash on Hand, Beginning:" name="cash_beginning" />
            <Field label="Cash Sales External:" name="cash_sales_external" />
            <Field label="Consignment:" name="consignment" />
            <Field label="Gross Sales:" name="gross_sales" readOnly />
            <Field label="Less: Sales Discount:" name="sales_discount" />
            <Field label="Less: Sales Return:" name="sales_return" />
            <Field label="Total Net Cash Sales:" name="total_net_cash_sales" readOnly />
            <Field label="Add: Delivery Fee:" name="delivery_fee" />
            <Field label="Add: Other Income:" name="other_income" />
            <Field label="Total Cash Sales/Receipts:" name="total_cash_receipts" readOnly highlight />
          </div>

          {/* Section B */}
          <div className="bg-gray-50/70 rounded-xl p-4">
            <SectionHeader letter="B" title="Credit Sales" />
            <Field label="Maya POS/QR:" name="maya_pos_qr" />
            <Field label="GCash QR:" name="gcash_qr" />
            <Field label="Gross Credit Sales:" name="gross_credit_sales" readOnly />
            <Field label="Less: Sales Discount:" name="credit_sales_discount" />
            <Field label="Less: Sales Return:" name="credit_sales_return" />
            <Field label="Total Net Credit Receipts:" name="total_net_credit_receipts" readOnly highlight />
          </div>

          {/* Section C */}
          <div className="bg-gray-50/70 rounded-xl p-4">
            <SectionHeader letter="C" title="Disbursements" />
            <Field label="Meals:" name="meals" />
            <Field label="Fare / Transportation:" name="fare" />
            <Field label="Other Disbursements:" name="other_disbursements" />
            <Field label="Total Disbursements:" name="total_disbursements" readOnly highlight />
          </div>

          {/* Section D */}
          <div className="bg-gray-50/70 rounded-xl p-4">
            <SectionHeader letter="D" title="Net Cash Receipts" />
            <Field label="Net Cash Receipts:" name="net_cash_receipts" readOnly />
            <Field label="Less: Actual Cash Deposited:" name="actual_cash_deposited" />
            <Field label="Cash on Hand Available:" name="cash_on_hand_available" readOnly />
            <Field label="Cash Overage / Shortage:" name="cash_overage_shortage" />
            <Field label="Cash on Hand Beginning (Next Day):" name="cash_beginning_next_day" readOnly highlight />
          </div>

          {/* Section E */}
          <div className="bg-blue-50 rounded-xl p-4">
            <SectionHeader letter="E" title="Net Sales Summary" />
            <Field label="Net Sales:" name="net_sales" readOnly highlight />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Add any notes..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">Cancel</button>
            <button type="submit" disabled={submitting}
              className="px-5 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-xl font-semibold flex items-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */
export default function Reports() {
  const { user, isAdmin, isManager } = useAuth();
  const { showToast } = useToast();

  /* ── Sales Reports state ── */
  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState(null); // null = branch selector
  const [branchViewMode, setBranchViewMode] = useState('list');
  const [reportCounts, setReportCounts] = useState({});
  const [salesReports, setSalesReports] = useState([]);
  const [srLoading, setSrLoading] = useState(false);
  const [srFilters, setSrFilters] = useState({ type: '', status: '', startDate: '', endDate: '' });
  const [viewReport, setViewReport] = useState(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [approving, setApproving] = useState(null);

  /* ── Init ── */
  useEffect(() => {
    apiClient.get('/api/locations').then((r) => setLocations(r.data || [])).catch(() => {});
    fetchReportCounts();
    if (!isAdmin && !isManager) {
      const loc = null; // will use user.location_id directly
      setSelectedLoc({ id: user?.location_id });
    }
  }, []);

  const fetchReportCounts = async () => {
    try {
      const r = await apiClient.get('/api/sales-reports/counts');
      setReportCounts(r.data || {});
    } catch {}
  };

  const fetchSalesReports = useCallback(async (locId) => {
    setSrLoading(true);
    try {
      const params = {};
      if (locId) params.location_id = locId;
      if (srFilters.type) params.type = srFilters.type;
      if (srFilters.status) params.status = srFilters.status;
      if (srFilters.startDate) params.startDate = srFilters.startDate;
      if (srFilters.endDate) params.endDate = srFilters.endDate;
      const r = await apiClient.get('/api/sales-reports', { params });
      setSalesReports(r.data || []);
    } catch { showToast('Failed to load reports.', 'error'); }
    finally { setSrLoading(false); }
  }, [srFilters]);

  useEffect(() => {
    if (selectedLoc) fetchSalesReports(isAdmin || isManager ? selectedLoc.id : user?.location_id);
  }, [selectedLoc, srFilters]);

  const handleApprove = async (id) => {
    setApproving(id);
    try {
      await apiClient.put(`/api/sales-reports/${id}/approve`);
      showToast('Report approved.', 'success');
      fetchSalesReports(selectedLoc?.id);
      fetchReportCounts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to approve.', 'error');
    } finally { setApproving(null); }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/api/sales-reports/${id}`);
      showToast('Report deleted.', 'success');
      setDeleteConfirmId(null);
      fetchSalesReports(selectedLoc?.id);
      fetchReportCounts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete.', 'error');
    }
  };

  /* ── Group reports by location for admin overview ── */
  const groupedReports = useMemo(() => {
    if (!isAdmin && !isManager) return null;
    const map = new Map();
    for (const r of salesReports) {
      if (!map.has(r.location_id)) {
        map.set(r.location_id, { location_id: r.location_id, location_name: r.location_name, location_type: r.location_type, reports: [] });
      }
      map.get(r.location_id).reports.push(r);
    }
    return Array.from(map.values());
  }, [salesReports]);

  const canCreate = isAdmin || isManager || (!isAdmin && !isManager);
  const canApprove = isAdmin || isManager;

  const displayLoc = selectedLoc ? (locations.find((l) => l.id === selectedLoc.id) || selectedLoc) : null;

  /* ── DSR helpers (copied from old system) ── */
  const parseDisbursementBreakdown = (notes) => {
    if (!notes) return { items: [], cleanNotes: '' };
    const marker = '\n---DSR_DISBURSEMENTS---\n';
    const idx = notes.indexOf(marker);
    if (idx === -1) return { items: [], cleanNotes: notes };
    const jsonPart = notes.slice(idx + marker.length).trim();
    try {
      const items = JSON.parse(jsonPart);
      return { items: Array.isArray(items) ? items : [], cleanNotes: notes.slice(0, idx).trim() };
    } catch { return { items: [], cleanNotes: notes }; }
  };

  const buildDsrRow = (r) => {
    const num = (v) => { const n = parseFloat(v); return isNaN(n) || n === 0 ? null : n; };
    const discReturn = (parseFloat(r.sales_discount || 0) + parseFloat(r.sales_return || 0)) || null;
    const creditDiscReturn = (parseFloat(r.credit_sales_discount || 0) + parseFloat(r.credit_sales_return || 0)) || null;
    const totalGcashMaya = (parseFloat(r.maya_pos_qr || 0) + parseFloat(r.gcash_qr || 0) - (creditDiscReturn || 0)) || null;
    const { items: breakdown } = parseDisbursementBreakdown(r.notes);
    const sumCat = (cat) => breakdown.filter(b => b.category === cat).reduce((s, b) => s + (parseFloat(b.amount) || 0), 0) || null;
    const othersItems = breakdown.filter(b => b.category === 'OTHERS');
    const hasBreakdown = breakdown.length > 0;
    return {
      date: r.report_date ? new Date(r.report_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '',
      cash_on_hand_beg: num(r.cash_beginning),
      cash_sales_external: num(r.cash_sales_external),
      sales_disc_return: discReturn,
      net_cash_sales: num(r.total_net_cash_sales),
      maya_sales: num(r.maya_pos_qr),
      g_cash_sales: num(r.gcash_qr),
      credit_sales_disc_return: creditDiscReturn,
      total_gcash_maya: totalGcashMaya,
      permits_licenses: hasBreakdown ? sumCat('PERMITS / LICENSES') : null,
      freight_in: hasBreakdown ? sumCat('FREIGHT IN') : null,
      transpo: hasBreakdown ? sumCat('TRANSPO.') : num(r.fare),
      repairs_maint: hasBreakdown ? sumCat('REPAIRS & MAINT.') : null,
      communication: hasBreakdown ? sumCat('COMMUNICATION') : null,
      office_supplies: hasBreakdown ? sumCat('OFFICE SUPPLIES') : null,
      bank_service: hasBreakdown ? sumCat('BANK SERVICE CHARGES') : null,
      store_incentive: hasBreakdown ? sumCat('STORE INCENTIVE') : null,
      meals: hasBreakdown ? sumCat('MEALS') : num(r.meals),
      others: hasBreakdown ? (othersItems.length > 0 ? othersItems : null) : num(r.other_disbursements),
      total_disbursements: num(r.total_disbursements),
      actual_deposited: num(r.actual_cash_deposited),
      cash_on_hand_next_day: num(r.cash_beginning_next_day),
    };
  };

  const handleDownloadXLSX = () => {
    const sorted = [...salesReports].sort((a, b) => new Date(a.report_date) - new Date(b.report_date));
    const locName = displayLoc?.name || 'All Locations';
    const formatOthers = (others) => {
      if (others == null) return null;
      if (typeof others === 'number') return others;
      if (Array.isArray(others))
        return others.map(it => { const amt = (parseFloat(it.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }); const reason = (it.reason || '').trim(); return reason ? `${amt} (${reason})` : amt; }).join(', ');
      return null;
    };
    const header1 = ['Date (DSR)', 'CASH ON HAND BEG. BAL.', 'A. CASH SALES', '', '', 'B. CREDIT SALES', '', '', '', 'C. DISBURSEMENTS', '', '', '', '', '', '', '', '', '', '', 'D. DEPOSITS', 'CASH ON HAND AVAILABLE - THE NEXT DAY'];
    const header2 = ['', '', 'CASH SALES EXTERNAL', 'SALES DISCOUNT/ SALES RETURN', 'NET CASH SALES', 'MAYA SALES', 'G CASH SALES', 'SALES DISCOUNT/ SALES RETURNS', 'TOTAL GCASH/MAYA SALES', 'PERMITS / LICENSES', 'FREIGHT IN', 'TRANSPO.', 'REPAIRS & MAINT.', 'COMMUNICATION', 'OFFICE SUPPLIES', 'BANK SERVICE CHARGES', 'STORE INCENTIVE', 'MEALS', 'OTHERS', 'TOTAL DISBURSEMENTS', 'ACTUAL AMOUNT DEPOSITED FOR THE DAY', ''];
    const body = sorted.map(r => { const row = buildDsrRow(r); return [row.date, row.cash_on_hand_beg, row.cash_sales_external, row.sales_disc_return, row.net_cash_sales, row.maya_sales, row.g_cash_sales, row.credit_sales_disc_return, row.total_gcash_maya, row.permits_licenses, row.freight_in, row.transpo, row.repairs_maint, row.communication, row.office_supplies, row.bank_service, row.store_incentive, row.meals, formatOthers(row.others), row.total_disbursements, row.actual_deposited, row.cash_on_hand_next_day]; });
    const aoa = [[`Daily Sales Report — ${locName}`], [`Generated: ${new Date().toLocaleString()}`], [], header1, header2, ...body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } }, { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }, { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } }, { s: { r: 3, c: 5 }, e: { r: 3, c: 8 } }, { s: { r: 3, c: 9 }, e: { r: 3, c: 19 } }, { s: { r: 3, c: 20 }, e: { r: 4, c: 20 } }, { s: { r: 3, c: 21 }, e: { r: 4, c: 21 } }];
    ws['!cols'] = [{ wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 15 }];
    const numberFmt = '#,##0.00;-#,##0.00;"-"';
    for (let r = 5; r < 5 + body.length; r++) {
      for (let c = 1; c < 22; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') ws[cellRef].z = numberFmt;
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, `Sales_Report_${locName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrintReportsList = () => {
    const printWindow = window.open('', '_blank');
    const sorted = [...salesReports].sort((a, b) => new Date(a.report_date) - new Date(b.report_date));
    const locName = displayLoc?.name || 'All Locations';
    const fmt = (v) => { const n = parseFloat(v); if (isNaN(n) || n === 0) return '-'; return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    const escHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const othersHtml = (others) => {
      if (others == null) return '-';
      if (typeof others === 'number') return fmt(others);
      if (Array.isArray(others)) return others.map(it => { const amt = fmt(parseFloat(it.amount) || 0); const reason = (it.reason || '').trim(); return reason ? `${amt} (${escHtml(reason)})` : amt; }).join('<br/>');
      return '-';
    };
    const rowsHtml = sorted.map(r => {
      const row = buildDsrRow(r);
      return `<tr>
        <td class="date-cell">${row.date}</td>
        <td class="cash-beg">${fmt(row.cash_on_hand_beg)}</td>
        <td class="cash-a">${fmt(row.cash_sales_external)}</td><td class="cash-a">${fmt(row.sales_disc_return)}</td><td class="cash-a">${fmt(row.net_cash_sales)}</td>
        <td class="cash-b">${fmt(row.maya_sales)}</td><td class="cash-b">${fmt(row.g_cash_sales)}</td><td class="cash-b">${fmt(row.credit_sales_disc_return)}</td><td class="cash-b">${fmt(row.total_gcash_maya)}</td>
        <td class="disb">${fmt(row.permits_licenses)}</td><td class="disb">${fmt(row.freight_in)}</td><td class="disb">${fmt(row.transpo)}</td><td class="disb">${fmt(row.repairs_maint)}</td><td class="disb">${fmt(row.communication)}</td><td class="disb">${fmt(row.office_supplies)}</td><td class="disb">${fmt(row.bank_service)}</td><td class="disb">${fmt(row.store_incentive)}</td><td class="disb">${fmt(row.meals)}</td><td class="disb">${othersHtml(row.others)}</td>
        <td class="disb-total">${fmt(row.total_disbursements)}</td>
        <td class="dep">${fmt(row.actual_deposited)}</td>
        <td class="next-day">${fmt(row.cash_on_hand_next_day)}</td>
      </tr>`;
    }).join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Daily Sales Report</title><style>
      @page{size:landscape;margin:10mm}
      body{font-family:Arial,sans-serif;padding:12px;color:#111}
      h1{text-align:center;margin:0 0 4px;font-size:18px}
      .info{text-align:center;margin-bottom:12px;color:#555;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}
      th,td{border:1px solid #333;padding:4px 5px;text-align:right}
      th{text-align:center;font-weight:700;vertical-align:middle}
      td.date-cell{text-align:center;font-weight:600;background:#fde68a}
      th.date-col{background:#fde68a;color:#111}th.cash-beg-col{background:#fbcfe8;color:#111}
      th.group-a{background:#60a5fa;color:white}th.group-b{background:#60a5fa;color:white}
      th.group-c{background:#fde68a;color:#111}th.group-d{background:#fbcfe8;color:#111}
      th.sub-a{background:#fbcfe8;color:#111}th.sub-b{background:#fef3c7;color:#111}th.sub-c{background:#fef3c7;color:#111}
      th.next-day-col{background:#fbcfe8;color:#111}
      td.cash-beg{background:#fce7f3;font-weight:600}td.cash-a{background:#fce7f3}td.cash-b{background:#fef9c3}
      td.disb{background:#fef9c3}td.disb-total{background:#fce7f3;font-weight:600}td.dep{background:#fbcfe8}td.next-day{background:#fce7f3;font-weight:600}
      .buttons{margin-top:20px;text-align:center}
      .buttons button{padding:8px 18px;border:none;border-radius:4px;cursor:pointer;font-size:13px;margin:0 5px}
      .btn-print{background:#2563eb;color:white}.btn-close{background:#6b7280;color:white}
      @media print{.buttons{display:none}}
    </style></head><body>
      <h1>Daily Sales Report</h1>
      <div class="info"><strong>${locName}</strong> &middot; Generated ${new Date().toLocaleString()}${srFilters.startDate || srFilters.endDate ? ` &middot; ${srFilters.startDate || '...'} → ${srFilters.endDate || '...'}` : ''}</div>
      <table><thead>
        <tr>
          <th rowspan="2" class="date-col" style="width:70px">Date (DSR)</th>
          <th rowspan="2" class="cash-beg-col" style="width:90px">CASH ON HAND BEG. BAL.</th>
          <th colspan="3" class="group-a">A. CASH SALES</th>
          <th colspan="4" class="group-b">B. CREDIT SALES</th>
          <th colspan="11" class="group-c">C. DISBURSEMENTS</th>
          <th rowspan="2" class="group-d" style="width:110px">D. DEPOSITS<br/><span style="font-weight:normal;font-size:9px">ACTUAL AMOUNT DEPOSITED FOR THE DAY</span></th>
          <th rowspan="2" class="next-day-col" style="width:90px">CASH ON HAND AVAILABLE - THE NEXT DAY</th>
        </tr>
        <tr>
          <th class="sub-a">CASH SALES EXTERNAL</th><th class="sub-a">SALES DISCOUNT/ SALES RETURN</th><th class="sub-a">NET CASH SALES</th>
          <th class="sub-b">MAYA SALES</th><th class="sub-b">G CASH SALES</th><th class="sub-b">SALES DISCOUNT/ SALES RETURNS</th><th class="sub-b">TOTAL GCASH/MAYA SALES</th>
          <th class="sub-c">PERMITS / LICENSES</th><th class="sub-c">FREIGHT IN</th><th class="sub-c">TRANSPO.</th><th class="sub-c">REPAIRS &amp; MAINT.</th><th class="sub-c">COMMUNICATION</th><th class="sub-c">OFFICE SUPPLIES</th><th class="sub-c">BANK SERVICE CHARGES</th><th class="sub-c">STORE INCENTIVE</th><th class="sub-c">MEALS</th><th class="sub-c">OTHERS</th><th class="sub-c">TOTAL DISBURSEMENTS</th>
        </tr>
      </thead><tbody>
        ${rowsHtml || '<tr><td colspan="22" style="text-align:center;padding:20px">No reports found</td></tr>'}
      </tbody></table>
      <div class="buttons">
        <button class="btn-print" onclick="window.print()">Print</button>
        <button class="btn-close" onclick="window.close()">Close</button>
      </div>
    </body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Sales reports and operational analytics.</p>
        </div>
      </div>

      {/* Branch selector (admin/manager with no location selected) */}
      {(isAdmin || isManager) && !selectedLoc ? (
        <BranchSelector
          locations={locations}
          reportCounts={reportCounts}
          viewMode={branchViewMode}
          setViewMode={setBranchViewMode}
          onSelect={(loc) => setSelectedLoc(loc)}
        />
      ) : (
        /* Report list */
        <div className="space-y-4">
              {/* Sub-header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {(isAdmin || isManager) && (
                    <button
                      onClick={() => setSelectedLoc(null)}
                      className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      All Branches
                    </button>
                  )}
                  {displayLoc && (
                    <div className="flex items-center gap-2">
                      <LocTypeBadge type={displayLoc.type} />
                      <span className="font-semibold text-gray-900">{displayLoc.name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleDownloadXLSX}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download XLSX
                  </button>
                  <button
                    onClick={handlePrintReportsList}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Reports
                  </button>
                  <button
                    onClick={() => setShowSubmitForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Report
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select value={srFilters.type} onChange={(e) => setSrFilters((p) => ({ ...p, type: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
                      <option value="">All Types</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select value={srFilters.status} onChange={(e) => setSrFilters((p) => ({ ...p, status: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white">
                      <option value="">All Statuses</option>
                      <option value="submitted">Submitted</option>
                      <option value="approved">Approved</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input type="date" value={srFilters.startDate} onChange={(e) => setSrFilters((p) => ({ ...p, startDate: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input type="date" value={srFilters.endDate} onChange={(e) => setSrFilters((p) => ({ ...p, endDate: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
                  </div>
                  <button
                    onClick={() => setSrFilters({ type: '', status: '', startDate: '', endDate: '' })}
                    className="mt-4 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Report table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {srLoading ? (
                  <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
                ) : salesReports.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No reports found.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['DATE', 'TYPE', 'LOCATION', 'NET SALES', 'STATUS', 'SUBMITTED BY', 'ACTIONS'].map((h) => (
                          <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(groupedReports || [{ location_id: selectedLoc?.id, location_name: displayLoc?.name, location_type: displayLoc?.type, reports: salesReports }]).map((group) => (
                        <React.Fragment key={group.location_id}>
                          {/* Group header */}
                          <tr className="bg-blue-50 border-t border-blue-100">
                            <td colSpan={7} className="px-5 py-2.5">
                              <div className="flex items-center gap-2">
                                <LocTypeBadge type={group.location_type} />
                                <span className="font-bold text-blue-700">{group.location_name}</span>
                              </div>
                            </td>
                          </tr>
                          {group.reports.map((report) => (
                            <tr key={report.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap">{fmtDate(report.report_date)}</td>
                              <td className="px-5 py-3.5"><TypeBadge type={report.report_type} /></td>
                              <td className="px-5 py-3.5 text-gray-700">{report.location_name}</td>
                              <td className="px-5 py-3.5 font-semibold text-gray-900 whitespace-nowrap">{fmtMoney(report.net_sales)}</td>
                              <td className="px-5 py-3.5"><StatusBadge status={report.status} /></td>
                              <td className="px-5 py-3.5 text-gray-600">{report.submitted_by_full_name || report.submitted_by_name || '—'}</td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setViewReport(report)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs font-semibold transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    View
                                  </button>
                                  {canApprove && report.status !== 'approved' && (
                                    <button
                                      onClick={() => handleApprove(report.id)}
                                      disabled={approving === report.id}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors disabled:bg-green-400"
                                    >
                                      {approving === report.id
                                        ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                                      }
                                      Approve
                                    </button>
                                  )}
                                  {isAdmin && (
                                    deleteConfirmId === report.id ? (
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => handleDelete(report.id)} className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg">Yes</button>
                                        <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold rounded-lg">No</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setDeleteConfirmId(report.id)}
                                        className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
          </div>
        </div>
      )}

      {/* Modals */}
      {viewReport && <ReportDetailModal report={viewReport} onClose={() => setViewReport(null)} />}
      {showSubmitForm && (
        <SubmitReportModal
          locations={locations}
          user={user}
          isAdmin={isAdmin}
          isManager={isManager}
          onClose={() => setShowSubmitForm(false)}
          onSave={() => {
            setShowSubmitForm(false);
            fetchSalesReports(selectedLoc?.id || (isAdmin ? undefined : user?.location_id));
            fetchReportCounts();
          }}
        />
      )}
    </div>
  );
}
