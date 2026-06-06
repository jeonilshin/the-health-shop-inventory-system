import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

/* ─── Constants ───────────────────────────────────────────────────────── */
const C = {
  blue:   '#2563eb',
  green:  '#10b981',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#8b5cf6',
  cyan:   '#06b6d4',
};

const PAYMENT_COLORS = {
  cash:  C.blue,
  maya:  C.purple,
  gcash: C.cyan,
};

const RANK_COLORS = ['#f59e0b', '#94a3b8', C.blue, C.blue, C.blue];

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmtCur = (v) => {
  const n = parseFloat(v) || 0;
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtAxis = (v) => {
  const n = parseFloat(v);
  if (isNaN(n)) return '';
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₱${(n / 1_000).toFixed(0)}k`;
  return `₱${n.toFixed(0)}`;
};

const pctChange = (cur, prev) => {
  const c = parseFloat(cur);
  const p = parseFloat(prev);
  if (!p) return null;
  return ((c - p) / p * 100).toFixed(1);
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/* ─── Sub-components ──────────────────────────────────────────────────── */
function TrendBadge({ change, label }) {
  if (change === null || change === undefined) return null;
  const pos = parseFloat(change) >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold rounded-full px-2 py-0.5 ${pos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {pos ? '▲' : '▼'} {Math.abs(parseFloat(change))}%
      {label && <span className="font-normal ml-1">{label}</span>}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }} className="flex justify-between gap-3">
          <span>{p.name}:</span>
          <span className="font-medium">
            {p.name === 'Revenue' ? fmtCur(p.value) : p.value?.toLocaleString?.() ?? p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
      <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */
export default function Analysis() {
  const { user } = useAuth();

  const [days, setDays]               = useState(30);
  const [locations, setLocations]     = useState([]);
  const [selectedLoc, setSelectedLoc] = useState('all');
  const [analytics, setAnalytics]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [updatedAt, setUpdatedAt]     = useState(new Date());

  /* Load locations once */
  useEffect(() => {
    apiClient.get('/api/locations')
      .then((r) => setLocations(r.data || []))
      .catch(() => {});
  }, []);

  /* Auto-refresh every 30 seconds */
  useEffect(() => {
    const id = setInterval(() => {
      fetchAnalytics();
    }, 30_000);
    return () => clearInterval(id);
  }, [days, selectedLoc]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = { days };
      if (selectedLoc !== 'all') params.locationId = selectedLoc;
      const r = await apiClient.get('/api/analytics', { params });
      setAnalytics(r.data);
      setUpdatedAt(new Date());
    } catch {
      /* silently keep previous data if any */
    } finally {
      setLoading(false);
    }
  }, [days, selectedLoc]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  /* ── Derived data ── */
  const summary        = analytics?.summary          || {};
  const revenueTrend   = analytics?.revenue_trend    || [];
  const paymentBreak   = analytics?.payment_breakdown || [];
  const topProducts    = analytics?.top_products     || [];
  const salesByLoc     = analytics?.sales_by_location || [];

  const revenueData = revenueTrend.map((d) => ({
    date:         fmtDate(d.date),
    Revenue:      parseFloat(d.revenue)      || 0,
    Transactions: parseInt(d.transactions)   || 0,
  }));

  const paymentData = paymentBreak.map((p) => ({
    name:         p.payment_method === 'cash'  ? 'Cash'
                : p.payment_method === 'maya'  ? 'Maya'
                : p.payment_method === 'gcash' ? 'GCash'
                : (p.payment_method || 'Other'),
    key:          p.payment_method,
    value:        parseFloat(p.revenue)      || 0,
    transactions: parseInt(p.transactions)   || 0,
    color:        PAYMENT_COLORS[p.payment_method] || C.amber,
  }));
  const paymentTotal = paymentData.reduce((s, p) => s + p.value, 0);

  const productData = topProducts.slice(0, 8).map((p) => ({
    name:      (p.description?.length > 15 ? p.description.slice(0, 15) + '…' : p.description) || '—',
    fullName:  p.description,
    'Qty Sold': parseFloat(p.total_sold) || 0,
  }));

  const locationData = salesByLoc.map((l) => ({
    name:        (l.location?.length > 14 ? l.location.slice(0, 14) + '…' : l.location) || '—',
    fullName:    l.location,
    Revenue:     parseFloat(l.revenue)     || 0,
    transactions: parseInt(l.transactions) || 0,
    location_id: l.location_id,
  }));
  const maxLocRev = locationData.length ? Math.max(...locationData.map((l) => l.Revenue)) : 1;

  const revenueChange = pctChange(summary.total_sales,      summary.prev_sales);
  const txnChange     = pctChange(summary.total_transactions, summary.prev_transactions);

  const activeDays = revenueData.filter((d) => d.Revenue > 0).length || 1;
  const totalSales = parseFloat(summary.total_sales) || 0;
  const totalTxns  = parseInt(summary.total_transactions) || 0;
  const bestDay    = revenueData.length
    ? revenueData.reduce((a, b) => (b.Revenue > a.Revenue ? b : a), revenueData[0])
    : null;
  const avgDailyRev  = totalSales  / activeDays;
  const avgDailyTxns = totalTxns   / activeDays;

  const selectedLocName = selectedLoc === 'all'
    ? 'All Branches'
    : (locations.find((l) => String(l.id) === selectedLoc)?.name || 'Branch');

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Updated {updatedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' · '}
            {selectedLocName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-400'
              }`}
            >
              {d}D
            </button>
          ))}
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-blue-400 transition-colors disabled:opacity-60"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Branch filter pills ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedLoc('all')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            selectedLoc === 'all'
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-blue-400'
          }`}
        >
          Overall
        </button>
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => setSelectedLoc(String(loc.id))}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selectedLoc === String(loc.id)
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {loc.name}
          </button>
        ))}
      </div>

      {/* ── 5 stat cards ── */}
      {loading && !analytics ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* REVENUE */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</div>
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmtCur(summary.total_sales)}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <TrendBadge change={revenueChange} />
              <span className="text-xs text-gray-400">prev {days}d</span>
            </div>
          </div>

          {/* AVG TRANSACTION */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Transaction</div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmtCur(summary.avg_transaction)}</div>
            <div className="text-xs text-gray-400 mt-1.5">per sale</div>
          </div>

          {/* TRANSACTIONS */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transactions</div>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalTxns.toLocaleString('en-PH')}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <TrendBadge change={txnChange} />
              <span className="text-xs text-gray-400">prev {days}d</span>
            </div>
          </div>

          {/* INVENTORY VALUE */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inventory Value</div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmtCur(summary.inventory_value)}</div>
            <div className="text-xs text-gray-400 mt-1.5">total stock</div>
          </div>

          {/* LOW STOCK */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Low Stock</div>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{parseInt(summary.low_stock_count || 0).toLocaleString('en-PH')}</div>
            <div className="text-xs text-gray-400 mt-1.5">need restocking</div>
          </div>
        </div>
      )}

      {/* ── Secondary stats row ── */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 px-6 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Best Day</div>
            <div className="text-lg font-bold text-gray-900">{bestDay ? bestDay.date : '—'}</div>
            <div className="text-xs text-gray-500">{bestDay ? fmtCur(bestDay.Revenue) + ' revenue' : 'No data'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Avg Daily Rev</div>
            <div className="text-lg font-bold text-gray-900">{fmtCur(avgDailyRev)}</div>
            <div className="text-xs text-gray-500">over {activeDays} active day{activeDays !== 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Daily Avg Txns</div>
            <div className="text-lg font-bold text-gray-900">{(avgDailyTxns).toFixed(1)}</div>
            <div className="text-xs text-gray-500">transactions per day</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Period Revenue</div>
            <div className="text-lg font-bold text-gray-900">{fmtCur(totalSales)}</div>
            <div className="text-xs text-gray-500">{totalTxns.toLocaleString('en-PH')} transactions total</div>
          </div>
        </div>
      </div>

      {/* ── Revenue Trend + Payment Channels ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Revenue Trend */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-900">Revenue Trend</h3>
            <p className="text-xs text-gray-400 mt-0.5">· last {days} days</p>
          </div>
          {revenueData.length > 0 ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.blue} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone" dataKey="Revenue"
                    stroke={C.blue} strokeWidth={2}
                    fill="url(#revGrad)"
                    dot={{ r: 3, fill: C.blue, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="No revenue data for this period" />
          )}
        </div>

        {/* Payment Channels */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-900">Payment Channels</h3>
            <p className="text-xs text-gray-400 mt-0.5">· by revenue share</p>
          </div>
          {paymentData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentData} dataKey="value"
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={72}
                      strokeWidth={0}
                    >
                      {paymentData.map((p, i) => <Cell key={i} fill={p.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [fmtCur(v), 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {paymentData.map((p, i) => {
                  const pct = paymentTotal > 0 ? (p.value / paymentTotal) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-xs font-semibold text-gray-700">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-gray-900">{pct.toFixed(1)}%</span>
                          <span className="text-[10px] text-gray-400 ml-1">({p.transactions} txns)</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState message="No payment data available" />
          )}
        </div>
      </div>

      {/* ── Top Products + Branch Performance ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Top Selling Products */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-900">Top Selling Products</h3>
            <p className="text-xs text-gray-400 mt-0.5">· by qty sold</p>
          </div>
          {productData.length > 0 ? (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productData} layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis
                    dataKey="name" type="category"
                    tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    width={90}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Qty Sold" fill={C.blue} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="No product sales data" />
          )}
        </div>

        {/* Branch Performance */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-900">Branch Performance</h3>
            <p className="text-xs text-gray-400 mt-0.5">· by revenue</p>
          </div>
          {locationData.length > 0 ? (
            <>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={locationData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Revenue" fill={C.blue} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {locationData.map((loc, i) => {
                  const rankColor  = RANK_COLORS[i] ?? C.blue;
                  const rankLabel  = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
                  const barWidth   = maxLocRev > 0 ? (loc.Revenue / maxLocRev) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-bold w-7 text-center"
                            style={{ color: rankColor }}
                          >
                            {rankLabel}
                          </span>
                          <span className="text-sm font-medium text-gray-800 truncate max-w-[120px]">
                            {loc.fullName}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="text-xs font-bold text-gray-900">{fmtCur(loc.Revenue)}</div>
                          <div className="text-[10px] text-gray-400">{loc.transactions} txns</div>
                        </div>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${barWidth}%`, backgroundColor: rankColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState message="No branch data available" />
          )}
        </div>
      </div>
    </div>
  );
}
