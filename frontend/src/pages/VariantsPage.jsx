import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { variantService, VARIANT_STATUS_OPTIONS } from '../services/variant.service.js';
import { productService } from '../services/product.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import { formatMoney, formatDateOnly } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;
const PRODUCT_LIMIT = 100;

const ATTRIBUTE_OPTIONS = [
  ['quality', 'Quality', ['Premium', 'Standard', 'Grade A', 'Grade B']],
  ['size', 'Size', ['Small', 'Medium', 'Large']],
  ['variety', 'Variety', ['Local', 'Hybrid', 'Country', 'Other']],
  ['origin', 'Origin', ['Local', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Other']],
  ['organic', 'Organic / Normal', ['Organic', 'Normal']],
  ['color', 'Color', ['Red', 'Green', 'Yellow', 'White', 'Purple']],
  ['processing', 'Processing', ['Fresh', 'Cleaned', 'Peeled', 'Cut', 'Packed']],
];

function StatusBadge({ status }) {
  const tone = status === 'active' ? 'active' : 'inactive';
  const label = status === 'active' ? 'Active' : 'Inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function VariantFormModal({ product, initial, onClose, onSubmit }) {
  const editing = Boolean(initial);

  const [name, setName] = useState(initial ? (initial.variant_name ?? '') : '');
  const [purchasePrice, setPurchasePrice] = useState(initial ? String(initial.purchase_price ?? '') : '');
  const [sellingPrice, setSellingPrice] = useState(initial ? String(initial.selling_price ?? '') : '');
  const [attributes, setAttributes] = useState(initial?.attributes ?? {});
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
    if (trimmedName.length > 100) {
      setError('Name must be at most 100 characters.');
      return;
    }

    const purchase = Number(purchasePrice);
    if (!Number.isFinite(purchase) || purchase < 0) {
      setError('Purchase price must be a non-negative number.');
      return;
    }

    const selling = Number(sellingPrice);
    if (!Number.isFinite(selling) || selling < 0) {
      setError('Selling price must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        purchasePrice: purchase,
        sellingPrice: selling,
        attributes,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The request could not be completed. Check that the variant name is not already in use for this product.'
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Variant' : 'New Variant'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <div className="pick-box">
            <div className="pick-box-main">{product?.name || 'Unknown product'}</div>
            {product?.product_code ? <div className="pick-box-sub">{product.product_code}</div> : null}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="variantName">Variant Name</label>
          <input
            id="variantName"
            name="name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Local / Hybrid"
            disabled={submitting}
          />
          <p className="field-hint">
            Required. Up to 100 characters. Names must be unique within this product.
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="variantPurchasePrice">Purchase Price</label>
          <input
            id="variantPurchasePrice"
            name="purchasePrice"
            type="number"
            min="0"
            step="0.01"
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            placeholder="0.00"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="variantSellingPrice">Selling Price</label>
          <input
            id="variantSellingPrice"
            name="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            placeholder="0.00"
            disabled={submitting}
          />
        </div>

        <fieldset className="attribute-fieldset">
          <legend>Product Attributes</legend>
          <div className="attribute-grid">
            {ATTRIBUTE_OPTIONS.map(([key, label, options]) => (
              <div className="attribute-group" key={key}>
                <label className="attribute-check">
                  <input
                    type="checkbox"
                    checked={Object.prototype.hasOwnProperty.call(attributes, key)}
                    onChange={(event) => {
                      setAttributes((current) => {
                        if (event.target.checked) return { ...current, [key]: options[0] };
                        const next = { ...current };
                        delete next[key];
                        return next;
                      });
                    }}
                    disabled={submitting}
                  />
                  <span>{label}</span>
                </label>
                {Object.prototype.hasOwnProperty.call(attributes, key) ? (
                  <select
                    value={attributes[key]}
                    onChange={(event) => setAttributes((current) => ({ ...current, [key]: event.target.value }))}
                    disabled={submitting}
                    aria-label={`${label} value`}
                  >
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : null}
              </div>
            ))}
          </div>
        </fieldset>

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
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Variant'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function VariantsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState('');

  const [formState, setFormState] = useState(null);

  const { showToast } = useToast();

  const products = useAsync(
    () => productService.list({ page: 1, limit: PRODUCT_LIMIT }),
    []
  );

  const productOptions = products.data?.items ?? [];
  const selectedProduct = productOptions.find((option) => String(option.id) === String(selectedProductId)) || null;

  const list = useAsync(
    () =>
      selectedProductId
        ? variantService.list(selectedProductId, {
            search: search || undefined,
            status: status || undefined,
            page,
            limit: LIMIT,
          })
        : Promise.resolve(null),
    [selectedProductId, search, status, page]
  );

  function showNotice(message) {
    showToast(message, 'success');
  }

  function handleProductChange(event) {
    setSelectedProductId(event.target.value);
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleReset() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  }

  function handleStatusFilter(event) {
    setStatus(event.target.value);
    setPage(1);
  }

  const closeForm = useCallback(() => setFormState(null), []);

  async function handleCreateSubmit(payload) {
    await variantService.create(selectedProductId, payload);
    setFormState(null);
    showNotice('Variant created successfully.');
    list.refetch();
  }

  async function handleUpdateSubmit(payload) {
    await variantService.update(selectedProductId, formState.record.id, payload);
    setFormState(null);
    showNotice('Variant updated successfully.');
    list.refetch();
  }

  async function handleToggleStatus(record) {
    const next = record.status === 'active' ? 'inactive' : 'active';
    try {
      await variantService.setStatus(selectedProductId, record.id, next);
      showNotice(`Variant "${record.variant_name}" ${next === 'active' ? 'activated' : 'deactivated'}.`);
      list.refetch();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not change the variant status.');
    }
  }

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const hasFilters = Boolean(search || status);
  const noProducts = !products.loading && !products.error && productOptions.length === 0;

  return (
    <div className="variants-page">
      <div className="page-heading">
        <h1 className="page-title">Product Variants</h1>
        <p className="page-intro">
          Optional subtypes of a product (e.g. Tomato → Local / Hybrid). Variants belong to exactly one product — pick a
          product to manage its variants. The backend enforces unique names within each product.
        </p>
      </div>

      <div className="toolbar">
        <div className="toolbar-actions" style={{ flex: '1 1 280px' }}>
          <label className="toolbar-select" style={{ flex: 1 }}>
            <span className="sr-only">Product</span>
            <select value={selectedProductId} onChange={handleProductChange} disabled={products.loading}>
              <option value="">Select a product…</option>
              {productOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.product_code ? ` (${option.product_code})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">Status filter</span>
            <select value={status} onChange={handleStatusFilter} disabled={!selectedProductId}>
              {VARIANT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFormState({ mode: 'create' })}
            disabled={!selectedProductId}
          >
            New Variant
          </button>
        </div>
      </div>

      <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search" style={{ marginBottom: 16 }}>
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search variant name…"
          aria-label="Search variants"
          disabled={!selectedProductId}
        />
        <button type="submit" className="btn btn-primary" disabled={!selectedProductId}>
          Search
        </button>
        <button type="button" className="btn btn-outline" onClick={handleReset} disabled={!selectedProductId}>
          Reset
        </button>
      </form>

      {products.loading && !products.data ? <PageLoader label="Loading products…" /> : null}

      {products.error && !products.data ? (
        <ErrorState
          title="Products unavailable"
          message={products.error.message}
          status={products.error.status}
          onRetry={() => products.refetch()}
        />
      ) : null}

      {noProducts ? (
        <EmptyState
          title="No products have been created"
          description="Variants reference a parent product. Add products in the Products page, then come back to add their variants."
        />
      ) : null}

      {!noProducts && products.data && !selectedProductId ? (
        <EmptyState
          title="Select a product"
          description="Pick a product above to view, create or edit its variants."
        />
      ) : null}

      {selectedProductId ? (
        <>
          {list.loading && !list.data ? <PageLoader label="Loading variants…" /> : null}

          {list.error && !list.data ? (
            <ErrorState
              title="Variants unavailable"
              message={list.error.message}
              status={list.error.status}
              onRetry={() => list.refetch()}
            />
          ) : null}

          {list.data && items.length === 0 ? (
            <EmptyState
              title={hasFilters ? 'No variants match your filters' : `No variants for ${selectedProduct?.name || 'this product'}`}
              description={
                hasFilters
                  ? 'Try changing the search text or the status filter.'
                  : 'Create the product’s first variant using the "New Variant" button.'
              }
            />
          ) : null}

          {list.data && items.length > 0 ? (
            <div className="table-card">
              <div className="table-tools">
                <p className="table-count">
                  {pagination?.total ?? 0} variant{pagination?.total === 1 ? '' : 's'} for {selectedProduct?.name || 'this product'}
                </p>
                {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
              </div>

              <div className="table-scroll">
                <table className="data-table variants-table">
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th className="num">Purchase Price</th>
                      <th className="num">Selling Price</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <span className="cell-main">{record.variant_name}</span>
                          {record.attributes && Object.keys(record.attributes).length > 0 ? (
                            <span className="cell-sub">{Object.values(record.attributes).join(' · ')}</span>
                          ) : null}
                        </td>
                        <td className="num">{formatMoney(record.purchase_price)}</td>
                        <td className="num">{formatMoney(record.selling_price)}</td>
                        <td>
                          <StatusBadge status={record.status} />
                        </td>
                        <td>{formatDateOnly(record.created_at)}</td>
                        <td className="actions-col">
                          <div className="table-actions">
                            <ActionButton action="edit" onClick={() => setFormState({ mode: 'edit', record })} />
                            <ActionButton action={record.status === 'active' ? 'deactivate' : 'activate'} onClick={() => handleToggleStatus(record)}>
                              {record.status === 'active' ? 'Deactivate' : 'Activate'}
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination page={pagination?.page ?? 1} totalPages={pagination?.totalPages ?? 1} onChange={setPage} />
            </div>
          ) : null}
        </>
      ) : null}

      {formState ? (
        <VariantFormModal
          product={selectedProduct}
          initial={formState.mode === 'edit' ? formState.record : null}
          onClose={closeForm}
          onSubmit={formState.mode === 'edit' ? handleUpdateSubmit : handleCreateSubmit}
        />
      ) : null}
    </div>
  );
}