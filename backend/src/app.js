/**
 * Express application: middleware pipeline + route mounting only.
 * No server.listen() here - that's server.js, so this module can be
 * required standalone (e.g. by tests) without side effects.
 *
 * Pipeline order matters:
 *   security headers -> CORS -> body parsing -> request logging
 *   -> versioned API routes -> 404 -> centralized error handler (last)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { corsOrigins } = require('./config/env');
const { uploadsRoot, uploadsUrlBase } = require('./config/storage');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health.routes');
const docsRoutes = require('./routes/docs.routes');
const apiRoutes = require('./routes');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLogger);

app.use(uploadsUrlBase, express.static(uploadsRoot, {
  fallthrough: true,
  index: false,
  maxAge: '7d',
}));

// Unversioned, unauthenticated - for load balancers / uptime monitors.
app.use('/health', healthRoutes);

// Dependency-free OpenAPI documentation. The default Helmet CSP stays
// active globally; docs.routes.js applies its own relaxed CSP only to
// the HTML UI at /api-docs (never to the business API).
app.use('/api-docs', docsRoutes);

// Versioned business API - this is the contract the React frontend integrates against.
app.use('/api/v1', apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
