import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity } from '../utils/formatNumber';
import {
  FiAlertTriangle, FiRefreshCw, FiX, FiInfo, FiXCircle
} from 'react-icons/fi';

/**
 * DiscrepancyModal
 *
 * type = 'shortage' → branch reports receiving fewer items than the delivery states
 *   props: delivery (the delivered delivery object with .items[])
 *
 * type = 'return' → branch requests to send items back to warehouse
 *   props: (no delivery needed)
 *
 * type = 'damage' → warehouse reports damaged/write-off goods
 *   props: (no delivery needed; warehouse_location_id comes from user.location_id)
 */
function DiscrepancyModal({ type, delivery, onClose, onSuccess }) {
  const { user } = useContext(AuthContext);

  // ── shortage state ──
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [receivedQty, setReceivedQty] = useState('');

  // ── return state ──
  const [itemDescription, setItemDescription] = useState('');
  const [unit, setUnit]                       = useState('');
  const [returnQty, setReturnQty]             = useState('');
  const [warehouseId, setWarehouseId]         = useState('');
  const [warehouses, setWarehouses]           = useState([]);

  // ── damage state ──
  const [damageItemDesc, setDamageItemDesc] = useState('');
  const [damageUnit, setDamageUnit]         = useState('');
  const [damageQty, setDamageQty]           = useState('');

  // ── common ──
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (type === 'return') fetchWarehouses();
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

  // derived helpers
  const deliveryItems  = delivery?.items || [];
  const selectedItem   = deliveryItems[selectedItemIdx] || null;
  const expectedQty    = selectedItem ? parseFloat(selectedItem.quantity) : 0;
  const parsedReceived = parseFloat(receivedQty);
  const shortageAmt    = !isNaN(parsedReceived) && parsedReceived < expectedQty
    ? expectedQty - parsedReceived
    : null;

  const handleSubmit = async () => {
    setError('');

    if (!note.trim()) {
      setError('A note is required before submitting');
      return;
    }

    try {
      setLoading(true);

      if (type === 'shortage') {
        if (!selectedItem) {
          setError('Please select an item');
          return;
        }
        const rcvd = parseFloat(receivedQty);
        if (isNaN(rcvd) || rcvd < 0) {
          setError('Enter a valid received quantity');
          return;
        }
        if (rcvd >= expectedQty) {
          setError(`Received quantity must be less than expected (${expectedQty} ${selectedItem.unit})`);
          return;
        }

        await api.post('/delivery-discrepancies', {
          type: 'shortage',
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
        if (!itemDescription.trim()) { setError('Item description is required'); return; }
        if (!unit.trim())            { setError('Unit is required'); return; }
        const qty = parseFloat(returnQty);
        if (isNaN(qty) || qty <= 0)  { setError('Enter a valid return quantity'); return; }
        if (!warehouseId)            { setError('Select a warehouse'); return; }

        await api.post('/delivery-discrepancies', {
          type: 'return',
          item_description:     itemDescription.trim(),
          unit:                 unit.trim(),
          expected_quantity:    qty,
          received_quantity:    qty,
          note:                 note.trim(),
          branch_location_id:   user.location_id,
          warehouse_location_id: parseInt(warehouseId)
        });

      } else {
        // damage — warehouse reports damaged/write-off goods
        if (!damageItemDesc.trim()) { setError('Item description is required'); return; }
        if (!damageUnit.trim())     { setError('Unit is required'); return; }
        const qty = parseFloat(damageQty);
        if (isNaN(qty) || qty <= 0) { setError('Enter a valid damage quantity'); return; }

        await api.post('/delivery-discrepancies', {
          type: 'damage',
          item_description:     damageItemDesc.trim(),
          unit:                 damageUnit.trim(),
          expected_quantity:    qty,
          received_quantity:    qty,
          note:                 note.trim(),
          warehouse_location_id: user.location_id
        });
      }

      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const isShortage = type === 'shortage';
  const isDamage   = type === 'damage';
  const accentColor = isShortage ? '#f59e0b' : isDamage ? '#ef4444' : '#8b5cf6';

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
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden'
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isShortage
              ? <FiAlertTriangle size={22} color={accentColor} />
              : isDamage
              ? <FiXCircle       size={22} color={accentColor} />
              : <FiRefreshCw     size={22} color={accentColor} />}
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                {isShortage ? 'Report Delivery Shortage' : isDamage ? 'Report Damaged Goods' : 'Request Return to Warehouse'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>
                {isShortage
                  ? `Delivery from ${delivery?.from_location_name || 'Warehouse'}`
                  : isDamage
                  ? 'Damaged items will be written off pending admin approval'
                  : 'Items will be sent back pending admin approval'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px', color: 'var(--text-secondary, #6b7280)',
              display: 'flex', alignItems: 'center'
            }}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 24px' }}>

          {/* ── Info banner ── */}
          <div style={{
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}40`,
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '20px',
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            fontSize: '13px', color: accentColor
          }}>
            <FiInfo size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            {isShortage
              ? 'Admin will review and, if approved, add the missing quantity back to the warehouse and correct your branch inventory.'
              : isDamage
              ? 'Admin must approve this report. Once approved, the damaged quantity will be written off from warehouse inventory.'
              : 'Admin must approve this request. Once approved, the specified quantity will be removed from your inventory and added back to the warehouse.'}
          </div>

          {/* ── SHORTAGE: item selector ── */}
          {isShortage && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Which item is short? *
                </label>
                <select
                  value={selectedItemIdx}
                  onChange={e => { setSelectedItemIdx(parseInt(e.target.value)); setReceivedQty(''); }}
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    borderRadius: '8px', fontSize: '14px',
                    background: 'var(--bg-input, #fff)'
                  }}
                >
                  {deliveryItems.map((item, idx) => (
                    <option key={idx} value={idx}>
                      {item.description} — {formatQuantity(item.quantity)} {item.unit}
                    </option>
                  ))}
                </select>
              </div>

              {selectedItem && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '12px', marginBottom: '16px'
                }}>
                  {/* Expected */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Expected (delivery says)
                    </label>
                    <div style={{
                      padding: '8px 12px',
                      background: 'var(--bg-secondary, #f3f4f6)',
                      borderRadius: '8px', fontSize: '14px',
                      fontWeight: 600, color: 'var(--text-primary, #111)'
                    }}>
                      {formatQuantity(expectedQty)} {selectedItem.unit}
                    </div>
                  </div>

                  {/* Actually received */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Actually Received *
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={expectedQty - 0.001}
                      step="any"
                      placeholder="0"
                      value={receivedQty}
                      onChange={e => setReceivedQty(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px',
                        border: `1px solid ${receivedQty !== '' && (isNaN(parsedReceived) || parsedReceived >= expectedQty) ? '#ef4444' : 'var(--border-color, #d1d5db)'}`,
                        borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                        background: 'var(--bg-input, #fff)'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Shortage summary */}
              {shortageAmt !== null && shortageAmt > 0 && (
                <div style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 500 }}>
                    Shortage amount:
                  </span>
                  <span style={{ fontWeight: 700, color: '#92400e', fontSize: '16px' }}>
                    {formatQuantity(shortageAmt)} {selectedItem?.unit}
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── RETURN: item fields ── */}
          {!isShortage && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Item Description *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paracetamol 500mg"
                  value={itemDescription}
                  onChange={e => setItemDescription(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                    background: 'var(--bg-input, #fff)'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Unit *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. pcs / box / bottle"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                      background: 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Quantity to Return *
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    placeholder="0"
                    value={returnQty}
                    onChange={e => setReturnQty(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                      background: 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Return to Warehouse *
                </label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    borderRadius: '8px', fontSize: '14px',
                    background: 'var(--bg-input, #fff)'
                  }}
                >
                  <option value="">— Select warehouse —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* ── DAMAGE: item fields ── */}
          {isDamage && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Item Description *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paracetamol 500mg"
                  value={damageItemDesc}
                  onChange={e => setDamageItemDesc(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                    background: 'var(--bg-input, #fff)'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Unit *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. pcs / box / bottle"
                    value={damageUnit}
                    onChange={e => setDamageUnit(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                      background: 'var(--bg-input, #fff)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Damaged Quantity *
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    placeholder="0"
                    value={damageQty}
                    onChange={e => setDamageQty(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                      background: 'var(--bg-input, #fff)'
                    }}
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
              placeholder={isShortage
                ? 'Explain what happened — e.g. box was damaged, items were missing on arrival…'
                : isDamage
                ? 'Describe the damage — e.g. water damage, expired goods, broken packaging…'
                : 'Explain why you are returning this item — e.g. wrong item delivered, excess stock…'}
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px',
                border: `1px solid ${!note.trim() && note !== '' ? '#ef4444' : 'var(--border-color, #d1d5db)'}`,
                borderRadius: '8px', fontSize: '14px',
                resize: 'vertical', boxSizing: 'border-box',
                background: 'var(--bg-input, #fff)',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* ── Error ── */}
          {error && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: '8px', padding: '10px 14px',
              color: '#b91c1c', fontSize: '13px', marginTop: '12px'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', justifyContent: 'flex-end', gap: '10px'
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            className="btn"
            style={{ padding: '8px 20px' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn"
            style={{
              padding: '8px 20px',
              backgroundColor: accentColor,
              color: '#fff',
              border: 'none',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Submitting…' : isShortage ? 'Submit Shortage Report' : isDamage ? 'Submit Damage Report' : 'Submit Return Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiscrepancyModal;
