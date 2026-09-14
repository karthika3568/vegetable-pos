const invoiceService = require('../services/invoice.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, fromDate, toDate, status, page, limit } = req.query;

  const result = await invoiceService.list({
    search,
    fromDate,
    toDate,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getById(Number(req.params.saleId));
  response.ok(res, invoice);
});

const getByNumber = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getByInvoiceNumber(
    req.params.invoiceNumber
  );
  response.ok(res, invoice);
});

module.exports = {
  list,
  getById,
  getByNumber,
};