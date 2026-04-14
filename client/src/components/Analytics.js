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
    {icon}
    {children}
    {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{sub}</span>}
  </h3>
);

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
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const isAdmin = user.role === 'admin';

  useEffect(() => { fetchAnalytics(); }, [days]); // eslint-disable-line

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/export/analytics?days=${days}`);
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
    date: new Date(d.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    Revenue:      parseFloat(d.revenue)      || 0,
    Profit:       parseFloat(d.profit)       || 0,
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
    Profit:       parseFloat(l.profit)       || 0,
    transactions: parseInt(l.transactions)   || 0,
  }));

  const cashFlowData = (cash_flow_trend || []).map(d => ({
    date:            new Date(d.report_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    'Net Receipts':  parseFloat(d.net_cash_receipts) || 0,
    Deposited:       parseFloat(d.deposited)          || 0,
    Disbursements:   parseFloat(d.disbursements)      || 0,
  }));

  // ── Derived KPI metrics ────────────────────────────────────────────────────
  const revenueChange = pctChange(summary.total_sales,        summary.prev_sales);
  const profitChange  = pctChange(summary.total_profit,       summary.prev_profit);
  const txnChange     = pctChange(summary.total_transactions, summary.prev_transactions);
  const profitMargin  = parseFloat(summary.total_sales) > 0
    ? (parseFloat(summary.total_profit) / parseFloat(summary.total_sales) * 100).toFixed(1)
    : 0;

  const totalRevenue      = revenueData.reduce((s, d) => s + d.Revenue,      0);
  const totalProfit       = revenueData.reduce((s, d) => s + d.Profit,       0);
  const totalTransactions = revenueData.reduce((s, d) => s + d.Transactions, 0);

  // Best performing day
  const bestDay  = revenueData.length ? revenueData.reduce((a, b) => b.Revenue > a.Revenue ? b : a, revenueData[0]) : null;
  const maxLocRev = locationData.length ? Math.max(...locationData.map(l => l.Revenue)) : 0;

  // ── KPI card definitions ───────────────────────────────────────────────────
  const kpiCards = [
    ...(isAdmin ? [
      { label: 'REVENUE',         icon: <FiShoppingCart size={18} />, value: `₱${formatPrice(summary.total_sales)}`,     sub: `prev ${days}d`,      change: revenueChange, color: C.green,  bg: 'rgba(16,185,129,0.1)' },
      { label: 'PROFIT',          icon: <FiDollarSign   size={18} />, value: `₱${formatPrice(summary.total_profit)}`,    sub: `${profitMargin}% margin`, change: profitChange, color: C.amber,  bg: 'rgba(245,158,11,0.1)' },
      { label: 'AVG TRANSACTION', icon: <FiTrendingUp   size={18} />, value: `₱${formatPrice(summary.avg_transaction)}`, sub: 'per sale',           color: C.blue,   bg: 'rgba(37,99,235,0.1)'  },
    ] : []),
    { label: 'TRANSACTIONS', icon: <FiActivity      size={18} />, value: parseInt(summary.total_transactions).toLocaleString(), sub: `prev ${days}d`, change: txnChange, color: C.purple, bg: 'rgba(139,92,246,0.1)' },
    ...(isAdmin ? [
      { label: 'INVENTORY VALUE', icon: <FiPackage size={18} />, value: `₱${formatPrice(summary.inventory_value)}`, sub: 'total stock', color: C.blue, bg: 'rgba(37,99,235,0.1)' },
    ] : []),
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FiBarChart2 size={30} color={C.blue} />
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Analytics Dashboard</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {refreshedAt.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Date-range toggle */}
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
          {/* Refresh */}
          <button onClick={fetchAnalytics} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)',
            cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500,
          }}>
            <FiRefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 14, marginBottom: 22 }}>
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

      {/* ── Insight Banner (best day) ── */}
      {bestDay && isAdmin && (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18,
          background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(16,185,129,0.06) 100%)',
          border: '1px solid var(--border)', borderRadius: 12, padding: '12px 18px',
        }}>
          {[
            { label: 'Best Day',      value: bestDay.date,                       sub: `₱${formatPrice(bestDay.Revenue)} revenue` },
            { label: 'Avg Daily Rev', value: `₱${formatPrice(totalRevenue / (revenueData.length || 1))}`, sub: `over ${revenueData.length} days with sales` },
            { label: 'Profit Margin', value: `${profitMargin}%`,                  sub: `₱${formatPrice(totalProfit)} profit on ₱${formatPrice(totalRevenue)} revenue` },
            { label: 'Daily Avg Txns', value: Math.round(totalTransactions / (revenueData.length || 1)).toLocaleString(), sub: 'transactions per day' },
          ].map((item, i) => (
            <div key={i} style={{ minWidth: 150 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0' }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Revenue Trend + Payment Methods ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, marginBottom: 16, alignItems: 'start' }}>

        {/* Revenue & Profit Area Chart */}
        <div className="card">
          <SectionTitle icon={<FiTrendingUp size={17} color={C.blue} />} sub={`· last ${days} days`}>
            Revenue & Profit Trend
          </SectionTitle>
          {revenueData.length === 0
            ? <EmptyChart message="No sales data for this period" />
            : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.blue}  stopOpacity={0.18} />
                      <stop offset="95%" stopColor={C.blue}  stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gPro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.green} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={C.green} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={62} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="Revenue" stroke={C.blue}  strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4 }} />
                  {isAdmin && <Area type="monotone" dataKey="Profit" stroke={C.green} strokeWidth={2} fill="url(#gPro)" dot={false} activeDot={{ r: 4 }} />}
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
      <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>

        {/* Top Products horizontal bar */}
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

        {/* Branch Performance (admin only) */}
        {isAdmin && (
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
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="Revenue" fill={C.blue}  radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Profit"  fill={C.green} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Medals */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                    {locationData.slice(0, 3).map((l, i) => {
                      const pct = maxLocRev > 0 ? (l.Revenue / maxLocRev * 100).toFixed(0) : 0;
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span>{['🥇', '🥈', '🥉'][i]}</span>
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.fullName}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(l.Revenue)}</span>
                          </div>
                          <div style={{ height: 3, background: 'var(--bg-secondary)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: [C.amber, '#94a3b8', '#cd7c3c'][i], borderRadius: 2 }} />
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
                <linearGradient id="gNC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.blue}  stopOpacity={0.15} />
                  <stop offset="95%" stopColor={C.blue}  stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.green} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gDisb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.red}   stopOpacity={0.12} />
                  <stop offset="95%" stopColor={C.red}   stopOpacity={0.01} />
                </linearGradient>
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
                  {isAdmin && <th style={{ textAlign: 'right' }}>Revenue</th>}
                  {isAdmin && <th style={{ textAlign: 'right' }}>Profit</th>}
                  {isAdmin && <th style={{ textAlign: 'right' }}>Margin</th>}
                </tr>
              </thead>
              <tbody>
                {[...revenueData].reverse().map((d, i) => {
                  const margin = d.Revenue > 0 ? (d.Profit / d.Revenue * 100).toFixed(1) : 0;
                  const mNum   = parseFloat(margin);
                  const barPct = totalRevenue > 0 ? (d.Revenue / (Math.max(...revenueData.map(x => x.Revenue)) || 1) * 100) : 0;
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{d.date}</td>
                      <td style={{ textAlign: 'right' }}>{d.Transactions.toLocaleString()}</td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <div style={{ width: 55, height: 4, background: 'var(--bg-secondary)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${barPct}%`, background: C.blue, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontWeight: 600 }}>₱{formatPrice(d.Revenue)}</span>
                          </div>
                        </td>
                      )}
                      {isAdmin && <td style={{ textAlign: 'right', fontWeight: 600, color: C.green }}>₱{formatPrice(d.Profit)}</td>}
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                            background: mNum > 20 ? 'rgba(16,185,129,0.1)' : mNum > 10 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                            color:      mNum > 20 ? '#059669'              : mNum > 10 ? '#d97706'              : '#dc2626',
                          }}>{margin}%</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {isAdmin && revenueData.length > 1 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td>Total ({revenueData.length} days)</td>
                    <td style={{ textAlign: 'right' }}>{totalTransactions.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>₱{formatPrice(totalRevenue)}</td>
                    <td style={{ textAlign: 'right', color: C.green }}>₱{formatPrice(totalProfit)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
                        {profitMargin}%
                      </span>
                    </td>
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
