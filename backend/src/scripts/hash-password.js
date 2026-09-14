/**
 * Generates a bcrypt hash for a given plaintext password.
 *
 * Needed because this project's seed data must contain a REAL bcrypt
 * hash for the login flow to work - a placeholder string is not
 * enough. Run this locally (after `npm install`) and paste the output
 * into database/seed.sql (or use it directly when creating an
 * employee via the API).
 *
 * Usage:
 *   node src/scripts/hash-password.js "YourPasswordHere"
 */

const bcrypt = require('bcryptjs');

const plainPassword = process.argv[2];
if (!plainPassword) {
  console.error('Usage: node src/scripts/hash-password.js "YourPasswordHere"');
  process.exit(1);
}

bcrypt.hash(plainPassword, 10).then((hash) => {
  console.log(hash);
});
