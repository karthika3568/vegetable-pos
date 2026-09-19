import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { posService } from '../services/pos.service.js';
import { customerService } from '../services/customer.service.js';
import { salesService, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../services/sales.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useLanguage } from '../i18n/index.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Spinner from '../components/Spinner.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { formatMoney, formatQuantity } from '../utils/format.js';
import {
  PAYMENT_MODES,
  round2,
  defaultPaymentRows,
  computePaymentTotals,
} from '../utils/posPayment.js';
import { playPosSound } from '../utils/sounds.js';

const PAYMENT_MAX = 20;
const PAYMENT_TYPE_LABELS_KEYS = {
  cash: 'status.cash',
  credit: 'status.credit',
  partial: 'status.partial',
};

function round3(value) {
  const n = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
}

function toRate(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function Money({ value }) {
  return <span className="money">{formatMoney(value)}</span>;
}

function Qty({ value }) {
  return <span className="qty">{formatQuantity(value)}</span>;
}

/**
 * Retail/wholesale unit-price rule - must mirror sale.service: wholesale
 * mode uses wholesale_price when the product has one (>= 0), otherwise
 * falls back to the retail selling price.
 */
function resolveUnitPrice(product, saleType) {
  const base = Number(product.sellingPrice);
  if (saleType === 'wholesale' && product.wholesalePrice != null && Number(product.wholesalePrice) >= 0) {
    return round2(Number(product.wholesalePrice));
  }
  return round2(base);
}

/**
 * Client-side GST estimate mirroring src/services/sale.service.js. The
 * server remains authoritative - this is only a live preview so the
 * operator sees totals that will match the created sale.
 */
function estimateGst({ cart, discount, customerState, shopState, fallbackRate }) {
  const lines = [];
  let subtotal = 0;

  for (const line of cart) {
    const lineTotal = round2(Number(line.quantity) * line.unitPrice);
    subtotal = round2(subtotal + lineTotal);
    lines.push({ ...line, lineTotal });
  }

  const discountValue = discount === '' ? 0 : Number(discount) || 0;
  const intra =
    !customerState || !shopState ||
    String(customerState).trim().toLowerCase() === String(shopState).trim().toLowerCase();

  const hasCode = (line) =>
    line.product && line.product.taxCode != null && line.product.taxCode !== '';
  const ratesFor = (line) => {
    if (hasCode(line)) {
      return {
        code: line.product.taxCode,
        cgst: toRate(line.product.cgstRate),
        sgst: toRate(line.product.sgstRate),
        igst: toRate(line.product.igstRate),
      };
    }
    const flat = toRate(fallbackRate);
    return { code: null, cgst: toRate(flat / 2), sgst: toRate(flat / 2), igst: flat };
  };

  let remaining = round2(discountValue);
  let embeddedTax = 0;
  let addedTax = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  lines.forEach((item, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast
      ? remaining
      : subtotal > 0
        ? round2((item.lineTotal / subtotal) * discountValue)
        : 0;
    remaining = round2(remaining - share);
    const net = round2(item.lineTotal - share);
    const rates = ratesFor(item);
    const rate = intra ? toRate(rates.cgst + rates.sgst) : rates.igst;

    let embedded = 0;
    let added = 0;
    if (rate > 0) {
      if (item.priceIncludesTax) embedded = round2((net * rate) / (100 + rate));
      else added = round2((net * rate) / 100);
    }

    const part = round2(embedded + added);
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (intra) {
      const combined = toRate(rates.cgst + rates.sgst);
      if (combined > 0) {
        cgst = round2(part * (rates.cgst / combined));
        sgst = round2(part - cgst);
      }
    } else {
      igst = part;
    }

    embeddedTax = round2(embeddedTax + embedded);
    addedTax = round2(addedTax + added);
    cgstTotal = round2(cgstTotal + cgst);
    sgstTotal = round2(sgstTotal + sgst);
    igstTotal = round2(igstTotal + igst);

    item.gst = { rate, embedded, added, cgst, sgst, igst };
  });

  const taxAmount = round2(embeddedTax + addedTax);
  const total = round2(subtotal - discountValue + addedTax);

  return {
    intra,
    lines,
    subtotal,
    discount: discountValue,
    taxAmount,
    cgst: intra ? cgstTotal : 0,
    sgst: intra ? round2(taxAmount - cgstTotal) : 0,
    igst: intra ? 0 : igstTotal,
    total,
  };
}

function StockBadge({ available }) {
  const { t } = useLanguage();
  if (available <= 0) return <span className="badge badge-default">{t('pos.outOfStock')}</span>;
  if (available < 1) return <span className="badge badge-warning">{t('pos.lowStock')}</span>;
  return <span className="badge badge-active">{t('pos.inStock')}</span>;
}

function ProductCard({ product, saleType, selected, onSelect, onAdd }) {
  const { t } = useLanguage();
  const available = product.currentStock;
  const disabled = available <= 0;
  const price = resolveUnitPrice(product, saleType);
  const decimalUnit = ['kg', 'g', 'litre', 'liter'].includes(String(product.unit || '').trim().toLowerCase());
  const [quantity, setQuantity] = useState(decimalUnit ? 1 : 1);

  const step = decimalUnit ? 0.5 : 1;

  function normalizeQuantity(nextValue) {
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return step;
    }

    if (decimalUnit) {
      const rounded = round3(numeric);
      return Math.min(rounded, Number(available));
    }

    return Math.max(1, Math.min(Math.round(numeric), Number(available) || 1));
  }

  function updateQuantity(nextValue) {
    if (disabled || nextValue === '') return;
    setQuantity(normalizeQuantity(nextValue));
  }

  function adjustQuantity(delta) {
    if (disabled) return;
    const current = Number(quantity) || step;
    const next = decimalUnit ? round3(current + delta) : Math.max(1, Math.round(current + delta));
    setQuantity(normalizeQuantity(next));
  }

  return (
    <div
      className={`pos-product-card${selected ? ' is-selected' : ''}${disabled ? ' is-out' : ''}`}
      onMouseEnter={() => onSelect(product.id)}
      onClick={() => onSelect(product.id)}
    >
      <div className="pos-product-thumb">
        <ProductImage source={product.imagePath} alt={product.name} size="card" />
      </div>

      <div className="pos-product-body">
        <div className="pos-product-head">
          <h3 className="pos-product-name" title={product.name}>
            {product.name}
          </h3>
          <StockBadge available={available} />
        </div>

        <div className="pos-product-meta-row">
          {product.unit ? <span className="pos-product-unit">{product.unit}</span> : null}
          <span className="pos-product-price"><Money value={price} /></span>
        </div>

        <div className="pos-product-meta-row pos-product-meta-row-secondary">
          {saleType === 'wholesale' && product.wholesalePrice != null && Number(product.wholesalePrice) >= 0 ? (
            <span className="pos-product-tag">{t('pos.wholesale')}</span>
          ) : null}
          <span className="pos-product-stock">{t('pos.stock')}: {formatQuantity(available)}</span>
        </div>

        <div className="pos-product-controls">
          <div className="pos-qty-controls pos-qty-controls-compact">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                adjustQuantity(-step);
              }}
              disabled={disabled || quantity <= step}
              aria-label={`−`}
            >
              −
            </button>
            <input
              type="number"
              min={decimalUnit ? '0.5' : '1'}
              step={decimalUnit ? '0.5' : '1'}
              inputMode={decimalUnit ? 'decimal' : 'numeric'}
              value={quantity}
              onChange={(event) => {
                event.stopPropagation();
                updateQuantity(event.target.value);
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Quantity of ${product.name}`}
              disabled={disabled}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                adjustQuantity(step);
              }}
              disabled={disabled || quantity >= available}
              aria-label={`+`}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm pos-product-add"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onAdd(product, normalizeQuantity(quantity));
            }}
          >
            {t('pos.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartLine({ line, onChange, onIncrement, onDecrement, onRemove }) {
  const { t } = useLanguage();
  const overStock = Number(line.quantity) > line.available;

  return (
    <div className={`pos-cart-line${overStock ? ' has-error' : ''}`}>
      <div className="pos-cart-line-top">
        <div className="pos-cart-line-name">
          <span className="cell-main">{line.name}</span>
          <span className="cell-sub">
            {line.productCode}
            {line.unit ? ` · ${line.unit}` : ''}
          </span>
        </div>
        <button
          type="button"
          className="icon-btn pos-cart-remove"
          onClick={() => onRemove(line.productId)}
          aria-label={t('pos.removeFromCart')}
          title={t('pos.removeFromCart')}
        >
          ×
        </button>
      </div>

      <div className="pos-cart-line-main">
        <div className="pos-qty-controls">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onDecrement(line.productId)}
            disabled={Number(line.quantity) <= round3(0.001)}
            aria-label={`−`}
          >
            −
          </button>
          <input
            type="number"
            min="0.001"
            step="0.001"
            inputMode="decimal"
            value={line.quantity}
            onChange={(event) => onChange(line.productId, event.target.value)}
            aria-label={`Quantity of ${line.name}`}
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onIncrement(line.productId)}
            disabled={Number(line.quantity) >= line.available}
            aria-label={`+`}
          >
            +
          </button>
        </div>
        <p className="pos-cart-line-price">
          <Money value={line.unitPrice} />
          {overStock ? (
            <span className="pos-cart-line-warn">
              {t('pos.availableCount', { count: formatQuantity(line.available) })}
            </span>
          ) : null}
        </p>
      </div>

      <div className="pos-cart-line-total">
        <span className="cell-main">
          <Money value={round2(line.quantity * line.unitPrice)} />
        </span>
      </div>
    </div>
  );
}

function PaymentRow({ payment, index, onChange, onRemove, canRemove, usedMethods }) {
  const { t } = useLanguage();
  const methods = [...PAYMENT_METHODS, 'credit'];
  return (
    <div className="pos-payment-row">
      <select
        value={payment.method}
        onChange={(event) => onChange(index, { method: event.target.value })}
        aria-label={`Payment method ${index + 1}`}
      >
        {methods.map((method) => (
          <option
            key={method}
            value={method}
            disabled={method !== payment.method && usedMethods.includes(method)}
          >
            {method === 'credit' ? t('pos.credit') : t(`paymentMethods.${method}`) ?? PAYMENT_METHOD_LABELS[method] ?? method}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        value={payment.amount}
        onChange={(event) => onChange(index, { amount: event.target.value })}
        placeholder="0.00"
        aria-label={`Payment ${index + 1} amount`}
      />
      {canRemove ? (
        <button
          type="button"
          className="icon-btn"
          onClick={() => onRemove(index)}
          aria-label={`Remove payment ${index + 1}`}
          title={t('common.remove')}
        >
          ×
        </button>
      ) : (
        <span className="pos-payment-row-spacer" aria-hidden="true" />
      )}
    </div>
  );
}

function SuccessSale({ sale, onReset }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const statusKey = `${sale.status ?? ''}`;
  const statusLabel = t(`status.${statusKey}`, {}) || sale.status;
  const saleTypeLabel = t(`pos.${sale.sale_type === 'wholesale' ? 'wholesale' : 'retail'}`);
  const customerName = sale.customer_name || t('common.walkIn');
  const paymentLabel = t(PAYMENT_TYPE_LABELS_KEYS[sale.payment_type] ?? '', {}) || sale.payment_type;

  return (
    <div className="pos-success">
      <div className="pos-success-hero">
        <div className="pos-success-icon" aria-hidden="true">
          ✓
        </div>
        <h2 className="pos-success-title">{t('pos.saleCompleted')}</h2>
        <p className="pos-success-sub">
          {t('pos.saleCompletedSub', { invoice: sale.invoice_number })}
        </p>
        <div className="state-actions">
          <button type="button" className="btn btn-primary" onClick={onReset}>
            {t('pos.newSale')}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(`/invoices?sale=${sale.id}`)}
          >
            {t('pos.invoice')}
          </button>
        </div>
      </div>

      <div className="pos-success-body">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">{t('pos.customer')}</span>
            <span className="summary-value">{customerName}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.invoice')}</span>
            <span className="summary-value">{sale.invoice_number}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.saleTypeLabel')}</span>
            <span className="summary-value">{saleTypeLabel}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.paymentType')}</span>
            <span className="summary-value">{paymentLabel}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.status')}</span>
            <span className={`badge badge-${sale.status === 'completed' ? 'completed' : 'default'}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">{t('pos.subtotal')}</span>
            <span className="summary-value">
              <Money value={sale.subtotal} />
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.discount')}</span>
            <span className="summary-value">
              <Money value={sale.discount_amount} />
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.taxPreview')}</span>
            <span className="summary-value">
              <Money value={sale.tax_amount} />
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.total')}</span>
            <span className="summary-value tone-success">
              <Money value={sale.total_amount} />
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.paid')}</span>
            <span className="summary-value">
              <Money value={sale.paid_amount} />
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('pos.balanceDue')}</span>
            <span className="summary-value tone-danger">
              <Money value={sale.balance_due} />
            </span>
          </div>
        </div>

        {sale.items?.length ? (
          <section className="pos-success-section">
            <h3 className="card-title">{t('pos.items')}</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('pos.product')}</th>
                    <th className="num">{t('pos.qty')}</th>
                    <th className="num">{t('pos.unitPrice')}</th>
                    <th className="num">{t('pos.lineTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="cell-main">{item.product_name}</span>
                        <span className="cell-sub">{item.product_code}</span>
                      </td>
                      <td className="num">
                        <Qty value={item.quantity} />
                      </td>
                      <td className="num">
                        <Money value={item.unit_price} />
                      </td>
                      <td className="num">
                        <Money value={item.line_total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {sale.payments?.length ? (
          <section className="pos-success-section">
            <h3 className="card-title">{t('pos.payment')}</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('pos.method')}</th>
                    <th className="num">{t('pos.amount')}</th>
                    {sale.payments.some((payment) => payment.notes) ? <th>{t('pos.notes')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {sale.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</td>
                      <td className="num">
                        <Money value={payment.amount} />
                      </td>
                      {sale.payments.some((p) => p.notes) ? <td>{payment.notes || '—'}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function NewCustomerModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (trimmedName.length > 150) {
      setError('Name must be at most 150 characters.');
      return;
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 20) {
      setError('Phone must be at most 20 characters.');
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 100) {
      setError('Email must be at most 100 characters.');
      return;
    }
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    const trimmedAddress = address.trim();
    if (trimmedAddress.length > 255) {
      setError('Address must be at most 255 characters.');
      return;
    }

    const creditLimitValue = creditLimit.trim() === '' ? 0 : Number(creditLimit);
    if (!Number.isFinite(creditLimitValue) || creditLimitValue < 0) {
      setError('Credit limit must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await customerService.create({
        name: trimmedName,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        address: trimmedAddress || null,
        creditLimit: creditLimitValue,
      });
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The customer could not be created.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="+ New Customer" onClose={onClose}>
      <form className="form pos-modal-form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="modalCustomerName">Name *</label>
          <input
            id="modalCustomerName"
            type="text"
            maxLength={150}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Customer name"
            autoFocus
            disabled={submitting}
          />
        </div>

        <div className="pos-modal-row">
          <div className="form-field">
            <label htmlFor="modalCustomerPhone">Phone</label>
            <input
              id="modalCustomerPhone"
              type="text"
              maxLength={20}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. 9876543210"
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="modalCustomerEmail">Email</label>
            <input
              id="modalCustomerEmail"
              type="email"
              maxLength={100}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="e.g. customer@example.com"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="modalCustomerAddress">Address</label>
          <textarea
            id="modalCustomerAddress"
            rows="2"
            maxLength={255}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Street address or locality"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="modalCustomerCreditLimit">Credit Limit</label>
          <input
            id="modalCustomerCreditLimit"
            type="number"
            min="0"
            step="0.01"
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            placeholder="0.00"
            disabled={submitting}
          />
          <p className="field-hint">Optional, non-negative. Limits credit allowed for this customer.</p>
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
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Create Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function POSPage() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [saleType, setSaleType] = useState('retail');

  const searchRef = useRef(null);
  const customerRef = useRef(null);
  const discountRef = useRef(null);
  const completeRef = useRef(null);
  const posPageRef = useRef(null);
  const productStripRef = useRef(null);
  const customerSectionRef = useRef(null);
  const checkoutPaneRef = useRef(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [stripCanScroll, setStripCanScroll] = useState({ left: false, right: false });

  const [cart, setCart] = useState([]);

  const [customerInput, setCustomerInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerData, setSelectedCustomerData] = useState(null);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerDropdownStyle, setCustomerDropdownStyle] = useState(null);

  const [discount, setDiscount] = useState('');
  const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES.full);
  const [paymentRows, setPaymentRows] = useState([{ method: 'cash', amount: '' }]);
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completedSale, setCompletedSale] = useState(null);
  const submittingRef = useRef(false);

  const products = useAsync(
    () => posService.products({ search, limit: 200 }),
    [search]
  );

  const posSettings = useAsync(() => posService.settings(), []);

  useEffect(() => {
    const timer = setTimeout(() => setCustomerSearch(customerInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [customerInput]);

  const customers = useAsync(
    () =>
      customerSearch
        ? posService.customers({ search: customerSearch, limit: 10 })
        : Promise.resolve([]),
    [customerSearch]
  );

  const showCustomerDropdown = customerOpen && customerSearch !== '' && !selectedCustomerId;

  // Fixed-position dropdown so it escapes the checkout pane's overflow-y
  // clipping. Reposition on open; close on outside click, Escape, resize,
  // or any scroll of the checkout pane / window.
  useEffect(() => {
    if (!showCustomerDropdown) {
      setCustomerDropdownStyle(null);
      return undefined;
    }
    const input = customerRef.current;
    if (!input) return undefined;
    const position = () => {
      const rect = input.getBoundingClientRect();
      setCustomerDropdownStyle({
        top: Math.round(rect.bottom + 4),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
      });
    };
    position();
    const close = () => {
      setCustomerOpen(false);
      setCustomerDropdownStyle(null);
    };
    const onDocMouseDown = (event) => {
      const section = customerSectionRef.current;
      if (section && !section.contains(event.target)) close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const pane = checkoutPaneRef.current;
    pane?.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      pane?.removeEventListener('scroll', close);
    };
  }, [showCustomerDropdown]);

  const customerItems = customers.data ?? [];
  const productItems = useMemo(() => products.data ?? [], [products.data]);

  // Track whether the horizontal product strip can scroll in either
  // direction so the prev/next controls can be enabled/disabled.
  useEffect(() => {
    const strip = productStripRef.current;
    if (!strip) return undefined;
    const update = () =>
      setStripCanScroll({
        left: strip.scrollLeft > 1,
        right: strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 1,
      });
    update();
    strip.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      strip.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [productItems]);

  // Keep the keyboard-highlighted product card in view while scrolling
  // through the strip with the arrow keys.
  useEffect(() => {
    if (highlightId == null) return;
    const strip = productStripRef.current;
    if (!strip) return;
    const card = strip.querySelector('.pos-product-card.is-selected');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [highlightId]);

  function scrollStrip(direction) {
    productStripRef.current?.scrollBy({ left: direction * 480, behavior: 'smooth' });
  }

  const settings = posSettings.data ?? {};
  const fallbackRate = Number(settings.tax_rate_percent) || 0;
  const shopState = settings.shop_state || null;
  const soundEnabled = settings.sound_enabled !== 'off';

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    if (selectedCustomerData && Number(selectedCustomerData.id) === Number(selectedCustomerId)) {
      return selectedCustomerData;
    }
    return customerItems.find((customer) => Number(customer.id) === Number(selectedCustomerId)) || null;
  }, [selectedCustomerId, selectedCustomerData, customerItems]);

  // Re-resolve line prices whenever the sale type changes.
  function repriceLines(lines, nextSaleType) {
    return lines.map((line) => ({
      ...line,
      unitPrice: resolveUnitPrice(line.product, nextSaleType),
    }));
  }

  function handleToggleSaleType(nextType) {
    if (saleType === nextType) return;
    setSaleType(nextType);
    setCart((prev) => repriceLines(prev, nextType));
  }

  const preview = useMemo(
    () =>
      estimateGst({
        cart,
        discount,
        customerState: selectedCustomer ? selectedCustomer.state : null,
        shopState,
        fallbackRate,
      }),
    [cart, discount, selectedCustomer, shopState, fallbackRate]
  );

  const discountValue = discount === '' ? 0 : Number(discount);
  const discountInvalid = discount !== '' && (!Number.isFinite(discountValue) || discountValue < 0);
  const discountTooHigh = Number.isFinite(discountValue) && discountValue > preview.subtotal;

  useEffect(() => {
    if (paymentTouched) return;
    if (paymentMode !== PAYMENT_MODES.full) return;
    if (paymentRows.length !== 1) return;
    setPaymentRows((rows) => [
      { ...rows[0], amount: preview.total > 0 ? String(preview.total) : '' },
    ]);
  }, [preview.total, paymentMode, paymentTouched, paymentRows.length]);

  const {
    paidTotal,
    owesMoney,
    credit: newCreditAmount,
    balanceDue,
    paymentOverTotal,
  } = useMemo(
    () => computePaymentTotals(paymentRows, preview.total),
    [paymentRows, preview.total]
  );

  const paymentInvalid = paymentRows.some(
    (payment) => payment.amount === '' || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0
  );
  const duplicatePaymentMethod = paymentRows.some(
    (payment, index) => paymentRows.findIndex((row) => row.method === payment.method) !== index
  );
  const creditRows = paymentRows.filter((payment) => payment.method === 'credit');
  const creditRequired = paymentMode === PAYMENT_MODES.partial || paymentMode === PAYMENT_MODES.credit || owesMoney;

  const selectedCustomerCreditLimit = selectedCustomer ? Number(selectedCustomer.creditLimit) || 0 : 0;
  const selectedCustomerOutstanding = selectedCustomer ? Number(selectedCustomer.currentBalance) || 0 : 0;
  const availableCreditAmount = round2(Math.max(0, selectedCustomerCreditLimit - selectedCustomerOutstanding - newCreditAmount));
  const creditOverLimit =
    selectedCustomerCreditLimit > 0 && selectedCustomerOutstanding + newCreditAmount > selectedCustomerCreditLimit;
  const creditLimitBlocked = creditRequired &&
    (selectedCustomerCreditLimit <= 0 || selectedCustomerOutstanding + newCreditAmount > selectedCustomerCreditLimit);
  const creditBlocked = creditRequired &&
    (!selectedCustomerId || !hasPermission('credit.create') || creditLimitBlocked);
  const creditRowAmount = round2(
    creditRows.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  );
  const creditRowMismatch = paymentMode === PAYMENT_MODES.split && creditRows.length > 0 &&
    creditRowAmount !== newCreditAmount;

  function handleSearchSubmit(event) {
    event.preventDefault();
    const value = searchInput.trim();
    if (!value) return;

    // Exact barcode / code match adds the product straight to the cart,
    // preserving the scanner workflow in the single search box.
    const exactMatch = productItems.find(
      (product) =>
        (product.barcode && String(product.barcode) === value) ||
        (product.productCode && String(product.productCode) === value)
    );
    if (exactMatch) {
      handleAddToCart(exactMatch);
      setSearchInput('');
      setSearch('');
      setHighlightId(null);
      searchRef.current?.focus();
      return;
    }

    setSearch(value);
    setHighlightId(null);
  }

  function handleClearSearch() {
    setSearchInput('');
    setSearch('');
    setHighlightId(null);
    searchRef.current?.focus();
  }

  const addLine = useCallback((product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                quantity: round3(Math.min(Number(line.quantity) + quantity, line.available)),
              }
            : line
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productCode: product.productCode,
          name: product.name,
          unit: product.unit,
          unitPrice: resolveUnitPrice({ ...product, sellingPrice: product.sellingPrice }, saleType),
          quantity: round3(quantity),
          available: product.currentStock,
          priceIncludesTax: product.priceIncludesTax,
          product,
        },
      ];
    });
  }, [saleType]);

  function handleAddToCart(product, quantity = 1) {
    if (Number(product.currentStock) <= 0) return;
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return;
    addLine(product, Number(quantity));
    showToast(`${product.name} added to cart.`, 'success');
    playPosSound('product', soundEnabled && settings.sound_product !== 'off');
    searchRef.current?.focus();
  }

  function handleQuantityChange(productId, rawValue) {
    if (rawValue === '') return;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) return;
    setCart((prev) =>
      prev.map((line) => (line.productId === productId ? { ...line, quantity: round3(value) } : line))
    );
  }

  function handleIncrement(productId) {
    setCart((prev) =>
      prev.map((line) =>
        line.productId === productId && Number(line.quantity) < line.available
          ? { ...line, quantity: round3(Number(line.quantity) + 1) }
          : line
      )
    );
  }

  function handleDecrement(productId) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: round3(Number(line.quantity) - 1) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  function handleRemove(productId) {
    setCart((prev) => prev.filter((line) => line.productId !== productId));
  }

  function handleCustomerInputChange(event) {
    setCustomerInput(event.target.value);
    setSelectedCustomerId('');
    setSelectedCustomerData(null);
    setCustomerOpen(true);
  }

  function handleSelectCustomer(customer) {
    setSelectedCustomerId(customer.id);
    setSelectedCustomerData(customer);
    setCustomerInput(`${customer.name}${customer.phone ? ` - ${customer.phone}` : ''}`);
    setCustomerOpen(false);
  }

  function handleClearCustomer() {
    setSelectedCustomerId('');
    setSelectedCustomerData(null);
    setCustomerInput('');
    setCustomerSearch('');
    setCustomerOpen(false);
    customerRef.current?.focus();
  }

  function handleCustomerCreated(created) {
    setIsNewCustomerModalOpen(false);
    const formatted = {
      id: Number(created.id),
      name: created.name,
      phone: created.phone || null,
      email: created.email || null,
      address: created.address || null,
      state: created.state || null,
      creditLimit: Number(created.credit_limit ?? created.creditLimit ?? 0),
      currentBalance: Number(created.current_balance ?? created.currentBalance ?? 0),
      status: created.status || 'active',
    };
    handleSelectCustomer(formatted);
    if (typeof customers.refetch === 'function') {
      customers.refetch();
    }
    showToast(`Customer "${formatted.name}" created and selected.`, 'success');
  }

  function handlePaymentChange(index, patch) {
    setPaymentTouched(true);
    setPaymentRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  }

  function handlePaymentModeChange(nextMode) {
    setPaymentMode(nextMode);
    setPaymentTouched(false);
    const currentMethod = paymentRows[0]?.method === 'credit' ? 'cash' : paymentRows[0]?.method || 'cash';
    setPaymentRows(defaultPaymentRows(nextMode, preview.total, currentMethod, PAYMENT_METHODS));
  }

  function handleAddPayment() {
    // Extra rows are a split-payment concept only - the normal
    // (full / partial) state must always stay at one row.
    if (paymentMode !== PAYMENT_MODES.split) return;
    setPaymentTouched(true);
    setPaymentRows((rows) => {
      if (rows.length >= PAYMENT_MAX) return rows;
      const availableMethod = [...PAYMENT_METHODS, 'credit'].find(
        (method) => !rows.some((row) => row.method === method)
      );
      if (!availableMethod) return rows;
      return [...rows, { method: availableMethod, amount: '' }];
    });
    showToast(t('pos.paymentAdded'), 'success');
  }

  function handleRemovePayment(index) {
    setPaymentTouched(true);
    setPaymentRows((rows) => {
      if (rows.length === 1) return [];
      return rows.filter((row, rowIndex) => rowIndex !== index);
    });
  }

  function validateSale() {
    if (cart.length === 0) return t('pos.selectItem');

    for (const line of cart) {
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        return t('pos.quantity');
      }
      if (Number(line.quantity) > line.available) {
        return t('pos.availableCount', { count: formatQuantity(line.available) });
      }
    }

    if (discountInvalid) return t('pos.discountInvalid');
    if (discountTooHigh) return t('pos.discountExceedsSubtotal');

    if (paymentMode === PAYMENT_MODES.full && paidTotal !== preview.total) {
      return t('pos.fullPaymentRequired');
    }
    if (paymentMode !== PAYMENT_MODES.credit && paymentRows.length > PAYMENT_MAX) return t('pos.payment');
    if (paymentInvalid) return t('pos.payment');
    if (duplicatePaymentMethod) return t('pos.duplicatePaymentMethod');
    if (paymentOverTotal) {
      return t('pos.paymentsCannotExceed', { total: formatMoney(preview.total) });
    }
    if (creditRowMismatch) return t('pos.creditPaymentMustMatchBalance');
    if (creditRequired && !selectedCustomerId) return t('pos.customerRequiredForCredit');
    if (creditRequired && !hasPermission('credit.create')) return t('pos.noCreditPermission');
    if (creditLimitBlocked) return t('pos.creditLimitExceeded');

    return null;
  }

  async function handleComplete() {
    if (submittingRef.current) return;
    const validationError = validateSale();
    if (validationError) {
      setSubmitError(validationError);
      showToast(validationError, 'error');
      playPosSound('error', soundEnabled && settings.sound_error !== 'off');
      return;
    }

    const payload = {
      saleType,
      ...(selectedCustomerId ? { customerId: Number(selectedCustomerId) } : {}),
      ...(discountValue > 0 ? { discount: discountValue } : {}),
      items: cart.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
      })),
      ...(paymentRows.length
        ? {
            payments: paymentRows
              .filter((payment) => payment.method !== 'credit')
              .map((payment) => ({ method: payment.method, amount: Number(payment.amount) })),
          }
        : {}),
      creditRequested: owesMoney,
    };

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const sale = await salesService.createSale(payload);
      setCompletedSale(sale);
      showToast(`Sale completed. Invoice ${sale.invoice_number} is ready.`, 'success');
      playPosSound('payment', soundEnabled && settings.sound_payment !== 'off');
      playPosSound('invoice', soundEnabled && settings.sound_invoice !== 'off');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'The sale could not be completed.');
      showToast(err instanceof Error ? err.message : 'The sale could not be completed.', 'error');
      playPosSound('error', soundEnabled && settings.sound_error !== 'off');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleNewSale() {
    setCompletedSale(null);
    setCart([]);
    setSelectedCustomerId('');
    setSelectedCustomerData(null);
    setIsNewCustomerModalOpen(false);
    setCustomerInput('');
    setCustomerSearch('');
    setCustomerOpen(false);
    setDiscount('');
    setPaymentMode(PAYMENT_MODES.full);
    setPaymentRows([{ method: 'cash', amount: '' }]);
    setPaymentTouched(false);
    setSubmitError('');
    setSubmitting(false);
    searchRef.current?.focus();
  }

  // Keyboard shortcuts - the POS is used keyboard-first.
  useEffect(() => {
    function onKeyDown(event) {
      if (submittingRef.current) return;
      const tag = document.activeElement?.tagName;

      // Typing in an input/select/textarea keeps default behavior.
      const typing =
        tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        customerRef.current?.focus();
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        discountRef.current?.focus();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        if (cart.length > 0) completeRef.current?.click();
        return;
      }
      if (event.key === 'Escape') {
        handleClearSearch();
        setCustomerOpen(false);
        setCustomerDropdownStyle(null);
        return;
      }
      if (typing && event.key !== 'Tab') return;

      if (event.key === 'Delete') {
        event.preventDefault();
        if (event.shiftKey) {
          setCart([]);
        } else if (cart.length > 0) {
          handleRemove(cart[cart.length - 1].productId);
        }
        return;
      }

      // Arrow-key navigation + Enter within the horizontal product strip
      // operates only when the operator is not editing a value.
      const grid = productItems;
      if (grid.length > 0) {
        const index = grid.findIndex((product) => Number(product.id) === Number(highlightId));
        const current = index === -1 ? 0 : index;

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          const next = grid[(current + 1) % grid.length];
          if (next) setHighlightId(next.id);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          const prev = grid[(current - 1 + grid.length) % grid.length];
          if (prev) setHighlightId(prev.id);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const target = grid[current];
          if (target) handleAddToCart(target);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [productItems, highlightId, cart.length, paymentRows.length]);

  // After a successful sale, bring the POS container back to the top so the
  // success/invoice summary is immediately visible without the operator having
  // to manually scroll back from the checkout area.
  useEffect(() => {
    if (!completedSale) return;
    const scrollToTop = () => {
      if (posPageRef.current) {
        posPageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    requestAnimationFrame(scrollToTop);
  }, [completedSale]);

  if (completedSale) {
    return (
      <div className="pos-page" ref={posPageRef}>
        <SuccessSale sale={completedSale} onReset={handleNewSale} />
      </div>
    );
  }

  const canSubmit = cart.length > 0 && !submitting && !creditBlocked;

  return (
    <div className="pos-page" ref={posPageRef}>
      <div className="pos-grid">
        <section className="pos-panel pos-products-pane" aria-label="Product selection">
          <div className="pos-panel-head">
            <h2 className="card-title">{t('pos.products')}</h2>
            <span className="card-caption">{t('pos.availableCount', { count: productItems.length })}</span>
          </div>

          <div className="pos-scan-row">
            <form className="pos-search" onSubmit={handleSearchSubmit} role="search">
              <input
                ref={searchRef}
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('pos.searchProducts')}
                aria-label={t('pos.searchProducts')}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-outline">
                {t('pos.search')}
              </button>
              {search ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearSearch}>
                  ✕
                </button>
              ) : null}
            </form>
            <div
              className={`sale-type-toggle ${saleType === 'retail' ? 'retail-active' : 'wholesale-active'}`}
              role="group"
              aria-label={t('pos.saleTypeLabel')}
            >
              <button
                type="button"
                className={saleType === 'retail' ? 'is-active' : ''}
                onClick={() => handleToggleSaleType('retail')}
              >
                {t('pos.retail')}
              </button>
              <button
                type="button"
                className={saleType === 'wholesale' ? 'is-active' : ''}
                onClick={() => handleToggleSaleType('wholesale')}
              >
                {t('pos.wholesale')}
              </button>
            </div>
          </div>

          <div className="pos-products-scroll">
            {products.error && !products.data ? (
              <ErrorState
                title={t('pos.products')}
                message={products.error.message}
                status={products.error.status}
                onRetry={() => products.refetch()}
              />
            ) : null}

            {products.loading && !products.data ? (
              <div className="page-loader inline">
                <Spinner size={28} label={t('common.loading')} />
                <p className="page-loader-label">{t('common.loading')}</p>
              </div>
            ) : null}

            {products.data && productItems.length === 0 ? (
              <EmptyState
                title={search ? t('pos.searchProducts') : t('pos.products')}
                description={search ? t('common.noResults') : t('pos.noItemsInCart')}
              />
            ) : null}

            {products.data && productItems.length > 0 ? (
              <>
                <div className="pos-strip-wrap">
                  <button
                    type="button"
                    className="pos-strip-btn"
                    onClick={() => scrollStrip(-1)}
                    disabled={!stripCanScroll.left}
                    aria-label={t('pos.prev')}
                    title={t('pos.prev')}
                  >
                    <FiChevronLeft />
                  </button>
                  <div className="pos-product-strip" ref={productStripRef}>
                    {productItems.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        saleType={saleType}
                        selected={Number(highlightId) === Number(product.id)}
                        onSelect={(id) => setHighlightId(id)}
                        onAdd={handleAddToCart}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="pos-strip-btn"
                    onClick={() => scrollStrip(1)}
                    disabled={!stripCanScroll.right}
                    aria-label={t('pos.next')}
                    title={t('pos.next')}
                  >
                    <FiChevronRight />
                  </button>
                </div>
                {products.loading ? <p className="pos-refreshing">{t('common.searching')}</p> : null}
              </>
            ) : null}
          </div>
        </section>

        <section className="pos-panel pos-checkout-pane" aria-label="Sale checkout" ref={checkoutPaneRef}>
          <div className="pos-panel-head">
            <h2 className="card-title">{t('pos.newSale')}</h2>
            <span className="card-caption">
              {preview.intra ? t('pos.intraState') : t('pos.interState')}
            </span>
          </div>

          <div className="pos-checkout-scroll">
            <div className="pos-checkout-top">
              <div className="pos-section" ref={customerSectionRef}>
                <div className="pos-section-head">
                  <h3 className="card-title">{t('pos.customer')}</h3>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleClearCustomer}
                    disabled={!selectedCustomerId}
                  >
                    {t('pos.walkIn')}
                  </button>
                </div>

                {selectedCustomer ? (
                  <>
                    <div className="pos-selected-customer">
                      <div className="pos-selected-customer-info">
                        <span className="cell-main">
                          {selectedCustomer.name}{' '}
                          <span className="pos-selected-badge">✓ {t('pos.selected')}</span>
                        </span>
                        <span className="cell-sub">
                          {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm" onClick={handleClearCustomer}>
                        {t('pos.change')}
                      </button>
                    </div>
                    <p className="pos-muted">
                      {t('pos.customerState')}: {selectedCustomer.state || '—'}
                    </p>
                  </>
                ) : (
                  <div className="form-field">
                    <label htmlFor="pos-customer-search">{t('pos.searchCustomer')}</label>
                    <div className="pos-customer-input-group">
                      <input
                        ref={customerRef}
                        id="pos-customer-search"
                        type="search"
                        value={customerInput}
                        onChange={handleCustomerInputChange}
                        placeholder={t('pos.searchCustomerPlaceholder')}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm pos-new-customer-btn"
                        onClick={() => setIsNewCustomerModalOpen(true)}
                      >
                        + New Customer
                      </button>
                    </div>
                  </div>
                )}

                {!selectedCustomer && customerDropdownStyle ? (
                  <div
                    className="pos-customer-dropdown"
                    style={customerDropdownStyle}
                    role="listbox"
                    aria-label={t('pos.searchCustomer')}
                  >
                    {customers.loading ? (
                      <div className="pos-customer-dropdown-status">{t('common.searching')}</div>
                    ) : customers.error ? (
                      <div className="pos-customer-dropdown-status">{customers.error.message}</div>
                    ) : customerItems.length === 0 ? (
                      <div className="pos-customer-dropdown-status">{t('pos.noCustomersFound')}</div>
                    ) : (
                      customerItems.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          role="option"
                          className="pos-customer-option"
                          onClick={() => handleSelectCustomer(customer)}
                        >
                          <span className="cell-main">{customer.name}</span>
                          <span className="cell-sub">
                            {[customer.phone, customer.email].filter(Boolean).join(' · ') || ''}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              {selectedCustomer ? (
                <div className={`pos-credit-card${creditOverLimit ? ' is-over' : ''}`}>
                  <div className="pos-section-head">
                    <h3 className="card-title">{t('pos.credit')}</h3>
                  </div>
                  <div className="pos-credit-grid">
                    <div className="pos-credit-item">
                      <span className="pos-credit-label">{t('pos.creditLimit')}</span>
                      <span className="pos-credit-value">
                        <Money value={selectedCustomerCreditLimit} />
                      </span>
                    </div>
                    <div className="pos-credit-item">
                      <span className="pos-credit-label">{t('pos.currentOutstanding')}</span>
                      <span className="pos-credit-value">
                        <Money value={selectedCustomerOutstanding} />
                      </span>
                    </div>
                    <div className="pos-credit-item">
                      <span className="pos-credit-label">{t('pos.newCredit')}</span>
                      <span className="pos-credit-value">
                        <Money value={newCreditAmount} />
                      </span>
                    </div>
                    <div className="pos-credit-item">
                      <span className="pos-credit-label">{t('pos.availableCredit')}</span>
                      <span className={`pos-credit-value${creditOverLimit ? ' tone-danger' : ''}`}>
                        <Money value={availableCreditAmount} />
                      </span>
                    </div>
                  </div>
                  {selectedCustomerCreditLimit === 0 ? (
                    <p className="pos-muted-warn">{t('pos.noCreditAllowed')}</p>
                  ) : creditOverLimit ? (
                    <p className="pos-muted-warn">{t('pos.creditLimitExceeded')}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="pos-section pos-cart-section">
              <div className="pos-section-head">
                <h3 className="card-title">{t('pos.cart')}</h3>
                <span className="card-caption">{t('pos.lines', { count: cart.length })}</span>
              </div>

              {cart.length === 0 ? (
                <div className="inline-empty">{t('pos.noItemsInCart')}</div>
              ) : (
                <div className="pos-cart">
                  {cart.map((line) => (
                    <CartLine
                      key={line.productId}
                      line={line}
                      onChange={handleQuantityChange}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              )}

              {selectedCustomer || owesMoney ? null : (
                <p className="pos-muted" style={{ margin: 0, fontSize: 12 }}>{t('pos.walkInSalesNeedNoCustomer')}</p>
              )}
            </div>

            <div className="pos-checkout-footer">
              <div className="pos-section">
                <div className="pos-section-head">
                  <h3 className="card-title">{t('pos.totalsDiscount')}</h3>
                </div>
                <div className="summary-grid pos-totals">
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.subtotal')}</span>
                    <span className="summary-value">
                      <Money value={preview.subtotal} />
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.estimatedTotal')}</span>
                    <span className="summary-value tone-success">
                      <Money value={preview.total} />
                    </span>
                  </div>
                </div>

                <div className="form-field pos-discount">
                  <label htmlFor="pos-discount">{t('pos.discount')}</label>
                  <input
                    ref={discountRef}
                    id="pos-discount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    placeholder="0.00"
                  />
                  {discountInvalid ? <span className="field-error">{t('pos.discountInvalid')}</span> : null}
                  {discountTooHigh ? <span className="field-error">{t('pos.discountExceedsSubtotal')}</span> : null}
                </div>

                {preview.taxAmount > 0 ? (
                  <div className="pos-gst-preview">
                    <div className="pos-gst-head">
                      <span>{t('pos.taxPreview')}</span>
                      <Money value={preview.taxAmount} />
                    </div>
                    {preview.intra ? (
                      <div className="pos-gst-parts">
                        <span>
                          {t('invoice.cgst')} <Money value={preview.cgst} />
                        </span>
                        <span>
                          {t('invoice.sgst')} <Money value={preview.sgst} />
                        </span>
                      </div>
                    ) : (
                      <div className="pos-gst-parts">
                        <span>
                          {t('invoice.igst')} <Money value={preview.igst} />
                        </span>
                      </div>
                    )}
                    <p className="pos-note">{t('pos.taxIncludedPreview')}</p>
                  </div>
                ) : null}
              </div>

              <div className="pos-section">
                <div className="pos-section-head">
                  <h3 className="card-title">{t('pos.payment')}</h3>
                  {paymentMode === PAYMENT_MODES.split ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleAddPayment}
                      disabled={paymentRows.length >= PAYMENT_MAX}
                    >
                      {t('pos.addPayment')}
                    </button>
                  ) : null}
                </div>

                <div className="pos-payment-modes" role="group" aria-label={t('pos.paymentMode')}>
                  <span className="pos-payment-mode-label">{t('pos.paymentMode')}</span>
                  <div className="pos-payment-mode-options">
                    {[
                      [PAYMENT_MODES.full, 'fullPayment'],
                      [PAYMENT_MODES.partial, 'partialCredit'],
                      [PAYMENT_MODES.credit, 'fullCredit'],
                      [PAYMENT_MODES.split, 'splitPayment'],
                    ].map(([mode, labelKey]) => (
                      <button
                        key={mode}
                        type="button"
                        className={`pos-payment-mode${paymentMode === mode ? ' is-selected' : ''}`}
                        onClick={() => handlePaymentModeChange(mode)}
                        aria-pressed={paymentMode === mode}
                      >
                        {t(`pos.${labelKey}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentRows.length === 0 ? (
                  <p className="pos-muted">{t('pos.noPaymentRecordedCredit')}</p>
                ) : (
                  <div className="pos-payments">
                    {paymentRows.map((payment, index) => (
                      <PaymentRow
                        key={index}
                        payment={payment}
                        index={index}
                        onChange={handlePaymentChange}
                        onRemove={handleRemovePayment}
                        canRemove={paymentRows.length > 1}
                        usedMethods={paymentRows.map((row) => row.method)}
                      />
                    ))}
                  </div>
                )}

                <div className="summary-grid pos-totals">
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.amountPaid')}</span>
                    <span className="summary-value">
                      <Money value={paidTotal} />
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.credit')}</span>
                    <span className="summary-value">
                      <Money value={newCreditAmount} />
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.balanceDue')}</span>
                    <span className={`summary-value${paymentOverTotal ? ' tone-danger' : ''}`}>
                      <Money value={balanceDue} />
                    </span>
                  </div>
                </div>

                {paymentOverTotal ? (
                  <p className="field-error">{t('pos.paymentsCannotExceed', { total: formatMoney(preview.total) })}</p>
                ) : null}
                {creditRowMismatch ? (
                  <p className="field-error">{t('pos.creditPaymentMustMatchBalance')}</p>
                ) : null}
                {paymentRows.length > 0 && !paymentOverTotal && owesMoney ? (
                  <p className="pos-muted-warn">{t('pos.partialSaleNotice', { type: paidTotal === 0 ? t('pos.credit') : t('pos.partial') })}</p>
                ) : null}
                {creditRequired && !selectedCustomerId ? (
                  <p className="field-error">{t('pos.customerRequiredForCredit')}</p>
                ) : creditRequired && !hasPermission('credit.create') ? (
                  <p className="field-error">{t('pos.noCreditPermission')}</p>
                ) : creditLimitBlocked ? (
                  <p className="field-error">{t('pos.creditLimitExceeded')}</p>
                ) : null}
              </div>

              {submitError ? (
                <div className="form-alert pos-submit-error" role="alert">
                  {submitError}
                </div>
              ) : null}

              <div className="pos-type-row">
                <div className={`sale-type-badge ${saleType}`}>
                  {t('pos.saleTypeLabel')}: {saleType === 'retail' ? t('pos.retail') : t('pos.wholesale')}
                </div>
              </div>

              <button
                ref={completeRef}
                type="button"
                className="btn btn-primary btn-block pos-complete"
                onClick={handleComplete}
                disabled={!canSubmit}
                aria-busy={submitting}
              >
                {submitting ? t('pos.completingSale') : t('pos.completeSale')} (F8)
              </button>
            </div>
          </div>
        </section>
      </div>

      {isNewCustomerModalOpen ? (
        <NewCustomerModal
          onClose={() => setIsNewCustomerModalOpen(false)}
          onSuccess={handleCustomerCreated}
        />
      ) : null}
    </div>
  );
}