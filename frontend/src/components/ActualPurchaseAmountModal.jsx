import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { purchaseService } from '../services/purchase.service.js';
import { formatMoney, formatQuantity } from '../utils/format.js';

export default function ActualPurchaseAmountModal({ purchase, reference, items, onClose, onSaved }) {
  const lines = useMemo(
    () =>
      (items || []).map((item) => ({
        productId: item.product_id,
        productName: item.product_name,
        productCode: item.product_code,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: String(item.purchase_price ?? ''),
        damagedQuantity: Number(item.damaged_quantity) > 0 ? String(item.damaged_quantity) : '',
      })),
    [items]
  );

  const [prices, setPrices] = useState(() =>
    (items || []).map((item) =>
      item.purchase_price === null || item.purchase_price === undefined
        ? ''
        : String(item.purchase_price)
    )
  );
  const [damages, setDamages] = useState(() =>
    (items || []).map((item) =>
      Number(item.damaged_quantity) > 0 ? String(item.damaged_quantity) : ''
    )
  );
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const grossAmount = lines.reduce((sum, line, index) => {
    const price = Number(prices[index]);
    return sum + (Number.isFinite(price) && price >= 0 ? line.quantity * price : 0);
  }, 0);

  const damageAmount = lines.reduce((sum, line, index) => {
    const price = Number(prices[index]);
    const damagedQty = Number(damages[index]) || 0;
    if (!Number.isFinite(price) || price < 0 || damagedQty <= 0) {
      return sum;
    }
    if (damagedQty > line.quantity) {
      return sum;
    }
    return sum + damagedQty * price;
  }, 0);

  const damageApplied = accepted ? damageAmount : 0;
  const netPayable = Math.max(grossAmount - damageApplied, 0);

  function updatePrice(index, value) {
    setPrices((current) => current.map((price, priceIndex) => (
      priceIndex === index ? value : price
    )));
  }

  function updateDamage(index, value) {
    setDamages((current) => current.map((damage, damageIndex) => (
      damageIndex === index ? value : damage
    )));
  }

  function resetDamages() {
    setDamages((current) => current.map((_, index) =>
      lines[index]?.damagedQuantity || ''
    ));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (lines.length === 0) {
      setError('This purchase has no items to price.');
      return;
    }

    const hasInvalid = lines.some((line, index) => {
      const price = Number(prices[index]);
      return !Number.isFinite(price) || price < 0 || prices[index] === '';
    });
    if (hasInvalid) {
      setError('Enter a valid actual unit price for every item.');
      return;
    }

    const cleanDamages = [];
    lines.forEach((line, index) => {
      const damagedQty = Number(damages[index]) || 0;
      if (damagedQty < 0) {
        setError('Damaged quantities cannot be negative.');
        return;
      }
      if (damagedQty > line.quantity) {
        setError(`Damaged quantity for ${line.productName} cannot exceed the received quantity ${formatQuantity(line.quantity)}.`);
        return;
      }
      if (damagedQty > 0) {
        cleanDamages.push({ productId: line.productId, quantity: damagedQty });
      }
    });

    if (error) return;

    setSubmitting(true);
    try {
      const saved = await purchaseService.recordActualAmount(purchase.id, {
        items: lines.map((line, index) => ({
          productId: line.productId,
          unitPrice: Number(prices[index]),
        })),
        damages: cleanDamages,
        damageAdjustmentAccepted: accepted,
      });
      onSaved(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not record the actual purchase amount.';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Record Actual Purchase Amount" onClose={onClose} wide>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <p className="field-hint">
          Enter the actual unit prices from the supplier&apos;s bill{reference ? ` for ${reference}` : ''}. This sets the
          purchase total; it can only be set once, before any payment is recorded.
        </p>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Received qty</th>
                <th className="num">Damaged qty</th>
                <th className="num">Actual unit price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.productId}-${index}`}>
                  <td>
                    <span className="cell-main">{line.productName}</span>
                    {line.productCode ? <span className="cell-sub">{line.productCode}</span> : null}
                  </td>
                  <td className="num">
                    {formatQuantity(line.quantity)}{line.unit ? ` ${line.unit}` : ''}
                  </td>
                  <td className="num">
                    <input
                      aria-label={`Damaged quantity for ${line.productName}`}
                      className="actual-amount-input"
                      type="number"
                      min="0"
                      max={line.quantity}
                      step="0.001"
                      value={damages[index]}
                      placeholder="0"
                      onChange={(event) => updateDamage(index, event.target.value)}
                      disabled={submitting}
                    />
                  </td>
                  <td className="num">
                    <input
                      aria-label={`Actual unit price for ${line.productName}`}
                      className="actual-amount-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={prices[index]}
                      onChange={(event) => updatePrice(index, event.target.value)}
                      disabled={submitting}
                    />
                  </td>
                  <td className="num">
                    {formatMoney(
                      (Number(prices[index]) || 0) * line.quantity
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="purchase-form-total">
          <span>Gross amount</span>
          <strong>{formatMoney(grossAmount)}</strong>
        </div>

        {damageAmount > 0 ? (
          <div className="damage-adjustment-section">
            <div className="card-heading">
              <h3 className="card-title">Damage Adjustment</h3>
              {damages.some((d) => Number(d) > 0) ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={resetDamages}
                  disabled={submitting}
                >
                  Reset to received damage
                </button>
              ) : null}
            </div>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-label">Damage value</span>
                <span className="summary-value">{formatMoney(damageAmount)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Adjustment</span>
                <span className="summary-value" style={{ color: accepted ? 'var(--color-danger)' : undefined }}>
                  {accepted ? `- ${formatMoney(damageAmount)}` : formatMoney(0)}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Net payable</span>
                <span className="summary-value" style={{ fontWeight: 700 }}>
                  {formatMoney(netPayable)}
                </span>
              </div>
            </div>
            <div className="form-field" style={{ marginTop: 0 }}>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  disabled={submitting}
                />
                <span>
                  Supplier accepted damage adjustment (- {formatMoney(damageAmount)}) is deducted from net payable.
                  Unchecked, the damage is only tracked for stock/loss records and does not reduce supplier payable.
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || lines.length === 0}>
            {submitting ? 'Saving…' : 'Save Actual Amount'}
          </button>
        </div>
      </form>
    </Modal>
  );
}