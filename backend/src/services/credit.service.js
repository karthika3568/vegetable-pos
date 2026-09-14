/**
 * Credit service - business rules for customer credit management.
 *
 * Backend-owned numbers only: current_balance always comes from the
 * customers table, never from the request body. The credit module is
 * the sole owner of customers.current_balance; Customer CRUD treats it
 * as read-only.
 *
 * credit_limit interpretation (live schema convention):
 *   0      -> no credit allowed (any credit creation is rejected)
 *   > 0    -> hard ceiling on current_balance
 */

const creditRepository = require('../repositories/credit.repository');
const customerRepository = require('../repositories/customer.repository');
const ApiError = require('../utils/ApiError');

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function creditStatus(customer) {
  const balance = toMoney(customer.current_balance);
  const creditLimit = toMoney(customer.credit_limit);
  const availableCredit =
    creditLimit > 0 ? Math.max(0, toMoney(creditLimit - balance)) : 0;

  return {
    customerId: Number(customer.id),
    name: customer.name,
    phone: customer.phone,
    creditLimit,
    currentBalance: balance,
    outstanding: balance,
    availableCredit,
    status: customer.status,
    updatedAt: customer.updated_at,
  };
}

async function list({ search, outstanding = 'true', status, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await creditRepository.findOutstanding({
    search,
    outstandingOnly: outstanding === 'true',
    status,
    limit,
    offset,
  });

  return {
    items: rows.map(creditStatus),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getCustomerCredit(customerId) {
  const customer = await customerRepository.findById(customerId);

  if (!customer) {
    throw ApiError.notFound(`Customer ${customerId} not found`);
  }

  return creditStatus(customer);
}

async function createFromSale({ saleId, createdBy }) {
  return creditRepository.createFromSale({ saleId, createdBy });
}

async function collect({ customerId, amount, method, notes, receivedBy }) {
  return creditRepository.collect({
    customerId,
    amount,
    method,
    notes,
    receivedBy,
  });
}

async function getTransactions({ customerId, page = 1, limit = 20 }) {
  const customer = await customerRepository.findById(customerId);

  if (!customer) {
    throw ApiError.notFound(`Customer ${customerId} not found`);
  }

  const offset = (page - 1) * limit;

  const { rows, total } = await creditRepository.findTransactions(
    customerId,
    limit,
    offset
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      transactionType: row.transaction_type,
      amount: toMoney(row.amount),
      saleId: row.sale_id ? Number(row.sale_id) : null,
      invoiceNumber: row.invoice_number || null,
      paymentId: row.payment_id ? Number(row.payment_id) : null,
      paymentMethod: row.payment_method || null,
      balanceBefore: toMoney(row.balance_before),
      balanceAfter: toMoney(row.balance_after),
      notes: row.notes,
      createdById: Number(row.created_by),
      createdByName: row.created_by_name,
      createdAt: row.created_at,
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
  list,
  getCustomerCredit,
  createFromSale,
  collect,
  getTransactions,
};