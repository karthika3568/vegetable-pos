const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(process.cwd(), 'uploads', 'product-images');
const uploadsUrlBase = '/uploads/product-images';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function ensureUploadsDir() {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

function resolveFilePath(webPath) {
  if (!webPath || !webPath.startsWith(uploadsUrlBase + '/')) return null;
  const clean = webPath.replace(/\\/g, '/');
  if (clean.split('/').some((part) => part === '..')) return null;
  return path.join(uploadsRoot, path.basename(clean));
}

ensureUploadsDir();

module.exports = {
  uploadsRoot,
  uploadsUrlBase,
  MAX_IMAGE_BYTES,
  ensureUploadsDir,
  resolveFilePath,
};