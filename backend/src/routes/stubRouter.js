const express = require('express');
const { notImplemented } = require('../controllers/placeholder.controller');

/**
 * Builds a router with the standard REST verbs wired to the
 * placeholder controller, so the module's URL surface exists (and
 * returns a clear 501) before its real business logic lands in a
 * later phase. Each module route file below stays a distinct file so
 * a future phase can flesh out exactly one of them without touching
 * the rest.
 */
function buildStubRouter() {
  const router = express.Router();
  router.get('/', notImplemented);
  router.get('/:id', notImplemented);
  router.post('/', notImplemented);
  router.put('/:id', notImplemented);
  router.delete('/:id', notImplemented);
  return router;
}

module.exports = buildStubRouter;
