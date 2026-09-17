import { useState } from 'react';
import Modal from './Modal.jsx';
import { formatMoney } from '../utils/format.js';
import {
  PURCHASE_PAYMENT_METHODS,
  PURCHASE_PAYMENT_METHOD_LABELS,
} from '../services/purchase.service.js';

function balanceDue(purchase) {
  return Math.max(Number(purchase.total_amount) - Number(purchase.paid_amount), 0);
}

export default function SupplierPaymentModal({ purchase, onClose, onSubmit }) {
  const balance = balanceDue(purchase);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (value > balance) {
      setError(`Amount cannot exceed the outstanding balance of ${formatMoney(balance)}.`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        amount: value,
        method,
        paymentDate: paymentDate || undefined,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Record Supplier Payment" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="summary-grid" style={{ marginBottom: 14 }}>
          <div className="summary-item">
            <span className="summary-label">Invoice</span>
            <span className="summary-value">{purchase.invoice_number}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total</span>
            <span className="summary-value" style={{ fontWeight: 700 }}>
              {formatMoney(purchase.total_amount)}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Paid</span>
            <span className="summary-value" style={{ color: 'var(--color-success)' }}>
              {formatMoney(purchase.paid_amount)}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Balance</span>
            <span className="summary-value" style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
              {formatMoney(balance)}
            </span>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="paymentAmount">Amount</label>
          <input
            id="paymentAmount"
            name="amount"
            type="number"
            min="0.01"
            max={balance}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            disabled={submitting || balance <= 0}
          />
          <p className="field-hint">
            Must be greater than zero and at most {formatMoney(balance)} (backend enforces this too).
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="paymentMethod">Payment Method</label>
          <select
            id="paymentMethod"
            name="method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            disabled={submitting}
          >
            {PURCHASE_PAYMENT_METHODS.map((item) => (
              <option key={item} value={item}>
                {PURCHASE_PAYMENT_METHOD_LABELS[item] || item}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="paymentDate">Payment Date</label>
          <input
            id="paymentDate"
            name="paymentDate"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="paymentNotes">Reference / Note</label>
          <input
            id="paymentNotes"
            name="notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
            maxLength={255}
            disabled={submitting}
          />
        </div>

        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || balance <= 0}>
            {submitting ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}