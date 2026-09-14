import { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { productService } from '../services/product.service.js';
import { categoryService } from '../services/category.service.js';
import { taxCodeService } from '../services/tax-code.service.js';
import { useLanguage } from '../i18n/index.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import ProductFormModal from '../components/ProductFormModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { formatMoney, formatQuantity } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 10;

function StatusBadge({ status }) {
  const { t } = useLanguage();
  const label = status === 'active' ? t('common.active') : status === 'inactive' ? t('common.inactive') : String(status || '—');
  const tone = status === 'active' ? 'active' : 'inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export default function ProductsPage() {
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const { showToast } = useToast();

  const products = useAsync(
    () =>
      productService.list({
        search,
        status: status || undefined,
        categoryId: categoryId || undefined,
        lowStockOnly: lowStockOnly || undefined,
        page,
        limit: LIMIT,
      }),
    [search, status, categoryId, lowStockOnly, page]
  );

  const categories = useAsync(
    () => categoryService.list({ status: 'active', limit: 100 }),
    []
  );

  const taxCodes = useAsync(() => taxCodeService.listActive(), []);

  const categoryItems = categories.data?.items ?? [];
  const taxCodeItems = taxCodes.data ?? [];
  const pagination = products.data?.pagination ?? null;

  function showNotice(message, tone = 'success') {
    showToast(message, tone === 'warn' ? 'warning' : tone);
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
    setCategoryId('');
    setLowStockOnly(false);
    setPage(1);
  }

  async function handleFormSubmit(values, image) {
    // Product create/edit first. A failure here throws and keeps the modal
    // open so field/form errors are shown - nothing has been persisted yet.
    const saved = editing
      ? await productService.update(editing.id, values)
      : await productService.create(values);

    // Save succeeded → close the modal, refresh the list, show the success
    // notice. The product exists from this point on.
    setModalOpen(false);
    showNotice(editing ? `"${values.name}" updated.` : `"${values.name}" created.`);

    const refreshList = async () => {
      if (page === 1) await products.refetch();
      else setPage(1);
    };

    const wantsImageChange = Boolean(image?.imageFile) || Boolean(image?.imageRemoved);
    if (wantsImageChange) {
      // Image work is best-effort and must never report the save as failed.
      try {
        if (image.imageRemoved && !image.imageFile) {
          await productService.removeImage(saved.id);
        } else if (image.imageFile) {
          await productService.uploadImage(saved.id, image.imageFile);
        }
      } catch (err) {
        showNotice(
          `Image not saved: ${err instanceof Error ? err.message : 'please try again.'}`,
          'warn'
        );
      }
    }

    await refreshList();
  }

  async function handleConfirmStatus() {
    const product = confirmAction.product;
    const nextStatus = product.status === 'active' ? 'inactive' : 'active';
    const actionWord = nextStatus === 'active' ? t('products.activate') : t('products.deactivate');
    try {
      await productService.setStatus(product.id, nextStatus);
      setConfirmAction(null);
      await products.refetch();
      showNotice(`"${product.name}" ${actionWord}d.`);
    } catch (err) {
      setConfirmAction(null);
      showNotice(err instanceof Error ? err.message : 'Could not update product status.', 'warn');
    }
  }

  const hasFilters = Boolean(search || status || categoryId || lowStockOnly);

  return (
    <div className="products-page">
      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('products.productCode')}
            aria-label={t('products.productCode')}
          />
          <button type="submit" className="btn btn-primary">
            {t('pos.search')}
          </button>
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            {t('common.close')}
          </button>
        </form>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">{t('products.status')}</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">{t('common.all')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('products.category')}</span>
            <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}>
              <option value="">{t('products.category')}</option>
              {categoryItems.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="toolbar-check">
            <input type="checkbox" checked={lowStockOnly} onChange={(event) => { setLowStockOnly(event.target.checked); setPage(1); }} />
            <span>{t('products.minimumStock')}</span>
          </label>

          <button type="button" className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            {t('products.newProduct')}
          </button>
        </div>
      </div>

      {categories.error ? (
        <div className="toolbar-alert" role="alert">
          {t('products.category')}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => categories.refetch()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {products.loading && !products.data ? (
        <PageLoader label={t('common.loading')} />
      ) : null}

      {products.error && !products.data ? (
        <ErrorState
          title={t('products.title')}
          message={products.error.message}
          status={products.error.status}
          onRetry={() => products.refetch()}
        />
      ) : null}

      {products.data && products.data.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('products.title') : t('products.title')}
          description={t('products.inStock')}
        />
      ) : null}

      {products.data && products.data.items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0}
            </p>
            {products.loading ? <span className="table-refreshing">…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table products-table">
              <thead>
                <tr>
                  <th className="thumb-col">{t('products.image')}</th>
                  <th>{t('products.productCode')}</th>
                  <th>{t('products.name')}</th>
                  <th>{t('products.category')}</th>
                  <th>{t('products.barcode')}</th>
                  <th>{t('products.taxCode')}</th>
                  <th className="num">{t('products.purchasePrice')}</th>
                  <th className="num">{t('products.sellingPrice')}</th>
                  <th className="num">{t('products.mrp')}</th>
                  <th className="num">{t('products.wholesalePrice')}</th>
                  <th className="num">{t('products.stock')}</th>
                  <th>{t('products.status')}</th>
                  <th className="actions-col">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((product) => (
                  <tr key={product.id}>
                    <td className="thumb-col">
                      <ProductImage source={product.imagePath} alt={product.name} size="thumb" />
                    </td>
                    <td className="cell-main cell-code">{product.productCode}</td>
                    <td>{product.name}</td>
                    <td>{product.categoryName}</td>
                    <td>{product.barcode || '—'}</td>
                    <td>{product.taxCode ? `${product.taxCode}${product.taxCodeName ? ` · ${product.taxCodeName}` : ''}` : '—'}</td>
                    <td className="num">{formatMoney(product.purchasePrice)}</td>
                    <td className="num">{formatMoney(product.sellingPrice)}</td>
                    <td className="num">{product.mrp != null ? formatMoney(product.mrp) : '—'}</td>
                    <td className="num">{product.wholesalePrice != null ? formatMoney(product.wholesalePrice) : '—'}</td>
                    <td className="num">{formatQuantity(product.currentStock)}</td>
                    <td>
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => setDetail(product)}>{t('common.view')}</ActionButton>
                        <ActionButton action="edit" onClick={() => { setEditing(product); setModalOpen(true); }}>{t('common.edit')}</ActionButton>
                        <ActionButton action={product.status === 'active' ? 'deactivate' : 'activate'} onClick={() => setConfirmAction({ product })}>
                          {product.status === 'active' ? t('products.deactivate') : t('products.activate')}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination?.page ?? 1}
            totalPages={pagination?.totalPages ?? 1}
            onChange={setPage}
          />
        </div>
      ) : null}

      {modalOpen ? (
        <ProductFormModal
          title={editing ? t('products.editProduct') : t('products.newProduct')}
          product={editing}
          categories={categoryItems}
          taxCodes={taxCodeItems}
          onSubmit={handleFormSubmit}
          onClose={() => setModalOpen(false)}
        />
      ) : null}

      {detail ? (
        <Modal title={t('products.title')} onClose={() => setDetail(null)}>
          <div className="product-detail">
            <ProductImage source={detail.imagePath} alt={detail.name} size="detail" lazy={false} />
            <dl className="detail-list">
              <div className="detail-row">
                <dt>{t('products.productCode')}</dt>
                <dd>{detail.productCode}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.name')}</dt>
                <dd>{detail.name}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.category')}</dt>
                <dd>{detail.categoryName || '—'}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.barcode')}</dt>
                <dd>{detail.barcode || '—'}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.sellingPrice')}</dt>
                <dd>{formatMoney(detail.sellingPrice)}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.purchasePrice')}</dt>
                <dd>{formatMoney(detail.purchasePrice)}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.stock')}</dt>
                <dd>{formatQuantity(detail.currentStock)}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('products.status')}</dt>
                <dd><StatusBadge status={detail.status} /></dd>
              </div>
            </dl>
          </div>
        </Modal>
      ) : null}

      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.product.status === 'active' ? t('products.deactivate') : t('products.activate')}
          message={`${confirmAction.product.status === 'active' ? t('products.deactivate') : t('products.activate')} "${confirmAction.product.name}"?`}
          confirmLabel={t('common.confirm')}
          onConfirm={handleConfirmStatus}
          onClose={() => setConfirmAction(null)}
        />
      ) : null}
    </div>
  );
}