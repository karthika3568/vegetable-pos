import { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { purchaseOrderService } from '../services/purchase-order.service.js';
import { formatQuantity } from '../utils/format.js';
import Modal from './Modal.jsx';

export default function ReceiveGoodsModal({ po, onClose, onReceived }) {
  const { showToast } = useToast();
  const [lines, setLines] = useState(() =>
    po.items.map((item) => ({
      itemId: item.id,
      productId: item.product_id,
      productName: item.product_name,
      productCode: item.product_code,
      unit: item.unit,
      ordered: Number(item.ordered_quantity),
      remaining: Number(item.remaining_quantity),
      received: '',
      damaged: '',
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateLine(index, patch) {
    setLines((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, ...patch } : line
    )));
  }

  const totals = lines.reduce((acc, line) => {
    const received = Number(line.received) || 0;
    const damaged = Number(line.damaged) || 0;
    acc.received += received;
    acc.damaged += damaged;
    return acc;
  }, { received: 0, damaged: 0 });

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const linesWithQty = lines.filter((line) => {
      const received = Number(line.received) || 0;
      const damaged = Number(line.damaged) || 0;
      return received > 0 || damaged > 0;
    });

    if (linesWithQty.length === 0) {
      setError('Enter a received or damaged quantity for at least one item.');
      return;
    }

    for (const line of linesWithQty) {
      const received = Number(line.received) || 0;
      const damaged = Number(line.damaged) || 0;
      if (received + damaged > line.remaining) {
        setError(
          `Receiving ${received} (+${damaged} damaged) exceeds the outstanding ${line.remaining} for ${line.productName}.`
        );
        return;
      }
    }

    if (!linesWithQty.some((line) => (Number(line.received) || 0) > 0)) {
      setError('At least one item must have a received quantity greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await purchaseOrderService.receive(po.id, {
        items: linesWithQty.map((line) => ({
          purchaseOrderItemId: line.itemId,
          receivedQuantity: Number(line.received) || 0,
          damagedQuantity: Number(line.damaged) || 0,
        })),
      });
      onReceived(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not record the goods receipt.';
      setError(msg);
      showToast(msg, 'error');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Receive Goods — ${po.po_number}`} onClose={onClose} wide>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="receive-grid-head">
          <span className="receive-grid-head-label">Product</span>
          <span>Ordered</span>
          <span>This receipt — received</span>
          <span>This receipt — damaged</span>
          <span>Unit</span>
          <span>Outstanding</span>
        </div>
        {lines.map((line, index) => (
          <div className="receive-grid-row" key={line.itemId}>
            <div className="receive-product">
              <span className="cell-main">{line.productName}</span>
              <span className="cell-sub">
                {line.productCode ? `${line.productCode} · remaining ${formatQuantity(line.remaining)} ${line.unit || ''}` : `remaining ${formatQuantity(line.remaining)} ${line.unit || ''}`}
              </span>
            </div>
            <span className="receive-remaining">{formatQuantity(line.ordered)}{line.unit ? ` ${line.unit}` : ''}</span>
            <input
              aria-label={`Received quantity for ${line.productName}`}
              type="number"
              min="0"
              step="0.001"
              placeholder="0"
              value={line.received}
              onChange={(event) => updateLine(index, { received: event.target.value })}
              disabled={submitting}
            />
            <input
              aria-label={`Damaged quantity for ${line.productName}`}
              type="number"
              min="0"
              step="0.001"
              placeholder="0"
              value={line.damaged}
              onChange={(event) => updateLine(index, { damaged: event.target.value })}
              disabled={submitting}
            />
            <span className="receive-remaining">{line.unit || '—'}</span>
            <span className="receive-remaining">{formatQuantity(line.remaining)}{line.unit ? ` ${line.unit}` : ''}</span>
          </div>
        ))}

        <div className="receive-totals">
          <div className="receive-total-item">
            <span>Receiving</span>
            <strong>{formatQuantity(totals.received)}</strong>
          </div>
          <div className="receive-total-item">
            <span>Damaged (not stocked)</span>
            <strong>{formatQuantity(totals.damaged)}</strong>
          </div>
        </div>

        <p className="field-hint">
          Stock increases only by the received (good) quantity. Damaged quantities are recorded but never added to stock.
          Prices are entered later from the supplier&apos;s actual bill.
        </p>

        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Receiving…' : 'Confirm Receipt'}
          </button>
        </div>
      </form>
    </Modal>
  );
}