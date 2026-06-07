import { useState, useEffect, useRef, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity } from '../utils/formatNumber';
import {
  FiAlertTriangle, FiRefreshCw, FiX, FiInfo, FiXCircle, FiSearch
} from 'react-icons/fi';

/**
 * DiscrepancyModal
 *
 * type = 'shortage' → branch reports receiving fewer items than the delivery states
 *   props: delivery (delivered delivery object with .items[])
 *
 * type = 'return' → branch requests to send items back to warehouse
 *   props: (no delivery needed)
 *
 * type = 'damage' + delivery → branch reports damaged goods from a delivery
 *   props: delivery (delivered delivery object)
 *
 * type = 'damage' + no delivery → standalone damage write-off from the
 *   reporter's own location. If the reporter is a warehouse user, the report
 *   targets the warehouse; if a branch user (e.g. broke a bottle while
 *   sorting), it targets the branch. The reporter's role decides which.
 */
function DiscrepancyModal({ type, delivery, onClose, onSuccess }) {
  const { user } = useContext(AuthContext);

  // ── shortage / branch-damage from delivery ──
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [receivedQty, setReceivedQty]         = useState('');
  const [damagedQty, setDamagedQty]           = useState('');   // for damage-from-delivery

  // ── return state ──
  const [returnDesc, setReturnDesc]         = useState('');
  const [returnUnit, setReturnUnit]         = useState('');
  const [returnQty, setReturnQty]           = useState('');
  const [warehouseId, setWarehouseId]       = useState('');
  const [warehouses, setWarehouses]         = useState([]);
  const [returnSuggestions, setReturnSuggestions]         = useState([]);
  const [returnShowSuggestions, setReturnShowSuggestions] = useState(false);
  const returnSearchRef = useRef(null);

  // ── warehouse damage (standalone) ──
  const [dmgDesc, setDmgDesc]           = useState('');
  const [dmgUnit, setDmgUnit]           = useState('');
  const [dmgQty, setDmgQty]             = useState('');
  const [invItems, setInvItems]         = useState([]);      // warehouse inventory for autocomplete
  const [suggestions, setSuggestions]   = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  // ── common ──
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const isDamage             = type === 'damage';
  const isDamageFromDelivery = isDamage && !!delivery;
  const isDamageStandalone   = isDamage && !delivery;
  // Standalone damage can be filed from either a warehouse (write-off) or a
  // branch (staff broke an item while sorting). The reporter's location
  // determines which field to send to the backend.
  const isStandaloneAtBranch = isDamageStandalone && (user.role === 'branch_manager' || user.role === 'branch_staff');
  const isDamageWarehouse    = isDamageStandalone && user.role === 'warehouse';

  useEffect(() => {
    if (type === 'return') { fetchWarehouses(); fetchWarehouseInventory(); }
    if (isDamageStandalone) fetchWarehouseInventory();

    // Close suggestions on outside click
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
      if (returnSearchRef.current && !returnSearchRef.current.contains(e.target)) {
        setReturnShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const fetchWarehouses = async () => {
    try {
      const res = await api.get('/locations');
      const whs = res.data.filter(l => l.type === 'warehouse');
      setWarehouses(whs);
      if (whs.length === 1) setWarehouseId(String(whs[0].id));
    } catch {
      setError('Could not load warehouse list');
    }
  };

  const fetchWarehouseInventory = async () => {
    try {
      const res = await api.get(`/inventory/location/${user.location_id}`);
      // deduplicate by description+unit
      const seen = new Set();
      const unique = res.data.filter(item => {
        const key = `${item.description}||${item.unit}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setInvItems(unique);
    } catch {
      // silently ignore — autocomplete won't work but form still works
    }
  };

  // ── autocomplete handlers ──
  const handleReturnDescChange = (val) => {
    setReturnDesc(val);
    if (!val.trim()) { setReturnSuggestions([]); setReturnShowSuggestions(false); return; }
    const filtered = invItems.filter(i =>
      i.description.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 8);
    setReturnSuggestions(filtered);
    setReturnShowSuggestions(filtered.length > 0);
  };

  const selectReturnSuggestion = (item) => {
    setReturnDesc(item.description);
    setReturnUnit(item.unit);
    setReturnSuggestions([]);
    setReturnShowSuggestions(false);
  };

  const handleDmgDescChange = (val) => {
    setDmgDesc(val);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = invItems.filter(i =>
      i.description.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  const selectSuggestion = (item) => {
    setDmgDesc(item.description);
    setDmgUnit(item.unit);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── derived helpers for shortage / damage-from-delivery ──
  const deliveryItems = delivery?.items || [];
  const selectedItem  = deliveryItems[selectedItemIdx] || null;
  const expectedQty   = selectedItem ? parseFloat(selectedItem.quantity) : 0;
  const parsedReceived = parseFloat(receivedQty);
  const shortageAmt    = !isNaN(parsedReceived) && parsedReceived < expectedQty
    ? expectedQty - parsedReceived : null;
  const parsedDamaged  = parseFloat(damagedQty);
  const damageAmt      = !isNaN(parsedDamaged) && parsedDamaged > 0 && parsedDamaged <= expectedQty
    ? parsedDamaged : null;

  const handleSubmit = async () => {
    setError('');
    if (!note.trim()) { setError('A note is required before submitting'); return; }

    try {
      setLoading(true);

      if (type === 'shortage') {
        // ── shortage from delivery ──
        if (!selectedItem) { setError('Please select an item'); return; }
        const rcvd = parseFloat(receivedQty);
        if (isNaN(rcvd) || rcvd < 0) { setError('Enter a valid received quantity'); return; }
        if (rcvd >= expectedQty) {
          setError(`Received quantity must be less than expected (${expectedQty} ${selectedItem.unit})`);
          return;
        }
        await api.post('/delivery-discrepancies', {
          type:                 'shortage',
          delivery_id:          delivery.id,
          item_description:     selectedItem.description,
          unit:                 selectedItem.unit,
          unit_cost:            selectedItem.unit_cost,
          expected_quantity:    expectedQty,
          received_quantity:    rcvd,
          note:                 note.trim(),
          branch_location_id:   user.location_id,
          warehouse_location_id: delivery.from_location_id
        });

      } else if (type === 'return') {
        // ── return to warehouse ──
        if (!returnDesc.trim()) { setError('Item description is required'); return; }
        if (!returnUnit.trim()) { setError('Unit is required'); return; }
        const qty = parseFloat(returnQty);
        if (isNaN(qty) || qty <= 0) { setError('Enter a valid return quantity'); return; }
        if (!warehouseId) { setError('Select a warehouse'); return; }
        await api.post('/delivery-discrepancies', {
          type:                 'return',
          item_description:     returnDesc.trim(),
          unit:                 returnUnit.trim(),
          expected_quantity:    qty,
          received_quantity:    qty,
          note:                 note.trim(),
          branch_location_id:   user.location_id,
          warehouse_location_id: parseInt(warehouseId)
        });

      } else if (isDamageFromDelivery) {
        // ── damage from delivery (branch) ──
        if (!selectedItem) { setError('Please select an item'); return; }
        const qty = parseFloat(damagedQty);
        if (isNaN(qty) || qty <= 0) { setError('Enter a valid damaged quantity'); return; }
        if (qty > expectedQty) {
          setError(`Damaged quantity cannot exceed delivered quantity (${expectedQty} ${selectedItem.unit})`);
          return;
        }
        await api.post('/delivery-discrepancies', {
          type:                 'damage',
          delivery_id:          delivery.id,
          item_description:     selectedItem.description,
          unit:                 selectedItem.unit,
          unit_cost:            selectedItem.unit_cost,
          expected_quantity:    qty,
          received_quantity:    qty,
          note:                 note.trim(),
          branch_location_id:   user.location_id,
          warehouse_location_id: delivery.from_location_id
        });

      } else {
        // ── standalone damage write-off (warehouse or branch) ──
        if (!dmgDesc.trim()) { setError('Item description is required'); return; }
        if (!dmgUnit.trim()) { setError('Unit is required'); return; }
        const qty = parseFloat(dmgQty);
        if (isNaN(qty) || qty <= 0) { setError('Enter a valid damage quantity'); return; }
        // Branch users report against their branch; warehouse users against
        // their warehouse. The backend deducts from whichever location is set.
        const locField = isStandaloneAtBranch
          ? { branch_location_id: user.location_id }
          : { warehouse_location_id: user.location_id };
        await api.post('/delivery-discrepancies', {
          type:               'damage',
          item_description:   dmgDesc.trim(),
          unit:               dmgUnit.trim(),
          expected_quantity:  qty,
          received_quantity:  qty,
          note:               note.trim(),
          ...locField
        });
      }

      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const isShortage  = type === 'shortage';
  const accentColor = isShortage ? '#f59e0b' : isDamage ? '#ef4444' : '#8b5cf6';

  const headerTitle = isShortage
    ? 'Report Delivery Shortage'
    : isDamageFromDelivery
    ? 'Report Damaged Goods from Delivery'
    : isDamageStandalone
    ? 'Report Damaged / Write-Off Goods'
    : 'Request Return to Warehouse';

  const headerSub = isShortage || isDamageFromDelivery
    ? `Delivery from ${delivery?.from_location_name || 'Warehouse'}`
    : isStandaloneAtBranch
    ? 'Damaged items will be written off from your branch pending admin approval'
    : isDamageWarehouse
    ? 'Damaged items will be written off pending admin approval'
    : 'Items will be sent back pending admin approval';

  const infoBanner = isShortage
    ? 'Admin will review and, if approved, add the missing quantity back to the warehouse and correct your branch inventory.'
    : isDamageFromDelivery
    ? 'Admin will review and, if approved, the damaged quantity will be removed from your branch inventory.'
    : isStandaloneAtBranch
    ? 'Use this when stock was damaged at the branch outside of a delivery (e.g. a bottle broken while sorting). Admin must approve. Once approved, the quantity will be removed from your branch inventory.'
    : isDamageWarehouse
    ? 'Admin must approve this report. Once approved, the damaged quantity will be written off from warehouse inventory.'
    : 'Admin must approve this request. Once approved, the specified quantity will be removed from your inventory and added back to the warehouse.';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-card, #fff)',
        borderRadius: '12px',
        width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg-card, #fff)', zIndex: 1
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isShortage
              ? <FiAlertTriangle size={22} color={accentColor} />
              : isDamage
              ? <FiXCircle       size={22} color={accentColor} />
              : <FiRefreshCw     size={22} color={accentColor} />}
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{headerTitle}</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>{headerSub}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary, #6b7280)', display: 'flex', alignItems: 'center' }}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 24px' }}>

          {/* Info banner */}
          <div style={{
            background: `${accentColor}15`, border: `1px solid ${accentColor}40`,
            borderRadius: '8px', padding: '10px 14px', marginBottom: '20px',
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            fontSize: '13px', color: accentColor
          }}>
            <FiInfo size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            {infoBanner}
          </div>

          {/* ── SHORTAGE: item selector + received qty ── */}
          {isShortage && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Which item is short? *
                </label>
                <select
                  value={selectedItemIdx}
                  onChange={e => { setSelectedItemIdx(parseInt(e.target.value)); setReceivedQty(''); }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)' }}
                >
                  {deliveryItems.map((item, idx) => (
                    <option key={idx} value={idx}>
                      {item.description} — {formatQuantity(item.quantity)} {item.unit}
                    </option>
                  ))}
                </select>
              </div>

              {selectedItem && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Expected (delivery says)
                    </label>
                    <div style={{ padding: '8px 12px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: '8px', fontSize: '14px', fontWeight: 600 }}>
                      {formatQuantity(expectedQty)} {selectedItem.unit}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Actually Received *
                    </label>
                    <input
                      type="number" min="0" max={expectedQty - 0.001} step="any" placeholder="0"
                      value={receivedQty}
                      onChange={e => setReceivedQty(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                        border: `1px solid ${receivedQty !== '' && (isNaN(parsedReceived) || parsedReceived >= expectedQty) ? '#ef4444' : 'var(--border-color, #d1d5db)'}`,
                        borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)'
                      }}
                    />
                  </div>
                </div>
              )}

              {shortageAmt !== null && shortageAmt > 0 && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 500 }}>Shortage amount:</span>
                  <span style={{ fontWeight: 700, color: '#92400e', fontSize: '16px' }}>{formatQuantity(shortageAmt)} {selectedItem?.unit}</span>
                </div>
              )}
            </>
          )}

          {/* ── DAMAGE FROM DELIVERY: item selector + damaged qty ── */}
          {isDamageFromDelivery && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Which item is damaged? *
                </label>
                <select
                  value={selectedItemIdx}
                  onChange={e => { setSelectedItemIdx(parseInt(e.target.value)); setDamagedQty(''); }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)' }}
                >
                  {deliveryItems.map((item, idx) => (
                    <option key={idx} value={idx}>
                      {item.description} — {formatQuantity(item.quantity)} {item.unit}
                    </option>
                  ))}
                </select>
              </div>

              {selectedItem && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Delivered quantity
                    </label>
                    <div style={{ padding: '8px 12px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: '8px', fontSize: '14px', fontWeight: 600 }}>
                      {formatQuantity(expectedQty)} {selectedItem.unit}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Damaged quantity *
                    </label>
                    <input
                      type="number" min="0.001" max={expectedQty} step="any" placeholder="0"
                      value={damagedQty}
                      onChange={e => setDamagedQty(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                        border: `1px solid ${damagedQty !== '' && (isNaN(parsedDamaged) || parsedDamaged <= 0 || parsedDamaged > expectedQty) ? '#ef4444' : 'var(--border-color, #d1d5db)'}`,
                        borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)'
                      }}
                    />
                  </div>
                </div>
              )}

              {damageAmt !== null && (
                <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#b91c1c', fontWeight: 500 }}>Damaged amount:</span>
                  <span style={{ fontWeight: 700, color: '#b91c1c', fontSize: '16px' }}>{formatQuantity(damageAmt)} {selectedItem?.unit}</span>
                </div>
              )}
            </>
          )}

          {/* ── RETURN: item fields ── */}
          {type === 'return' && (
            <>
              <div style={{ marginBottom: '14px', position: 'relative' }} ref={returnSearchRef}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Item Description *
                </label>
                <div style={{ position: 'relative' }}>
                  <FiSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search item from your inventory…"
                    value={returnDesc}
                    onChange={e => handleReturnDescChange(e.target.value)}
                    onFocus={() => returnDesc && setReturnShowSuggestions(returnSuggestions.length > 0)}
                    style={{
                      width: '100%', padding: '8px 12px 8px 30px', boxSizing: 'border-box',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: returnShowSuggestions ? '8px 8px 0 0' : '8px',
                      fontSize: '14px', background: 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
                {returnShowSuggestions && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--bg-card, #fff)',
                    border: '1px solid var(--border-color, #d1d5db)',
                    borderTop: 'none', borderRadius: '0 0 8px 8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 50, maxHeight: '180px', overflowY: 'auto'
                  }}>
                    {returnSuggestions.map((item, idx) => (
                      <div
                        key={idx}
                        onMouseDown={() => selectReturnSuggestion(item)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          borderBottom: idx < returnSuggestions.length - 1 ? '1px solid var(--border-color, #f3f4f6)' : 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f9fafb)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 500 }}>{item.description}</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>{item.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Unit *
                    {returnUnit && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '6px', fontSize: '12px' }}>(auto-filled)</span>}
                  </label>
                  <input
                    type="text" placeholder="e.g. pcs / box / bottle"
                    value={returnUnit}
                    onChange={e => setReturnUnit(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px', fontSize: '14px',
                      background: returnUnit ? 'var(--bg-secondary, #f0fdf4)' : 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Quantity to Return *</label>
                  <input
                    type="number" min="0.001" step="any" placeholder="0"
                    value={returnQty}
                    onChange={e => setReturnQty(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', background: 'var(--bg-input, #fff)' }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Return to Warehouse *</label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)' }}
                >
                  <option value="">— Select warehouse —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* ── DAMAGE STANDALONE (warehouse OR branch): item search + unit autofill ── */}
          {isDamageStandalone && (
            <>
              <div style={{ marginBottom: '14px', position: 'relative' }} ref={searchRef}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Item Description *
                </label>
                <div style={{ position: 'relative' }}>
                  <FiSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search item…"
                    value={dmgDesc}
                    onChange={e => handleDmgDescChange(e.target.value)}
                    onFocus={() => dmgDesc && setShowSuggestions(suggestions.length > 0)}
                    style={{
                      width: '100%', padding: '8px 12px 8px 30px', boxSizing: 'border-box',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: showSuggestions ? '8px 8px 0 0' : '8px',
                      fontSize: '14px', background: 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
                {showSuggestions && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--bg-card, #fff)',
                    border: '1px solid var(--border-color, #d1d5db)',
                    borderTop: 'none', borderRadius: '0 0 8px 8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 50, maxHeight: '180px', overflowY: 'auto'
                  }}>
                    {suggestions.map((item, idx) => (
                      <div
                        key={idx}
                        onMouseDown={() => selectSuggestion(item)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          borderBottom: idx < suggestions.length - 1 ? '1px solid var(--border-color, #f3f4f6)' : 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f9fafb)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 500 }}>{item.description}</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>{item.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Unit *
                    {dmgUnit && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '6px', fontSize: '12px' }}>(auto-filled)</span>}
                  </label>
                  <input
                    type="text" placeholder="e.g. pcs / box"
                    value={dmgUnit}
                    onChange={e => setDmgUnit(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px', fontSize: '14px',
                      background: dmgUnit ? 'var(--bg-secondary, #f0fdf4)' : 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Damaged Quantity *
                  </label>
                  <input
                    type="number" min="0.001" step="any" placeholder="0"
                    value={dmgQty}
                    onChange={e => setDmgQty(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)' }}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Note (always required) ── */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Note / Reason <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={3}
              placeholder={
                isShortage
                  ? 'Explain what happened — e.g. items were missing on arrival, box was open…'
                  : isDamage
                  ? 'Describe the damage — e.g. water damage, expired goods, broken packaging…'
                  : 'Explain why you are returning this item — e.g. wrong item delivered, excess stock…'
              }
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px',
                border: `1px solid ${!note.trim() && note !== '' ? '#ef4444' : 'var(--border-color, #d1d5db)'}`,
                borderRadius: '8px', fontSize: '14px',
                resize: 'vertical', boxSizing: 'border-box',
                background: 'var(--bg-input, #fff)', fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginTop: '12px' }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color, #e5e7eb)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} className="btn" style={{ padding: '8px 20px' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn"
            style={{ padding: '8px 20px', backgroundColor: accentColor, color: '#fff', border: 'none', opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? 'Submitting…'
              : isShortage
              ? 'Submit Shortage Report'
              : isDamage
              ? 'Submit Damage Report'
              : 'Submit Return Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiscrepancyModal;
