const branchService = require('../services/branch.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { status, search } = req.query;

  const items = await branchService.list({ status, search });

  response.ok(res, items);
});

const getById = asyncHandler(async (req, res) => {
  const branch = await branchService.getById(Number(req.params.id));

  response.ok(res, branch);
});

const create = asyncHandler(async (req, res) => {
  const branch = await branchService.create({
    name: req.body.name,
    address: req.body.address,
    phone: req.body.phone,
    gstin: req.body.gstin,
    invoiceHeader: req.body.invoiceHeader,
    invoiceFooter: req.body.invoiceFooter,
  });

  response.created(res, branch, 'Branch created');
});

const update = asyncHandler(async (req, res) => {
  const branch = await branchService.update(Number(req.params.id), {
    name: req.body.name,
    address: req.body.address,
    phone: req.body.phone,
    gstin: req.body.gstin,
    invoiceHeader: req.body.invoiceHeader,
    invoiceFooter: req.body.invoiceFooter,
  });

  response.ok(res, branch, 'Branch updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const branch = await branchService.setStatus(Number(req.params.id), req.body.status);

  response.ok(res, branch, 'Branch status updated');
});

const listProducts = asyncHandler(async (req, res) => {
  const items = await branchService.listProducts(Number(req.params.id));

  response.ok(res, items);
});

const setProducts = asyncHandler(async (req, res) => {
  const items = await branchService.setProducts(
    Number(req.params.id),
    (req.body.productIds || []).map((id) => Number(id))
  );

  response.ok(res, items, 'Branch product availability updated');
});

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
  listProducts,
  setProducts,
};
