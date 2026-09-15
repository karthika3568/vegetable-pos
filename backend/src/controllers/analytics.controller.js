/**
 * Controllers for the /analytics routes (Product Stock & Sales
 * Analytics). Thin wrappers over analytics.service - every handler
 * validates input already (middleware), calls the service and shapes
 * the ApiResponse exactly like the rest of the app.
 */

const analyticsService = require('../services/analytics.service');
const response = require('../utils/ApiResponse');

async function listProducts(req, res, next) {
  try {
    const result = await analyticsService.listProducts({ ...req.query, ...req.params });
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

async function getProduct(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const result = await analyticsService.getProduct({ ...req.query }, productId);
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

async function listSales(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const result = await analyticsService.listSales({ ...req.query }, productId);
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

async function salesByTime(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const result = await analyticsService.salesByTime({ ...req.query }, productId);
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

async function priceHistory(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const result = await analyticsService.priceHistory({ ...req.query }, productId);
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

async function priceAsOf(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const result = await analyticsService.priceAsOf({ ...req.query }, productId);
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

async function stockTransactions(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const result = await analyticsService.stockTransactions({ ...req.query }, productId);
    response.ok(res, result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProducts,
  getProduct,
  listSales,
  salesByTime,
  priceHistory,
  priceAsOf,
  stockTransactions,
};