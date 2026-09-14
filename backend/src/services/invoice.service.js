/**
 * Invoice service - builds the print-ready representation of an
 * existing sale. Read-only business rules only.
 *
 * An invoice is NEVER a second financial transaction. Every value here
 * is copied verbatim from the database rows the Sales module already
 * wrote (stored sale/sale_items/payments values are the source of
 * truth). We do NOT recalculate with today's product prices, current
 * tax settings or current stock - a historical invoice stays frozen at
 * the moment of sale.
 *
 * The only LIVE lookups are display-only shop meta (shop name,
 * currency, invoice prefix) used by a future printer/frontend.
 *
 * No writes, no stock change, no payment insert, no credit insert, no
 * customer balance update - GET-ing an invoice has zero side effects.
 */

const invoiceRepository = require('../repositories/invoice.repository');
const settingRepository = require('../repositories/setting.repository');
const ApiError = require('../utils/ApiError');

function toMoney(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

async function shopInfo() {
  const shopNameSetting = await settingRepository.findByKey('shop_name');
  const currencySetting = await settingRepository.findByKey('currency');
  const prefixSetting = await settingRepository.findByKey('invoice_prefix');

  return {
    shopName: shopNameSetting ? shopNameSetting.setting_value : null,
    currency: currencySetting ? currencySetting.setting_value : 'INR',
    invoicePrefix: prefixSetting ? prefixSetting.setting_value : 'INV-',
  };
}

function toInvoice(row) {
  const credit = row.credit;
  const reversalTotal = row.creditReversal.reduce(
    (sum, r) => sum + toMoney(r.amount),
    0
  );

  return {
    invoiceNumber: row.invoice_number,
    saleId: Number(row.id),
    saleDate: row.sale_date,
    status: row.status,
    saleType: row.sale_type || 'retail',
    paymentType: row.payment_type,
    isWalkIn: row.customer_id === null,
    customer:
      row.customer_id === null
        ? null
        : {
            id: Number(row.customer_id),
            name: row.customer_name,
            phone: row.customer_phone,
            state: row.customer_state,
          },
    items: row.items.map((item) => ({
      productId: Number(item.product_id),
      productCode: item.product_code,
      productName: item.product_name,
      unit: item.unit,
      quantity: toMoney(item.quantity),
      unitPrice: toMoney(item.unit_price),
      taxCode: item.tax_code ?? null,
      cgstRate: toMoney(item.cgst_rate),
      sgstRate: toMoney(item.sgst_rate),
      igstRate: toMoney(item.igst_rate),
      cgstAmount: toMoney(item.cgst_amount),
      sgstAmount: toMoney(item.sgst_amount),
      igstAmount: toMoney(item.igst_amount),
      discountAmount: toMoney(item.discount_amount),
      lineTotal: toMoney(item.line_total),
    })),
    returns: row.returns.map((ret) => ({
      id: Number(ret.id),
      returnDate: ret.return_date,
      reason: ret.reason,
      refundAmount: toMoney(ret.refund_amount),
      createdById: ret.created_by ? Number(ret.created_by) : null,
      createdByName: ret.created_by_name,
      items: ret.items.map((item) => ({
        productId: Number(item.product_id),
        productCode: item.product_code,
        productName: item.product_name,
        unit: item.unit,
        quantity: toMoney(item.quantity),
        unitPrice: toMoney(item.unit_price),
        discountAmount: toMoney(item.discount_amount),
        lineTotal: toMoney(item.line_total),
      })),
    })),
    subtotal: toMoney(row.subtotal),
    discountAmount: toMoney(row.discount_amount),
    taxAmount: toMoney(row.tax_amount),
    cgstAmount: toMoney(row.cgst_amount),
    sgstAmount: toMoney(row.sgst_amount),
    igstAmount: toMoney(row.igst_amount),
    totalAmount: toMoney(row.total_amount),
    amountPaid: toMoney(row.paid_amount),
    balanceDue: toMoney(row.balance_due),
    payments: row.payments.map((payment) => ({
      id: Number(payment.id),
      method: payment.payment_method,
      type: payment.payment_type,
      amount: toMoney(payment.amount),
      paymentDate: payment.payment_date,
      notes: payment.notes,
      receivedById: payment.received_by ? Number(payment.received_by) : null,
      receivedByName: payment.received_by_name,
    })),
    credit:
      credit === null
        ? {
            recorded: false,
            reversalTotal: toMoney(reversalTotal),
            reversalCount: row.creditReversal.length,
          }
        : {
            recorded: true,
            transactionId: Number(credit.id),
            amount: toMoney(credit.amount),
            balanceBefore: toMoney(credit.balance_before),
            balanceAfter: toMoney(credit.balance_after),
            notes: credit.notes,
            createdAt: credit.created_at,
            reversalTotal: toMoney(reversalTotal),
            reversalCount: row.creditReversal.length,
            netCredit: toMoney(credit.amount - reversalTotal),
          },
    createdBy: {
      id: Number(row.created_by),
      username: row.created_by_name,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getById(saleId) {
  const row = await invoiceRepository.findById(saleId);

  if (!row) {
    throw ApiError.notFound(`Sale ${saleId} not found`);
  }

  return {
    ...toInvoice(row),
    shop: await shopInfo(),
  };
}

async function getByInvoiceNumber(invoiceNumber) {
  const row = await invoiceRepository.findByInvoiceNumber(invoiceNumber);

  if (!row) {
    throw ApiError.notFound(`Invoice "${invoiceNumber}" not found`);
  }

  return {
    ...toInvoice(row),
    shop: await shopInfo(),
  };
}

async function list({ search, fromDate, toDate, status, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await invoiceRepository.findAll({
    search,
    fromDate,
    toDate,
    status,
    limit,
    offset,
  });

  return {
    items: rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      saleId: Number(row.id),
      saleDate: row.sale_date,
      customer:
        row.customer_id === null
          ? null
          : {
              id: Number(row.customer_id),
              name: row.customer_name,
              phone: row.customer_phone,
            },
      subtotal: toMoney(row.subtotal),
      discountAmount: toMoney(row.discount_amount),
      taxAmount: toMoney(row.tax_amount),
      cgstAmount: toMoney(row.cgst_amount),
      sgstAmount: toMoney(row.sgst_amount),
      igstAmount: toMoney(row.igst_amount),
      totalAmount: toMoney(row.total_amount),
      amountPaid: toMoney(row.paid_amount),
      balanceDue: toMoney(row.balance_due),
      paymentType: row.payment_type,
      saleType: row.sale_type || 'retail',
      status: row.status,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  getById,
  getByInvoiceNumber,
  list,
};