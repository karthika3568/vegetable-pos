/**
 * JWT sign/verify - the only place jsonwebtoken is touched directly.
 *
 * Deliberately minimal payload: { id, tokenVersion }. Role name and
 * permissions are NEVER trusted from the token - authenticate.js
 * re-fetches them fresh from the database on every request, so a
 * permission or role change (or a disable) takes effect immediately
 * instead of waiting for the token to expire.
 */

const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

function sign(user) {
  return jwt.sign(
    { id: user.id, tokenVersion: user.token_version },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );
}

function verify(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, jwtConfig.secret, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

module.exports = { sign, verify };
