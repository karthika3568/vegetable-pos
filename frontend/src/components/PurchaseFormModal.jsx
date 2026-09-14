import { useState, useRef, useEffect } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { supplierService } from '../services/supplier.service.js';
import { productService } from '../services/product.service.js';
import { purchaseService } from '../services/purchase.service.js';
import Modal from './Modal.jsx';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export default function PurchaseFormModal({ onClose, onCreated }) {
  const { showToast } = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState('cash');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: '', purchasePrice: '', unit: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFileName, setImageFileName] = useState('');

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const suppliers = useAsync(() => supplierService.list({ status: 'active', page: 1, limit: 100 }), []);
  const products = useAsync(() => productService.list({ status: 'active', page: 1, limit: 100 }), []);
  const supplierItems = suppliers.data?.items ?? [];
  const productItems = products.data?.items ?? [];

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function clearFileInputValue(inputRef) {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function openImagePicker(type) {
    const target = type === 'camera' ? cameraInputRef : fileInputRef;
    if (target.current) {
      target.current.click();
    }
  }

  function handleFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    clearFileInputValue(cameraInputRef);
    clearFileInputValue(fileInputRef);
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast('Unsupported file type. Only JPEG, PNG, and WebP are allowed.', 'error');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Image file too large. Maximum size is 2 MB.', 'error');
      return;
    }

    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageFileName(file.name);
    showToast('Invoice image selected.', 'info');
  }

  function handleRemoveImage() {
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    clearFileInputValue(cameraInputRef);
    clearFileInputValue(fileInputRef);
    setImageFile(null);
    setImagePreview(null);
    setImageFileName('');
    showToast('Invoice image removed.', 'info');
  }

  function updateItem(index, patch) {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  function handleProductChange(index, value) {
    const product = productItems.find((item) => String(item.id) === String(value));
    updateItem(index, {
      productId: value,
      purchasePrice: product ? String(product.purchasePrice) : '',
      unit: product?.unit || '',
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const validItems = items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      purchasePrice: Number(item.purchasePrice),
    }));

    if (!supplierId || !invoiceNumber.trim() || !purchaseDate) {
      setError('Supplier, invoice number and purchase date are required.');
      return;
    }
    if (validItems.some((item) => (
      !Number.isInteger(item.productId) || item.productId < 1 ||
      !Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.purchasePrice) || item.purchasePrice < 0
    ))) {
      setError('Each item needs a product, positive quantity and valid purchase price.');
      return;
    }

    setSubmitting(true);
    try {
      let purchase;
      if (imageFile) {
        const formData = new FormData();
        formData.append('supplierId', String(supplierId));
        formData.append('invoiceNumber', invoiceNumber.trim());
        formData.append('purchaseDate', purchaseDate);
        formData.append('paymentType', paymentType);
        if (notes.trim()) formData.append('notes', notes.trim());
        formData.append('items', JSON.stringify(validItems));
        formData.append('invoiceImage', imageFile);

        purchase = await purchaseService.create(formData);
      } else {
        purchase = await purchaseService.create({
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim(),
          purchaseDate,
          paymentType,
          notes: notes.trim() || null,
          items: validItems,
        });
      }
      onCreated(purchase);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the purchase.';
      setError(msg);
      showToast(msg, 'error');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add New Purchase" onClose={onClose} wide>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="purchaseSupplier">Supplier</label>
            <select
              id="purchaseSupplier"
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
            <label htmlFor="purchaseInvoice">Invoice Number</label>
            <input
              id="purchaseInvoice"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              maxLength={50}
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label htmlFor="purchaseDate">Purchase Date</label>
            <input
              id="purchaseDate"
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label htmlFor="purchaseNotes">Notes</label>
            <input
              id="purchaseNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={255}
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label htmlFor="purchasePaymentType">Payment type</label>
            <select
              id="purchasePaymentType"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              disabled={submitting}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          <div className="form-field form-field-full supplier-invoice-section">
            <label className="section-label">Supplier Invoice</label>
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="sr-only-file-input"
              onChange={handleFileSelect}
              disabled={submitting}
              aria-label="Take photo of supplier invoice"
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="sr-only-file-input"
              onChange={handleFileSelect}
              disabled={submitting}
              aria-label="Upload supplier invoice photo"
            />

            {imagePreview ? (
              <div className="invoice-preview-container">
                <div className="invoice-preview-box">
                  <img src={imagePreview} alt="Invoice preview" className="invoice-preview-img" />
                </div>
                <div className="invoice-preview-meta">
                  {imageFileName ? <span className="invoice-filename">{imageFileName}</span> : null}
                  <div className="invoice-preview-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => openImagePicker('camera')}
                      disabled={submitting}
                    >
                      Change Photo
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-danger-text"
                      onClick={handleRemoveImage}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="invoice-upload-buttons">
                <button
                  type="button"
                  className="btn btn-outline invoice-btn"
                  onClick={() => openImagePicker('camera')}
                  disabled={submitting}
                >
                  📷 Take Photo
                </button>
                <button
                  type="button"
                  className="btn btn-outline invoice-btn"
                  onClick={() => openImagePicker('upload')}
                  disabled={submitting}
                >
                  📁 Upload Photo
                </button>
                <span className="field-hint">JPG, PNG, or WebP up to 2 MB</span>
              </div>
            )}
          </div>
        </div>

        <div className="purchase-form-items">
          <div className="pos-section-head">
            <h3 className="card-title">Purchase Items</h3>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setItems((current) => [...current, { productId: '', quantity: '', purchasePrice: '', unit: '' }])}
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
                aria-label={`Quantity ${index + 1}`}
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Quantity"
                value={item.quantity}
                onChange={(event) => updateItem(index, { quantity: event.target.value })}
                disabled={submitting}
              />
              <input
                aria-label={`Unit ${index + 1}`}
                value={item.unit || '—'}
                readOnly
                placeholder="Unit"
              />
              <input
                aria-label={`Purchase price ${index + 1}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={item.purchasePrice}
                onChange={(event) => updateItem(index, { purchasePrice: event.target.value })}
                disabled={submitting}
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
            {submitting ? 'Saving…' : 'Create Purchase'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
