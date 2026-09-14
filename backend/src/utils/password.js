/**
 * Password hashing - the only place bcrypt is touched directly.
 * Uses bcryptjs (pure JS) rather than native bcrypt so it installs
 * identically everywhere with no compiler/toolchain required.
 */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hash(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function compare(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hash, compare };
