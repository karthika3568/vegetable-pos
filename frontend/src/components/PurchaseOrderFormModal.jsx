import { useState, useMemo } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { supplierService } from '../services/supplier.service.js';
import { productService } from '../services/product.service.js';
import { purchaseOrderService } from '../services/purchase-order.service.js';
import Modal from './Modal.jsx';

const toDateInput = (value) => String(value || '').slice(0, 10);

export default function PurchaseOrderFormModal({ initial = null, onClose, onSaved }) {
  const { showToast } = useToast();
  const isEdit = Boolean(initial);

  const [supplierId, setSupplierId] = useState(initial ? String(initial.supplier_id) : '');
  const [orderDate, setOrderDate] = useState(() => toDateInput(initial?.order_date) || new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(() => toDateInput(initial?.expected_delivery_date));
  const [notes, setNotes] = useState(initial?.notes || '');
  const [items, setItems] = useState(() => {
    if (initial) {
      return initial.items.map((item) => ({
        productId: String(item.product_id),
        orderedQuantity: String(item.ordered_quantity),
        unit: item.unit || '',
      }));
    }
    return [{ productId: '', orderedQuantity: '', unit: '' }];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const suppliers = useAsync(() => supplierService.list({ status: 'active', page: 1, limit: 100 }), []);
  const products = useAsync(() => productService.list({ status: 'active', page: 1, limit: 100 }), []);
  const supplierItems = useMemo(() => {
    const items = [...(suppliers.data?.items ?? [])];
    if (isEdit && initial && !items.some((supplier) => String(supplier.id) === String(initial.supplier_id))) {
      items.push({
        id: initial.supplier_id,
        name: initial.supplier_name || `Supplier #${initial.supplier_id}`,
      });
    }
    return items;
  }, [suppliers.data, isEdit, initial]);
  const productItems = products.data?.items ?? [];

  function updateItem(index, patch) {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  function handleProductChange(index, value) {
    const product = productItems.find((item) => String(item.id) === String(value));
    updateItem(index, {
      productId: value,
      unit: product?.unit || '',
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const validItems = items.map((item) => ({
      productId: Number(item.productId),
      orderedQuantity: Number(item.orderedQuantity),
    }));

    if (!supplierId || !orderDate) {
      setError('Supplier and order date are required.');
      return;
    }
    if (validItems.some((item) => (
      !Number.isInteger(item.productId) || item.productId < 1 ||
      !Number.isFinite(item.orderedQuantity) || item.orderedQuantity <= 0
    ))) {
      setError('Each item needs a product and a positive quantity.');
      return;
    }

    const duplicateProduct = validItems.some(
      (item, index) => validItems.findIndex(
        (other, otherIndex) => other.productId === item.productId && otherIndex !== index
      ) !== -1
    );
    if (duplicateProduct) {
      setError('Each product can appear only once in a purchase order.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplierId: Number(supplierId),
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes.trim() || null,
        items: validItems,
      };
      const saved = isEdit
        ? await purchaseOrderService.update(initial.id, payload)
        : await purchaseOrderService.create(payload);
      onSaved(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save the purchase order.';
      setError(msg);
      showToast(msg, 'error');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Purchase Order' : 'New Purchase Order'} onClose={onClose} wide>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="poSupplier">Supplier</label>
            <select
              id="poSupplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              disabled={submitting || suppliers.loading}
            >
              <option value="">Select supplier</option>
              {supplierItems.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="poOrderDate">Order Date</label>
            <input
              id="poOrderDate"
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label htmlFor="poExpectedDate">Expected Delivery</label>
            <input
              id="poExpectedDate"
              type="date"
              value={expectedDeliveryDate}
              onChange={(event) => setExpectedDeliveryDate(event.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label htmlFor="poNotes">Notes</label>
            <input
              id="poNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={255}
              disabled={submitting}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="purchase-form-items">
          <div className="pos-section-head">
            <h3 className="card-title">Order Items</h3>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setItems((current) => [...current, { productId: '', orderedQuantity: '', unit: '' }])}
              disabled={submitting}
            >
              Add Item
            </button>
          </div>
          {items.map((item, index) => (
            <div className="purchase-form-item" key={index}>
              <select
                aria-label={`Product ${index + 1}`}
                value={item.productId}
                onChange={(event) => handleProductChange(index, event.target.value)}
                disabled={submitting || products.loading}
              >
                <option value="">Select product</option>
                {productItems.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.productCode})</option>
                ))}
              </select>
              <input
                aria-label={`Ordered quantity ${index + 1}`}
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Qty"
                value={item.orderedQuantity}
                onChange={(event) => updateItem(index, { orderedQuantity: event.target.value })}
                disabled={submitting}
              />
              <input
                aria-label={`Unit ${index + 1}`}
                value={item.unit || '—'}
                readOnly
                placeholder="Unit"
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))}
                disabled={submitting || items.length === 1}
                aria-label={`Remove item ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {suppliers.error || products.error ? <div className="form-alert" role="alert">Could not load suppliers or products.</div> : null}
        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || suppliers.loading || products.loading}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Purchase Order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}