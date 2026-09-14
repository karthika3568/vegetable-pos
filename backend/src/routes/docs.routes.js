/**
 * Interactive API documentation.
 *
 *   GET /api-docs            -> standard Swagger UI (Try it out / Execute /
 *                               Authorize / request + response examples).
 *   GET /api-docs/openapi.json -> raw OpenAPI 3 document.
 *
 * The OpenAPI document in src/docs/openapi.js is the single source of
 * truth; Swagger UI renders exactly that document against the real
 * backend APIs. A relaxed Content-Security-Policy is applied ONLY to
 * the Swagger UI HTML page so the global Helmet CSP on the business
 * API stays untouched.
 */

const { Router } = require('express');
const swaggerUi = require('swagger-ui-express');
const openApiDocument = require('../docs/openapi');

const router = Router();

// Raw OpenAPI document endpoint (unchanged).
router.get('/openapi.json', (req, res) => {
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.json(openApiDocument);
});

// CSP relaxed only for the documentation page (never the business API).
const UI_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

// Standard interactive Swagger UI from swagger-ui-express, fed with the
// real OpenAPI document so every Try it out / Execute hits the backend.
const swaggerUiHandler = swaggerUi.setup(openApiDocument, {
  customSiteTitle: `${openApiDocument.info.title} ${openApiDocument.info.version} - API Reference`,
});

// Swagger UI static assets (swagger-ui.css, bundle JS, init JS, ...).
router.use('/', swaggerUi.serve);

router.get('/', (req, res) => {
  // Normalize /api-docs -> /api-docs/ so the page's relative asset URLs
  // (./swagger-ui-bundle.js, etc.) resolve under /api-docs.
  if (!req.originalUrl.endsWith('/')) {
    return res.redirect(301, `${req.baseUrl || '/api-docs'}/`);
  }
  res.set('Content-Security-Policy', UI_CSP);
  swaggerUiHandler(req, res);
});

module.exports = router;