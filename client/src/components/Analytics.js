import React, { useState, useEffect, useContext } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../utils/api';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { AuthContext } from '../context/AuthContext';
import {
  FiBarChart2, FiTrendingUp, FiDollarSign, FiShoppingCart,
  FiAlertTriangle, FiAward, FiMapPin, FiPackage, FiActivity,
  FiPieChart, FiCalendar, FiArrowUp, FiArrowDown, FiRefreshCw,
  FiGlobe, FiStar,
} from 'react-icons/fi';

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  blue:   '#2563eb',
  green:  '#10b981',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#8b5cf6',
  cyan:   '#06b6d4',
};

const PAYMENT_COLOR = { cash: C.blue, maya: C.purple, gcash: C.cyan };

// ── Helpers ───────────────────────────────────────────────────────────────────
const pctChange = (cur, prev) => {
  const c = parseFloat(cur), p = parseFloat(prev);
  if (!p) return null;
  return ((c - p) / p * 100).toFixed(1);
};

const fmtAxis = (v) => {
  v = parseFloat(v);
  if (isNaN(v)) return '';
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `₱${(v / 1_000).toFixed(0)}k`;
  return `₱${v}`;
};

// ── Sub-components ────────────────────────────────────────────────────────────
const EmptyChart = ({ message }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: 180, color: '#94a3b8', gap: 8,
  }}>
    <FiBarChart2 size={28} style={{ opacity: 0.3 }} />
    <p style={{ margin: 0, fontSize: 13 }}>{message}</p>
  </div>
);

const TrendBadge = ({ change }) => {
  if (change === null || change === undefined) return null;
  const pos = parseFloat(change) >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
      color: pos ? '#059669' : '#dc2626',
      background: pos ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
    }}>
      {pos ? <FiArrowUp size={10} /> : <FiArrowDown size={10} />}
      {Math.abs(parseFloat(change))}%
    </span>
  );
};

const SectionTitle = ({ icon, children, sub }) => (
  <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
    {icon}{children}
    {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{sub}</span>}
  </h3>
);

// Rank badge (1st / 2nd / 3rd) using icons instead of emoji
const RankIcon = ({ rank }) => {
  const styles = [
    { color: '#d97706', bg: 'rgba(245,158,11,0.12)' }, // gold
    { color: '#64748b', bg: 'rgba(100,116,139,0.12)' }, // silver
    { color: '#92400e', bg: 'rgba(146,64,14,0.12)'   }, // bronze
  ][rank] || { color: '#94a3b8', bg: 'transparent' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: '50%',
      background: styles.bg, color: styles.color, flexShrink: 0,
    }}>
      {rank === 0
        ? <FiAward size={13} />
        : <span style={{ fontSize: 11, fontWeight: 700 }}>{rank + 1}</span>
      }
    </span>
  );
};

// ── Custom recharts tooltip ───────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 160,
    }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p, i) => {
        const isCount = ['Transactions', 'Qty Sold'].includes(p.name);
        return (
          <p key={i} style={{ margin: '3px 0', fontSize: 12, color: p.color }}>
            <span style={{ fontWeight: 500 }}>{p.name}:</span>{' '}
            <span style={{ fontWeight: 700 }}>
              {isCount ? Number(p.value).toLocaleString() : `₱${formatPrice(p.value)}`}
            </span>
          </p>
        );
      })}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
function Analytics() {
  const { user } = useContext(AuthContext);
  const [analytics, setAnalytics]         = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [days, setDays]                   = useState(30);
  const [locations, setLocations]         = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('all'); // 'all' or location id string
  const [refreshedAt, setRefreshedAt]     = useState(new Date());

  useEffect(() => {
    api.get('/locations').then(r => {
      setLocations(r.data.filter(l => l.type === 'branch'));
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchAnalytics(); }, [days, selectedLocation]); // eslint-disable-line

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const locParam = selectedLocation !== 'all' ? `&locationId=${selectedLocation}` : '';
      const res = await api.get(`/export/analytics?days=${days}${locParam}`);
      setAnalytics(res.data);
      setRefreshedAt(new Date());
    } catch {
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (error || !analytics) {
    return (
      <div className="container">
        <div className="alert alert-error">{error || 'Failed to load analytics'}</div>
      </div>
    );
  }

  // ── Data transforms ────────────────────────────────────────────────────────
  const { summary, revenue_trend, payment_breakdown, top_products, sales_by_location, cash_flow_trend } = analytics;

  const revenueData = (revenue_trend || []).map(d => ({
    date:         new Date(d.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    Revenue:      parseFloat(d.revenue)      || 0,
    Transactions: parseInt(d.transactions)   || 0,
  }));

  const paymentData = (payment_breakdown || []).map(p => ({
    name:         p.payment_method === 'cash' ? 'Cash' : p.payment_method === 'maya' ? 'Maya' : p.payment_method === 'gcash' ? 'GCash' : (p.payment_method || 'Other'),
    value:        parseFloat(p.revenue)      || 0,
    transactions: parseInt(p.transactions)   || 0,
    color:        PAYMENT_COLOR[p.payment_method] || C.amber,
  }));
  const paymentTotal = paymentData.reduce((s, p) => s + p.value, 0);

  const productData = (top_products || []).slice(0, 8).map(p => ({
    name:       p.description.length > 22 ? p.description.slice(0, 22) + '…' : p.description,
    fullName:   p.description,
    'Qty Sold': parseFloat(p.total_sold) || 0,
    Revenue:    parseFloat(p.revenue)    || 0,
  }));

  const locationData = (sales_by_location || []).map(l => ({
    name:         l.location.length > 14 ? l.location.slice(0, 14) + '…' : l.location,
    fullName:     l.location,
    Revenue:      parseFloat(l.revenue)      || 0,
    transactions: parseInt(l.transactions)   || 0,
  }));

  const cashFlowData = (cash_flow_trend || []).map(d => ({
    date:           new Date(d.report_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    'Net Receipts': parseFloat(d.net_cash_receipts) || 0,
    Deposited:      parseFloat(d.deposited)          || 0,
    Disbursements:  parseFloat(d.disbursements)      || 0,
  }));

  // ── Derived metrics ────────────────────────────────────────────────────────
  const revenueChange = pctChange(summary.total_sales,        summary.prev_sales);
  const txnChange     = pctChange(summary.total_transactions, summary.prev_transactions);

  const totalRevenue      = revenueData.reduce((s, d) => s + d.Revenue,      0);
  const totalTransactions = revenueData.reduce((s, d) => s + d.Transactions, 0);
  const daysWithSales     = revenueData.length || 1;
  const bestDay           = revenueData.length ? revenueData.reduce((a, b) => b.Revenue > a.Revenue ? b : a, revenueData[0]) : null;
  const maxLocRev         = locationData.length ? Math.max(...locationData.map(l => l.Revenue)) : 0;

  const selectedLocationName = selectedLocation === 'all'
    ? 'All Branches'
    : (locations.find(l => l.id.toString() === selectedLocation)?.name || '');

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'REVENUE',         icon: <FiShoppingCart size={18} />, value: `₱${formatPrice(summary.total_sales)}`,     sub: `prev ${days}d`, change: revenueChange, color: C.green,  bg: 'rgba(16,185,129,0.1)'   },
    { label: 'AVG TRANSACTION', icon: <FiTrendingUp   size={18} />, value: `₱${formatPrice(summary.avg_transaction)}`, sub: 'per sale',                             color: C.blue,   bg: 'rgba(37,99,235,0.1)'    },
    { label: 'TRANSACTIONS',    icon: <FiActivity     size={18} />, value: parseInt(summary.total_transactions).toLocaleString(), sub: `prev ${days}d`, change: txnChange, color: C.purple, bg: 'rgba(139,92,246,0.1)'  },
    { label: 'INVENTORY VALUE', icon: <FiPackage      size={18} />, value: `₱${formatPrice(summary.inventory_value)}`, sub: 'total stock',                          color: C.blue,   bg: 'rgba(37,99,235,0.1)'    },
    {
      label: 'LOW STOCK', icon: <FiAlertTriangle size={18} />,
      value: parseInt(summary.low_stock_count),
      sub:   parseInt(summary.low_stock_count) > 0 ? 'need restocking' : 'all stocked',
      color: parseInt(summary.low_stock_count) > 0 ? C.red   : C.green,
      bg:    parseInt(summary.low_stock_count) > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FiBarChart2 size={30} color={C.blue} />
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Analytics Dashboard</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {refreshedAt.toLocaleTimeString()} · {selectedLocationName}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {/* Date range + Refresh */}
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3 }}>
              {[{ label: '7D', v: 7 }, { label: '30D', v: 30 }, { label: '90D', v: 90 }].map(o => (
                <button key={o.v} onClick={() => setDays(o.v)} style={{
                  padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
                  background: days === o.v ? 'var(--primary)' : 'transparent',
                  color:      days === o.v ? '#fff' : 'var(--text-secondary)',
                }}>{o.label}</button>
              ))}
            </div>
            <button onClick={fetchAnalytics} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)',
              cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500,
            }}>
              <FiRefreshCw size={13} /> Refresh
            </button>
          </div>

          {/* Branch selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>View:</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedLocation('all')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 20, border: '1.5px solid',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  borderColor:    selectedLocation === 'all' ? C.blue : 'var(--border)',
                  background:     selectedLocation === 'all' ? 'rgba(37,99,235,0.08)' : 'var(--card-bg)',
                  color:          selectedLocation === 'all' ? C.blue : 'var(--text-secondary)',
                }}
              >
                <FiGlobe size={11} /> Overall
              </button>
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id.toString())}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 20, border: '1.5px solid',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                    borderColor: selectedLocation === loc.id.toString() ? C.blue : 'var(--border)',
                    background:  selectedLocation === loc.id.toString() ? 'rgba(37,99,235,0.08)' : 'var(--card-bg)',
                    color:       selectedLocation === loc.id.toString() ? C.blue : 'var(--text-secondary)',
                  }}
                >
                  <FiMapPin size={11} /> {loc.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 14, marginBottom: 20 }}>
        {kpiCards.map((card, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-header">
              <div style={{ flex: 1 }}>
                <div className="stat-card-label">{card.label}</div>
                <div className="stat-card-value" style={{ fontSize: 20, marginBottom: 4 }}>{card.value}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {card.change !== undefined && <TrendBadge change={card.change} />}
                  {card.sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{card.sub}</span>}
                </div>
              </div>
              <div className="stat-card-icon" style={{ background: card.bg, color: card.color }}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Insight Banner ── */}
      {bestDay && (
        <div style={{
          display: 'flex', gap: 0, flexWrap: 'wrap', marginBottom: 18,
          background: 'linear-gradient(135deg, rgba(37,99,235,0.05) 0%, rgba(16,185,129,0.05) 100%)',
          border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
        }}>
          {[
            { label: 'Best Day',       value: bestDay.date,                                                    sub: `₱${formatPrice(bestDay.Revenue)} revenue` },
            { label: 'Avg Daily Rev',  value: `₱${formatPrice(totalRevenue / daysWithSales)}`,                 sub: `over ${daysWithSales} active day${daysWithSales !== 1 ? 's' : ''}` },
            { label: 'Daily Avg Txns', value: Math.round(totalTransactions / daysWithSales).toLocaleString(), sub: 'transactions per day' },
            { label: 'Period Revenue', value: `₱${formatPrice(totalRevenue)}`,                                 sub: `${totalTransactions.toLocaleString()} transactions total` },
          ].map((item, i, arr) => (
            <div key={i} style={{
              flex: '1 1 150px', padding: '12px 18px',
              borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '3px 0' }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Revenue Trend + Payment Methods ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(250px, 1fr)', gap: 16, marginBottom: 16, alignItems: 'start' }}>

        {/* Revenue Area Chart */}
        <div className="card">
          <SectionTitle icon={<FiTrendingUp size={17} color={C.blue} />} sub={`· last ${days} days`}>
            Revenue Trend
          </SectionTitle>
          {revenueData.length === 0
            ? <EmptyChart message="No sales data for this period" />
            : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.blue} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={C.blue} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={62} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="Revenue" stroke={C.blue} strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Payment Channels Donut */}
        <div className="card">
          <SectionTitle icon={<FiPieChart size={17} color={C.purple} />}>
            Payment Channels
          </SectionTitle>
          {paymentData.length === 0
            ? <EmptyChart message="No payment data" />
            : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={paymentData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                      paddingAngle={3} dataKey="value" startAngle={90} endAngle={450}>
                      {paymentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`₱${formatPrice(v)}`, 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {paymentData.map((p, i) => {
                    const pct = paymentTotal > 0 ? (p.value / paymentTotal * 100).toFixed(0) : 0;
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.color }} />
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({p.transactions} txns)</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: p.color, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>₱{formatPrice(paymentTotal)}</span>
                  </div>
                </div>
              </>
            )
          }
        </div>
      </div>

      {/* ── Top Products + Branch Performance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedLocation === 'all' ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>

        {/* Top Products */}
        <div className="card">
          <SectionTitle icon={<FiAward size={17} color={C.amber} />} sub="· by qty sold">
            Top Selling Products
          </SectionTitle>
          {productData.length === 0
            ? <EmptyChart message="No product sales data" />
            : (
              <ResponsiveContainer width="100%" height={Math.max(200, productData.length * 34)}>
                <BarChart data={productData} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => formatQuantity(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={135} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Qty Sold" fill={C.blue} radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fontSize: 11, fill: '#64748b', formatter: v => formatQuantity(v) }} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Branch Performance — only in Overall view */}
        {selectedLocation === 'all' && (
          <div className="card">
            <SectionTitle icon={<FiMapPin size={17} color={C.green} />}>
              Branch Performance
            </SectionTitle>
            {locationData.length === 0
              ? <EmptyChart message="No branch data" />
              : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={locationData} margin={{ top: 0, right: 4, left: 0, bottom: 36 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)', angle: -30, textAnchor: 'end' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₱${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={55} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Revenue" fill={C.blue} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Ranked list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {locationData.slice(0, 4).map((l, i) => {
                      const pct = maxLocRev > 0 ? (l.Revenue / maxLocRev * 100).toFixed(0) : 0;
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <RankIcon rank={i} />
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.fullName}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.transactions} txns</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(l.Revenue)}</span>
                          </div>
                          <div style={{ height: 3, background: 'var(--bg-secondary)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? C.amber : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : C.blue, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )
            }
          </div>
        )}
      </div>

      {/* ── Cash Flow Trend (from daily reports) ── */}
      {cashFlowData.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={<FiDollarSign size={17} color={C.blue} />} sub="· from submitted daily reports">
            Cash Flow Trend
          </SectionTitle>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={cashFlowData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gNC"   x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.blue}  stopOpacity={0.15} /><stop offset="95%" stopColor={C.blue}  stopOpacity={0.01} /></linearGradient>
                <linearGradient id="gDep"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.green} stopOpacity={0.15} /><stop offset="95%" stopColor={C.green} stopOpacity={0.01} /></linearGradient>
                <linearGradient id="gDisb" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.red}   stopOpacity={0.12} /><stop offset="95%" stopColor={C.red}   stopOpacity={0.01} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={62} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area type="monotone" dataKey="Net Receipts"  stroke={C.blue}  strokeWidth={2} fill="url(#gNC)"   dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="Deposited"     stroke={C.green} strokeWidth={2} fill="url(#gDep)"  dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="Disbursements" stroke={C.red}   strokeWidth={2} fill="url(#gDisb)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Daily Breakdown Table ── */}
      {revenueData.length > 0 && (
        <div className="card">
          <SectionTitle icon={<FiCalendar size={17} color={C.blue} />} sub={`· last ${days} days`}>
            Daily Breakdown
          </SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Transactions</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {[...revenueData].reverse().map((d, i) => {
                  const maxRev = Math.max(...revenueData.map(x => x.Revenue)) || 1;
                  const barPct = (d.Revenue / maxRev * 100).toFixed(0);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{d.date}</td>
                      <td style={{ textAlign: 'right' }}>{d.Transactions.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: 55, height: 4, background: 'var(--bg-secondary)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${barPct}%`, background: C.blue, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontWeight: 600 }}>₱{formatPrice(d.Revenue)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {revenueData.length > 1 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td>Total ({revenueData.length} days)</td>
                    <td style={{ textAlign: 'right' }}>{totalTransactions.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: C.blue }}>₱{formatPrice(totalRevenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

export default Analytics;
