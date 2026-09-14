import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { ApiError } from '../api/client.js';
import { useLanguage } from '../i18n/index.jsx';
import { imageUrl } from '../utils/imageUrl.js';

export const PRODUCT_UNITS = ['kg', 'g', 'piece', 'dozen', 'bunch', 'litre'];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB - matches the backend cap

function toRounded(value, dp) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const factor = 10 ** dp;
  return Math.round(n * factor) / factor;
}

// Frontend UX validation only - the backend stays authoritative.
function validate(values, { isEdit }) {
  const errors = {};

  if (!isEdit) {
    const productCode = String(values.productCode || '').trim();
    if (!productCode) errors.productCode = 'required';
    else if (productCode.length > 50) errors.productCode = 'max50';
  }

  const name = String(values.name || '').trim();
  if (!name) errors.name = 'required';
  else if (name.length > 150) errors.name = 'max150';

  if (!values.categoryId) errors.categoryId = 'required';
  if (!values.unit) errors.unit = 'required';

  const numericFields = [
    ['purchasePrice', 2],
    ['sellingPrice', 2],
    ['currentStock', 3],
    ['minimumStock', 3],
    ['mrp', 2],
    ['wholesalePrice', 2],
  ];
  for (const [key] of numericFields) {
    const raw = values[key];
    if (raw === '' || raw == null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) errors[key] = 'numeric';
  }

  if (String(values.barcode || '').trim().length > 100) errors.barcode = 'max100';
  if (String(values.hsnCode || '').trim().length > 20) errors.hsnCode = 'max20';

  return errors;
}

function valuesToPayload(values, { isEdit }) {
  const payload = {
    name: String(values.name || '').trim(),
    categoryId: Number(values.categoryId),
    unit: values.unit,
    purchasePrice: toRounded(values.purchasePrice, 2),
    sellingPrice: toRounded(values.sellingPrice, 2),
    currentStock: toRounded(values.currentStock === '' ? 0 : values.currentStock, 3),
    minimumStock: toRounded(values.minimumStock === '' ? 0 : values.minimumStock, 3),
    mrp: values.mrp === '' || values.mrp == null ? null : toRounded(values.mrp, 2),
    wholesalePrice:
      values.wholesalePrice === '' || values.wholesalePrice == null
        ? null
        : toRounded(values.wholesalePrice, 2),
    priceIncludesTax: values.priceIncludesTax === true,
    barcode: values.barcode === '' ? null : String(values.barcode).trim(),
    hsnCode: values.hsnCode === '' ? null : String(values.hsnCode).trim(),
    taxCodeId: values.taxCodeId === '' || values.taxCodeId == null ? null : Number(values.taxCodeId),
  };
  if (!isEdit) {
    payload.productCode = String(values.productCode || '').trim();
  }
  return payload;
}

export default function ProductFormModal({ title, product, categories, taxCodes, onSubmit, onClose }) {
  const { t } = useLanguage();
  const isEdit = Boolean(product);

  const [values, setValues] = useState(() => ({
    productCode: product?.productCode ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    unit: product?.unit ?? '',
    purchasePrice: product?.purchasePrice ?? '',
    sellingPrice: product?.sellingPrice ?? '',
    mrp: product?.mrp ?? '',
    wholesalePrice: product?.wholesalePrice ?? '',
    priceIncludesTax: Boolean(product?.priceIncludesTax),
    barcode: product?.barcode ?? '',
    hsnCode: product?.hsnCode ?? '',
    taxCodeId: product?.taxCodeId ?? '',
    currentStock: product?.currentStock ?? '',
    minimumStock: product?.minimumStock ?? '',
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(() =>
    product?.imagePath ? imageUrl(product.imagePath) : null
  );
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageError, setImageError] = useState('');

  // Revoke object URLs when a preview is swapped or the modal unmounts.
  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function handleChooseImage(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    setImageError('');
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError(t('products.imageTypeInvalid'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(t('products.imageFileTooLarge'));
      return;
    }
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
  }

  function handleRemoveImage() {
    setImageError('');
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    if (imageFile) {
      setImageFile(null);
      setImagePreview(product?.imagePath ? imageUrl(product.imagePath) : null);
      return;
    }
    setImagePreview(null);
    setImageRemoved(true);
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setValues((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validate(values, { isEdit });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(valuesToPayload(values, { isEdit }), { imageFile, imageRemoved });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const mapped = {};
        err.details.forEach((detail) => {
          if (detail && detail.field && String(detail.message)) {
            mapped[detail.field] = String(detail.message);
          }
        });
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setSubmitting(false);
          return;
        }
      }
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-field image-uploader-field">
            <label htmlFor="productImage">{t('products.image')}</label>
            <div className="image-uploader">
              <div className="image-uploader-preview">
                {imagePreview ? (
                  <img src={imagePreview} alt={t('products.imagePreview')} />
                ) : (
                  <span className="image-uploader-placeholder">{t('products.noImage')}</span>
                )}
              </div>
              <div className="image-uploader-actions">
                <label className="btn btn-outline btn-sm image-uploader-choose">
                  <span>{imagePreview ? t('products.changeImage') : t('products.chooseImage')}</span>
                  <input
                    id="productImage"
                    type="file"
                    accept={IMAGE_TYPES.join(',')}
                    onChange={handleChooseImage}
                    disabled={submitting}
                  />
                </label>
                {imagePreview ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleRemoveImage}
                    disabled={submitting}
                  >
                    {t('products.removeImage')}
                  </button>
                ) : null}
              </div>
            </div>
            {imageError ? <p className="field-error">{imageError}</p> : null}
          </div>

          {!isEdit ? (
            <div className={`form-field ${fieldErrors.productCode ? 'invalid' : ''}`}>
              <label htmlFor="productCode">{t('products.productCode')}</label>
              <input
                id="productCode"
                name="productCode"
                type="text"
                value={values.productCode}
                onChange={handleChange}
                placeholder="e.g. TOM-001"
                disabled={submitting}
                maxLength={50}
              />
              {fieldErrors.productCode ? (
                <p className="field-error">{fieldErrors.productCode}</p>
              ) : null}
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="productCode">{t('products.productCode')}</label>
              <input id="productCode" type="text" value={product?.productCode || ''} disabled />
              <p className="field-hint">{t('products.productCode')}</p>
            </div>
          )}

          <div className={`form-field ${fieldErrors.name ? 'invalid' : ''}`}>
            <label htmlFor="name">{t('products.name')}</label>
            <input
              id="name"
              name="name"
              type="text"
              value={values.name}
              onChange={handleChange}
              placeholder="e.g. Tomato"
              disabled={submitting}
              maxLength={150}
            />
            {fieldErrors.name ? <p className="field-error">{fieldErrors.name}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.categoryId ? 'invalid' : ''}`}>
            <label htmlFor="categoryId">{t('products.category')}</label>
            <select
              id="categoryId"
              name="categoryId"
              value={values.categoryId}
              onChange={handleChange}
              disabled={submitting}
              className={fieldErrors.categoryId ? 'select-invalid' : ''}
            >
              <option value="">{t('products.category')}…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId ? (
              <p className="field-error">{fieldErrors.categoryId}</p>
            ) : null}
          </div>

          <div className={`form-field ${fieldErrors.unit ? 'invalid' : ''}`}>
            <label htmlFor="unit">{t('products.unit')}</label>
            <select
              id="unit"
              name="unit"
              value={values.unit}
              onChange={handleChange}
              disabled={submitting}
              className={fieldErrors.unit ? 'select-invalid' : ''}
            >
              <option value="">{t('products.unit')}…</option>
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            {fieldErrors.unit ? <p className="field-error">{fieldErrors.unit}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.barcode ? 'invalid' : ''}`}>
            <label htmlFor="barcode">{t('products.barcode')}</label>
            <input
              id="barcode"
              name="barcode"
              type="text"
              value={values.barcode}
              onChange={handleChange}
              placeholder="8900000000000"
              disabled={submitting}
              maxLength={100}
            />
            {fieldErrors.barcode ? <p className="field-error">{fieldErrors.barcode}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.hsnCode ? 'invalid' : ''}`}>
            <label htmlFor="hsnCode">{t('products.hsnCode')}</label>
            <input
              id="hsnCode"
              name="hsnCode"
              type="text"
              value={values.hsnCode}
              onChange={handleChange}
              placeholder="0805"
              disabled={submitting}
              maxLength={20}
            />
            {fieldErrors.hsnCode ? <p className="field-error">{fieldErrors.hsnCode}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.taxCodeId ? 'invalid' : ''}`}>
            <label htmlFor="taxCodeId">{t('products.taxCode')}</label>
            <select
              id="taxCodeId"
              name="taxCodeId"
              value={values.taxCodeId}
              onChange={handleChange}
              disabled={submitting}
            >
              <option value="">{'—'}</option>
              {(taxCodes ?? []).map((taxCode) => (
                <option key={taxCode.id} value={taxCode.id}>
                  {taxCode.code} — {taxCode.name}
                </option>
              ))}
            </select>
            {fieldErrors.taxCodeId ? (
              <p className="field-error">{fieldErrors.taxCodeId}</p>
            ) : null}
          </div>

          <div className={`form-field ${fieldErrors.purchasePrice ? 'invalid' : ''}`}>
            <label htmlFor="purchasePrice">{t('products.purchasePrice')}</label>
            <input
              id="purchasePrice"
              name="purchasePrice"
              type="number"
              min="0"
              step="0.01"
              value={values.purchasePrice}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.purchasePrice ? <p className="field-error">{fieldErrors.purchasePrice}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.sellingPrice ? 'invalid' : ''}`}>
            <label htmlFor="sellingPrice">{t('products.sellingPrice')}</label>
            <input
              id="sellingPrice"
              name="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              value={values.sellingPrice}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.sellingPrice ? <p className="field-error">{fieldErrors.sellingPrice}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.mrp ? 'invalid' : ''}`}>
            <label htmlFor="mrp">{t('products.mrp')}</label>
            <input
              id="mrp"
              name="mrp"
              type="number"
              min="0"
              step="0.01"
              value={values.mrp}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.mrp ? <p className="field-error">{fieldErrors.mrp}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.wholesalePrice ? 'invalid' : ''}`}>
            <label htmlFor="wholesalePrice">{t('products.wholesalePrice')}</label>
            <input
              id="wholesalePrice"
              name="wholesalePrice"
              type="number"
              min="0"
              step="0.01"
              value={values.wholesalePrice}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.wholesalePrice ? <p className="field-error">{fieldErrors.wholesalePrice}</p> : null}
          </div>

          <div className="form-field form-field-check">
            <label className="check-line">
              <input
                type="checkbox"
                name="priceIncludesTax"
                checked={values.priceIncludesTax}
                onChange={handleChange}
                disabled={submitting}
              />
              <span>{t('products.priceIncludesTax')}</span>
            </label>
          </div>

          <div className={`form-field ${fieldErrors.currentStock ? 'invalid' : ''}`}>
            <label htmlFor="currentStock">{t('products.currentStock')}</label>
            <input
              id="currentStock"
              name="currentStock"
              type="number"
              min="0"
              step="0.001"
              value={values.currentStock}
              onChange={handleChange}
              placeholder={isEdit ? 'Required' : '0'}
              disabled={submitting}
            />
            {fieldErrors.currentStock ? <p className="field-error">{fieldErrors.currentStock}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.minimumStock ? 'invalid' : ''}`}>
            <label htmlFor="minimumStock">{t('products.minimumStock')}</label>
            <input
              id="minimumStock"
              name="minimumStock"
              type="number"
              min="0"
              step="0.001"
              value={values.minimumStock}
              onChange={handleChange}
              placeholder={isEdit ? 'Required' : '0'}
              disabled={submitting}
            />
            {fieldErrors.minimumStock ? <p className="field-error">{fieldErrors.minimumStock}</p> : null}
          </div>
        </div>

        {formError ? (
          <div className="form-alert" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('products.newProduct')}
          </button>
        </div>
      </form>
    </Modal>
  );
}