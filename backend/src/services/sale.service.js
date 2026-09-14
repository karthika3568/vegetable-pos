/**
 * Sale service - business rules for the POS / sales module.
 *
 * Server-side calculations (the frontend is never trusted for money):
 *   line_total      = quantity * unit_price - item_discount
 *   subtotal        = SUM(line_total)             (all rounded to 2 d.p.)
 *   tax_amount      = SUM(line CGST + SGST + IGST), itemised from the
 *                     product's tax code (tax_codes master table).
 *   total_amount    = subtotal - discount + ADDED tax.
 *
 * GST model (Phase 2 - Tax Master):
 *   - Each product may carry a tax_code_id -> tax_codes (CGST/SGST/IGST
 *     rates). A product without a tax code falls back to the legacy
 *     flat `tax_rate_percent` setting (split CGST/SGST), so shops that
 *     never configured the tax master keep their old behaviour while
 *     any product assigned a code follows the master.
 *   - Intra-state vs inter-state decides the split: when the customer is
 *     a walk-in (no customer), has no state, or shares the shop's state
 *     (settings `shop_state`), CGST + SGST apply; a customer in a
 *     different state pays the full IGST rate.
 *   - price_includes_tax products have the tax EMBEDDED in
 *     quantity * unit_price: the tax is extracted at
 *     base * rate / (100 + rate) and reported separately. Tax-exclusive
 *     products ADD the tax on top (base * rate / 100).
 *   - The header discount is allocated proportionally across the lines,
 *     so the per-line stored tax amounts reconcile exactly with the
 *     header amounts stored on sales.
 *
 * Quantity is rounded to 3 decimals (DECIMAL(10,3) column convention)
 * BEFORE any calculation so the header subtotal always equals what the
 * generated sale_items.line_total column computes. Money uses the same
 * 2-decimal half-up rounding as the purchase module - one strategy.
 *
 * Selling price is ALWAYS resolved from the active product's DB
 * selling_price - a client-supplied price is ignored entirely.
 *
 * Duplicate products in the items array are merged into one line
 * (quantities and line discounts are summed) - friendly for a POS
 * where the same product can be scanned twice.
 *
 * Payments: normal POS immediate payment is the primary flow, but the
 * schema models credit/partial explicitly (sales.payment_type + the
 * generated balance_due column), so a completed sale with 0 <= paid <=
 * total is recorded faithfully: payment_type 'cash' (paid == total),
 * 'partial' (0 < paid < total) or 'credit' (paid == 0). customers
 * .current_balance is NEVER touched here - credit management owns that
 * value in a later phase; sale.balance_due is just the automatically
 * generated difference the schema defines.
 *
 * Phase 7C - Returns & Cancellation:
 *   cancel(saleId)  delegates to the repository (authoritative status /
 *                   stock / credit logic). The service only validates
 *                   the id shape; the repository re-validates everything
 *                   inside the locked transaction.
 *   returnGoods(...) merges duplicate product lines into one (same
 *                   convention as create), then delegates. The refund is
 *                   frozen at the ORIGINAL sale unit_price, so the
 *                   service needs no current-price lookups.
 */

const saleRepository = require('../repositories/sale.repository');
const productRepository = require('../repositories/product.repository');
const customerRepository = require('../repositories/customer.repository');
const settingRepository = require('../repositories/setting.repository');
const ApiError = require('../utils/ApiError');

const PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'bank_transfer', 'other']);

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function to3(value) {
  const n = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toSqlDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest('invalid date format');
  }
  return date.toISOString().slice(0, 10);
}

async function list({
  search,
  customerId,
  fromDate,
  toDate,
  status,
  paymentType,
  page = 1,
  limit = 20,
}) {
  const offset = (page - 1) * limit;

  const { rows, total } = await saleRepository.findAll({
    search,
    customerId,
    fromDate: fromDate ? toDateString(fromDate) : undefined,
    toDate: toDate ? toDateString(toDate) : undefined,
    status,
    paymentType,
    limit,
    offset,
  });

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  const sale = await saleRepository.findById(id);

  if (!sale) {
    throw ApiError.notFound(`Sale ${id} not found`);
  }

  return sale;
}

async function ensureCustomerActive(customerId) {
  const customer = await customerRepository.findById(customerId);

  if (!customer) {
    throw ApiError.notFound(`Customer ${customerId} not found`);
  }

  if (customer.status !== 'active') {
    throw ApiError.badRequest(
      'Sales can only be recorded against an active customer'
    );
  }

  return customer;
}

function normalizeState(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  return value.trim().toLowerCase();
}

/**
 * Resolve the CGST/SGST/IGST split that applies to a product on this
 * sale. Returns the tax code snapshot string plus the split rates.
 */
function resolveProductRates(product, isIntraState, flatRate) {
  if (product.tax_code_id) {
    const cgst = Number(product.cgst_rate) || 0;
    const sgst = Number(product.sgst_rate) || 0;
    const igst = Number(product.igst_rate) || 0;

    if (isIntraState) {
      return { taxCode: product.tax_code, cgst, sgst, igst: 0 };
    }
    return { taxCode: product.tax_code, cgst: 0, sgst: 0, igst };
  }

  // Legacy fallback: products without an assigned tax code use the flat
  // tax_rate_percent setting, split evenly CGST/SGST (never IGST).
  const half = flatRate / 2;
  return { taxCode: null, cgst: half, sgst: half, igst: 0 };
}

async function create({
  customerId,
  saleDate,
  discount = 0,
  items,
  payments = [],
  creditRequested = false,
  createdBy,
  hasCreditPermission = false,
}) {
  let customerState = null;
  if (customerId) {
    const customer = await ensureCustomerActive(customerId);
    customerState = normalizeState(customer.state);
  }

  const flatRateSetting = await settingRepository.findByKey('tax_rate_percent');
  const flatRate = flatRateSetting ? Number(flatRateSetting.setting_value) : 0;
  const shopStateSetting = await settingRepository.findByKey('shop_state');
  const shopState = normalizeState(
    shopStateSetting ? shopStateSetting.setting_value : null
  );
  const prefixSetting = await settingRepository.findByKey('invoice_prefix');
  const invoicePrefix = prefixSetting ? prefixSetting.setting_value : 'INV-';

  // Missing/unset shop state and missing customer state both default to
  // intra-state (CGST + SGST); only a different customer state triggers IGST.
  const isIntraState =
    !shopState || !customerState || customerState === shopState;

  // Merge duplicate product lines and normalize every numeric value.
  const merged = new Map();
  for (const raw of items) {
    const productId = Number(raw.productId);
    const quantity = Number(raw.quantity);
    const itemDiscount = Number(raw.discount ?? 0);

    if (!Number.isInteger(productId) || productId < 1) {
      throw ApiError.badRequest('each item productId must be a positive integer');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw ApiError.badRequest('each item quantity must be a positive number');
    }
    if (!Number.isFinite(itemDiscount) || itemDiscount < 0) {
      throw ApiError.badRequest('each item discount must be a non-negative number');
    }

    const current = merged.get(productId) || {
      productId,
      quantity: 0,
      discount: 0,
    };
    current.quantity += quantity;
    current.discount += itemDiscount;
    merged.set(productId, current);
  }

  const discountAmount = toMoney(discount);
  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    throw ApiError.badRequest('discount must be a non-negative number');
  }

  // Resolve active products + their selling price from the database.
  const normalizedItems = [];
  let subtotal = 0;

  for (const entry of merged.values()) {
    const quantity = to3(entry.quantity);

    if (quantity <= 0) {
      throw ApiError.badRequest('each item quantity must be a positive number');
    }

    const product = await productRepository.findById(entry.productId);

    if (!product) {
      throw ApiError.notFound(`Product ${entry.productId} not found`);
    }

    if (product.status !== 'active') {
      throw ApiError.badRequest(
        `Product "${product.name}" is inactive and cannot be sold`
      );
    }

    const unitPrice = Number(product.selling_price);
    const itemDiscountAmount = toMoney(entry.discount);
    const lineTotal = toMoney(quantity * unitPrice - itemDiscountAmount);

    if (lineTotal < 0) {
      throw ApiError.badRequest(
        `Item discount cannot exceed the line total for "${product.name}"`
      );
    }

    subtotal = toMoney(subtotal + lineTotal);

    const { taxCode, cgst, sgst, igst } = resolveProductRates(
      product,
      isIntraState,
      flatRate
    );

    normalizedItems.push({
      productId: entry.productId,
      quantity,
      unitPrice,
      discountAmount: itemDiscountAmount,
      lineTotal,
      taxCode,
      cgstRate: cgst,
      sgstRate: sgst,
      igstRate: igst,
      priceIncludesTax: Number(product.price_includes_tax) === 1,
    });
  }

  if (discountAmount > subtotal) {
    throw ApiError.badRequest(
      'discount cannot exceed the sale subtotal'
    );
  }

  // Allocate the header discount proportionally across the lines so the
  // per-line tax amounts stored on sale_items reconcile exactly with the
  // header amounts (last line absorbs rounding remainder).
  const allocations = [];
  {
    let remaining = discountAmount;
    for (let i = 0; i < normalizedItems.length; i++) {
      if (i === normalizedItems.length - 1) {
        allocations.push(remaining);
        break;
      }
      const alloc =
        subtotal > 0
          ? toMoney((discountAmount * normalizedItems[i].lineTotal) / subtotal)
          : 0;
      const clamped = Math.min(alloc, remaining);
      allocations.push(clamped);
      remaining = toMoney(remaining - clamped);
    }
  }

  // Header money from the tax master: every line's tax is computed on its
  // discounted value. Inclusive items keep the tax embedded in the line
  // total; exclusive items add it on top. The header tax_amount is the
  // total GST content (embedded + added) so invoices report it fully.
  let addedTax = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  for (let i = 0; i < normalizedItems.length; i++) {
    const item = normalizedItems[i];
    const taxedBase = toMoney(item.lineTotal - allocations[i]);
    const totalRate = item.cgstRate + item.sgstRate + item.igstRate;

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (totalRate > 0) {
      let lineTax;
      if (item.priceIncludesTax) {
        lineTax = toMoney((taxedBase * totalRate) / (100 + totalRate));
      } else {
        lineTax = toMoney((taxedBase * totalRate) / 100);
      }

      if (item.cgstRate > 0) {
        cgst = toMoney((lineTax * item.cgstRate) / totalRate);
      }
      if (item.sgstRate > 0) {
        sgst = toMoney((lineTax * item.sgstRate) / totalRate);
      }
      igst = toMoney(lineTax - cgst - sgst);

      if (!item.priceIncludesTax) {
        addedTax = toMoney(addedTax + lineTax);
      }
    }

    item.cgstAmount = cgst;
    item.sgstAmount = sgst;
    item.igstAmount = igst;
    item.taxAmount = toMoney(cgst + sgst + igst);

    cgstAmount = toMoney(cgstAmount + cgst);
    sgstAmount = toMoney(sgstAmount + sgst);
    igstAmount = toMoney(igstAmount + igst);
  }

  const taxAmount = toMoney(cgstAmount + sgstAmount + igstAmount);
  const total = toMoney(subtotal - discountAmount + addedTax);

  // Payments: normalize and validate; the sum can never exceed the bill.
  const normalizedPayments = [];
  let paidAmount = 0;

  for (const raw of payments) {
    if (!raw || !PAYMENT_METHODS.has(raw.method)) {
      throw ApiError.badRequest('payment method is invalid');
    }

    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) {
      throw ApiError.badRequest('each payment amount must be a valid number');
    }

    const amount = toMoney(Number(raw.amount));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw ApiError.badRequest('each payment amount must be a positive number');
    }

    paidAmount = toMoney(paidAmount + amount);
    normalizedPayments.push({
      method: raw.method,
      amount,
      notes: raw.notes || null,
    });
  }

  if (paidAmount > total) {
    throw ApiError.badRequest(
      `Payments (${paidAmount}) cannot exceed the sale total (${total})`
    );
  }

  const balanceDue = toMoney(total - paidAmount);
  if (balanceDue > 0 && !creditRequested) {
    throw ApiError.badRequest(
      'Outstanding balance requires explicit credit confirmation'
    );
  }
  if (balanceDue > 0 && !customerId) {
    throw ApiError.badRequest(
      'Credit requires a known customer; walk-in sales cannot carry credit'
    );
  }
  if (balanceDue > 0 && !hasCreditPermission) {
    throw ApiError.forbidden('Credit permission is required for outstanding sales');
  }
  if (balanceDue <= 0 && creditRequested) {
    throw ApiError.badRequest('Credit cannot be recorded for a fully paid sale');
  }

  const paymentType =
    paidAmount === total ? 'cash' : paidAmount === 0 ? 'credit' : 'partial';

  let saleDateValue = new Date();
  if (saleDate) {
    const parsed = new Date(saleDate);
    if (Number.isNaN(parsed.getTime())) {
      throw ApiError.badRequest('invalid saleDate format');
    }
    saleDateValue = parsed;
  }

  return saleRepository.create({
    customerId,
    saleDate: toSqlDateTime(saleDateValue),
    invoicePrefix,
    subtotal,
    discountAmount,
    taxAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    total,
    paidAmount,
    paymentType,
    items: normalizedItems,
    payments: normalizedPayments,
    creditRequested,
    createdBy,
  });
}

function normalizeReturnItems(items) {
  const merged = new Map();
  for (const raw of items) {
    const productId = Number(raw.productId);
    const quantity = Number(raw.quantity);

    if (!Number.isInteger(productId) || productId < 1) {
      throw ApiError.badRequest('each item productId must be a positive integer');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw ApiError.badRequest('each item quantity must be a positive number');
    }
    if (quantity > 100000) {
      throw ApiError.badRequest('each return quantity is unrealistically large');
    }

    const current = merged.get(productId) || { productId, quantity: 0 };
    current.quantity = Math.round((current.quantity + quantity) * 1000) / 1000;
    merged.set(productId, current);
  }
  return [...merged.values()];
}

/**
 * Full-void cancellation of a completed sale. See repository docblock
 * for the exact rules (status guard, stock restoration, credit reversal
 * capped at current balance, sale stays in history).
 */
async function cancel({ saleId, createdBy }) {
  if (!Number.isInteger(saleId) || saleId < 1) {
    throw ApiError.badRequest('saleId must be a positive integer');
  }
  return saleRepository.cancel({ saleId, createdBy });
}

/**
 * Record a return of goods against a completed sale. Duplicate product
 * lines are merged (same convention as sale creation); the repository
 * validates the sale state and per-line availability in its locked
 * transaction so concurrent requests cannot over-return.
 */
async function returnGoods({ saleId, items, reason, createdBy }) {
  if (!Number.isInteger(saleId) || saleId < 1) {
    throw ApiError.badRequest('saleId must be a positive integer');
  }

  const normalized = normalizeReturnItems(items);

  if (normalized.length === 0) {
    throw ApiError.badRequest('at least one return item is required');
  }
  if (reason !== undefined && reason !== null && String(reason).length > 255) {
    throw ApiError.badRequest('reason must be at most 255 characters');
  }

  return saleRepository.returnGoods({
    saleId,
    items: normalized,
    reason: reason || null,
    createdBy,
  });
}

module.exports = {
  list,
  getById,
  create,
  cancel,
  returnGoods,
};