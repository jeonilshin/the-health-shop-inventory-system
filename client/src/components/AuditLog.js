import React, { useState, useEffect, useContext, useMemo } from 'react';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiClipboard, FiDownload, FiSearch } from 'react-icons/fi';

// Short date label (e.g. "28-May-26") for the BEG/END headers.
const fmtShort = (d) => {
  if (!d) return '';
  const dt = new Date(typeof d === 'string' && d.length <= 10 ? d + 'T00:00:00' : d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
};

function AuditLog() {
  const { user } = useContext(AuthContext);

  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const [summary, setSummary] = useState(null); // { location_id, from, to, items: [] }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load the locations this user may report on.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/locations');
        const locs = res.data || [];
        setLocations(locs);
        // Branch users default to their own location.
        if ((user?.role === 'branch_manager' || user?.role === 'branch_staff' || user?.role === 'warehouse') && user?.location_id) {
          setLocationId(String(user.location_id));
        } else if (locs.length === 1) {
          setLocationId(String(locs[0].id));
        }
      } catch (e) {
        setError('Could not load locations');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    if (!locationId) {
      setError('Please select a location');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/inventory/summary/${locationId}?${params.toString()}`);
      setSummary(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to generate the inventory summary');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const locationName = useMemo(
    () => locations.find(l => String(l.id) === String(locationId))?.name || '',
    [locations, locationId]
  );

  const exportXLSX = () => {
    if (!summary || !summary.items.length) return;
    const begLabel = fmtShort(summary.from) || 'BEG';
    const endLabel = fmtShort(summary.to) || 'END';
    const rows = summary.items.map(it => ({
      BRAND: it.brand,
      PRODUCT: it.description,
      UoM: it.unit,
      CONTENT: it.content != null ? it.content : '',
      'SELLING PRICE': it.selling_price != null ? it.selling_price : '',
      [`BEG (${begLabel})`]: it.beg,
      RR: it.rr,
      DR: it.dr,
      'OPEN BOTTLE': it.open_bottle,
      RETAIL: it.retail,
      'DISCREPANCY (OVER/SHORT)': it.discrepancy,
      SALES: it.sales,
      [`END (${endLabel})`]: it.end,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Summary');
    XLSX.writeFile(wb, `inventory_summary_${locationName || 'location'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const canPickLocation = user?.role === 'admin' || user?.role === 'audit';

  // ── styles ──
  const th = { padding: '8px 10px', fontSize: '12px', fontWeight: 700, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td = { padding: '6px 10px', fontSize: '13px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };
  const numTd = { ...td, textAlign: 'center', fontWeight: 600 };
  const begLabel = fmtShort(summary?.from);
  const endLabel = fmtShort(summary?.to);

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <FiClipboard size={30} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Inventory Summary</h2>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
          {canPickLocation ? (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Location *</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)}>
                <option value="">Select location</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Location</label>
              <input type="text" value={locationName} disabled />
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label>From (BEG)</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To (END)</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Search Product</label>
            <input type="text" placeholder="Filter by product name…" value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') generate(); }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={generate} disabled={loading}>
              <FiSearch size={15} /> {loading ? 'Loading…' : 'Generate'}
            </button>
            {summary && summary.items.length > 0 && (
              <button className="btn btn-secondary" onClick={exportXLSX}>
                <FiDownload size={15} /> Export
              </button>
            )}
          </div>
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Leave dates blank to summarise all-time up to today. BEG = stock at the From date, END = stock at the To date.
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: '12px' }}>{error}</div>}
      </div>

      {/* Report */}
      {!summary ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
          Choose a location and date range, then click <strong>Generate</strong>.
        </div>
      ) : summary.items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
          No products found for this location / filter.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {/* Report meta bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Date generated</div>
              <div style={{ fontWeight: 700 }}>{new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })}</div>
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Date covered</div>
              <div style={{ fontWeight: 700 }}>{begLabel || 'Start'} → {endLabel || 'Today'}</div>
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Location</div>
              <div style={{ fontWeight: 700, color: '#b91c1c' }}>{locationName}</div>
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Products</div>
              <div style={{ fontWeight: 700 }}>{summary.items.length}</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1000px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Brand</th>
                  <th style={{ ...th, textAlign: 'left' }}>Product</th>
                  <th style={th}>UoM</th>
                  <th style={th}>Content</th>
                  <th style={{ ...th, textAlign: 'right' }}>Selling Price</th>
                  <th style={{ ...th, background: '#1e3a8a', color: '#fff' }}>
                    <div>{begLabel || 'BEG'}</div>
                    <div style={{ fontSize: '10px', opacity: 0.85 }}>BEG</div>
                  </th>
                  <th style={{ ...th, color: '#16a34a' }}>RR</th>
                  <th style={{ ...th, color: '#16a34a' }}>DR</th>
                  <th style={{ ...th, color: '#2563eb' }}>OPEN<br/>BOTTLE</th>
                  <th style={{ ...th, color: '#2563eb' }}>RETAIL</th>
                  <th style={{ ...th, color: '#dc2626' }}>DISCREPANCY<br/><span style={{ fontSize: '10px' }}>OVER/SHORT</span></th>
                  <th style={{ ...th, color: '#b45309' }}>SALES</th>
                  <th style={{ ...th, background: '#1e3a8a', color: '#fff' }}>
                    <div>{endLabel || 'END'}</div>
                    <div style={{ fontSize: '10px', opacity: 0.85 }}>END</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ ...td, fontWeight: 600 }}>{it.brand || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{it.description}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{it.unit}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{it.content != null ? formatQuantity(it.content) : ''}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{it.selling_price != null ? `₱${formatPrice(it.selling_price)}` : ''}</td>
                    <td style={{ ...numTd, background: '#fef9c3' }}>{formatQuantity(it.beg)}</td>
                    <td style={{ ...numTd, color: it.rr ? '#16a34a' : '#94a3b8' }}>{formatQuantity(it.rr)}</td>
                    <td style={{ ...numTd, color: it.dr ? '#16a34a' : '#94a3b8' }}>{formatQuantity(it.dr)}</td>
                    <td style={{ ...numTd, color: it.open_bottle ? '#2563eb' : '#94a3b8' }}>{formatQuantity(it.open_bottle)}</td>
                    <td style={{ ...numTd, color: it.retail ? '#2563eb' : '#94a3b8' }}>{formatQuantity(it.retail)}</td>
                    <td style={{ ...numTd, color: it.discrepancy ? '#dc2626' : '#94a3b8' }}>{formatQuantity(it.discrepancy)}</td>
                    <td style={{ ...numTd, color: it.sales ? '#b45309' : '#94a3b8' }}>{formatQuantity(it.sales)}</td>
                    <td style={{ ...numTd, background: '#fef9c3', color: it.end < 0 ? '#dc2626' : '#111827' }}>
                      {it.end < 0 ? `(${formatQuantity(Math.abs(it.end))})` : formatQuantity(it.end)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLog;
