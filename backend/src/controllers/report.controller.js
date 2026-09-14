const reportsService = require('../services/reports.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const makeRowHandler = (fn) =>
  asyncHandler(async (req, res) => {
    const { summary, items, pagination } = await fn(req.query);
    response.paginated(res, { summary, items }, pagination);
  });

const sales = makeRowHandler(reportsService.sales);
const purchases = makeRowHandler(reportsService.purchases);
const expenses = makeRowHandler(reportsService.expenses);
const income = makeRowHandler(reportsService.income);
const stock = makeRowHandler(reportsService.stock);
const credit = makeRowHandler(reportsService.credit);
const customers = makeRowHandler(reportsService.customers);
const products = makeRowHandler(reportsService.products);
const suppliers = makeRowHandler(reportsService.suppliers);

const profit = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const summary = await reportsService.profit({ fromDate, toDate });
  response.ok(res, summary);
});

module.exports = {
  sales,
  purchases,
  expenses,
  income,
  profit,
  stock,
  credit,
  customers,
  products,
  suppliers,
};