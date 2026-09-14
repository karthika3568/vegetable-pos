const crypto = require('crypto');

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const MAGIC_PATTERNS = [
  {
    ext: 'jpg',
    match: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    ext: 'png',
    match: (buffer) => buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a,
  },
  {
    ext: 'gif',
    match: (buffer) => buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38,
  },
  {
    ext: 'webp',
    match: (buffer) => buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP',
  },
];

function detectImageExt(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  for (const pattern of MAGIC_PATTERNS) {
    if (pattern.match(buffer)) return pattern.ext;
  }

  return null;
}

function isAllowedExtension(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = filename.slice(dot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function isAllowedMimeType(mimetype) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(String(mimetype || '').toLowerCase());
}

function generateStoredName(productId, ext) {
  const safeExt = IMAGE_EXTENSIONS.includes(ext) ? ext : 'jpg';
  return `${String(productId)}-${crypto.randomBytes(12).toString('hex')}.${safeExt}`;
}

module.exports = {
  IMAGE_EXTENSIONS,
  detectImageExt,
  isAllowedExtension,
  isAllowedMimeType,
  generateStoredName,
};