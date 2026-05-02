import { useState } from 'react';
import api from '../utils/api';
import { formatQuantity } from '../utils/formatNumber';
import { FiX, FiInfo, FiPackage } from 'react-icons/fi';

const TYPE_OPTIONS = [
  { value: 'employee_purchase', label: 'Employee Purchase', hint: 'A staff member is buying / taking the item.' },
  { value: 'principal',         label: 'Principal / Owner', hint: 'Item taken by an owner or principal stakeholder.' },
  { value: 'outside_party',     label: 'Outside Party (DFA)', hint: 'Item handed off to an external party such as DFA.' }
];

/**
 * StockWithdrawalModal
 *
 * Opens from the Inventory page on a specific item row. Submits to
 * /stock-withdrawals which immediately deducts inventory and pings admin.
 *
 * Props:
 *   item        the inventory row { description, unit, quantity, location_id, ... }
 *   locationId  source location (defaults to item.location_id)
 *   onClose     close handler
 *   onSuccess   called after a successful withdrawal — caller should refresh inventory
 */
function StockWithdrawalModal({ item, locationId, onClose, onSuccess }) {
  const [withdrawalType, setWithdrawalType] = useState('employee_purchase');
  const [recipient, setRecipient] = useState('');
  const [qty, setQty]             = useState('');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const available = parseFloat(item?.quantity || 0);
  const parsedQty = parseFloat(qty);
  const qtyValid  = !isNaN(parsedQty) && parsedQty > 0 && parsedQty <= available;

  const submit = async () => {
    setError('');
    if (!qtyValid) { setError(`Enter a quantity between 1 and ${available}`); return; }
    if (!recipient.trim()) { setError('Recipient name is required so the admin knows who took the item'); return; }
    try {
      setLoading(true);
      await api.post('/stock-withdrawals', {
        location_id:       locationId || item.location_id,
        item_description:  item.description,
        unit:              item.unit,
        quantity:          parsedQty,
        withdrawal_type:   withdrawalType,
        recipient_name:    recipient.trim(),
        notes:             notes.trim() || null
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const accent = '#b91c1c';

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
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg-card, #fff)', zIndex: 1
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiPackage size={22} color={accent} />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Pull Out Stock</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>
                Record stock leaving this location for a non-sale reason
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary, #6b7280)', display: 'flex', alignItems: 'center' }}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Info banner */}
          <div style={{
            background: `${accent}15`, border: `1px solid ${accent}40`,
            borderRadius: '8px', padding: '10px 14px', marginBottom: '20px',
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            fontSize: '13px', color: accent
          }}>
            <FiInfo size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            The quantity is removed from inventory immediately and admin is notified.
          </div>

          {/* Item summary */}
          <div style={{
            background: 'var(--bg-secondary, #f3f4f6)',
            borderRadius: '8px', padding: '12px 14px', marginBottom: '16px'
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{item.description}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary, #6b7280)' }}>
              Available: <strong>{formatQuantity(available)} {item.unit}</strong>
            </div>
          </div>

          {/* Withdrawal type */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Pull-out Type *
            </label>
            <select
              value={withdrawalType}
              onChange={e => setWithdrawalType(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)' }}
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary, #6b7280)', marginTop: '4px' }}>
              {TYPE_OPTIONS.find(o => o.value === withdrawalType)?.hint}
            </div>
          </div>

          {/* Quantity + recipient */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Quantity * <span style={{ fontWeight: 400, color: 'var(--text-secondary, #6b7280)' }}>(max {formatQuantity(available)})</span>
              </label>
              <input
                type="number"
                min="0.001"
                max={available}
                step="any"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                onWheel={e => e.target.blur()}
                style={{
                  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                  border: `1px solid ${qty !== '' && !qtyValid ? '#ef4444' : 'var(--border-color, #d1d5db)'}`,
                  borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Recipient Name *
              </label>
              <input
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="Who received the item"
                style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg-input, #fff)' }}
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Notes
            </label>
            <textarea
              rows={3}
              placeholder="Optional context (purchase price, reason, reference number, etc.)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid var(--border-color, #d1d5db)',
                borderRadius: '8px', fontSize: '14px',
                resize: 'vertical', boxSizing: 'border-box',
                background: 'var(--bg-input, #fff)', fontFamily: 'inherit'
              }}
            />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginTop: '12px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color, #e5e7eb)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} disabled={loading} className="btn" style={{ padding: '8px 20px' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="btn"
            style={{ padding: '8px 20px', backgroundColor: accent, color: '#fff', border: 'none', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Recording…' : 'Record Pull-out'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StockWithdrawalModal;
