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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const total = lines.reduce((sum, line, index) => {
    const price = Number(prices[index]);
    return sum + (Number.isFinite(price) && price >= 0 ? line.quantity * price : 0);
  }, 0);

  function updatePrice(index, value) {
    setPrices((current) => current.map((price, priceIndex) => (
      priceIndex === index ? value : price
    )));
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

    setSubmitting(true);
    try {
      const saved = await purchaseService.recordActualAmount(purchase.id, {
        items: lines.map((line, index) => ({
          productId: line.productId,
          unitPrice: Number(prices[index]),
        })),
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
          <span>Actual total</span>
          <strong>{formatMoney(total)}</strong>
        </div>

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
