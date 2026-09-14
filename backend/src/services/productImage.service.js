const fs = require('fs');
const path = require('path');

const ApiError = require('../utils/ApiError');
const imageFile = require('../utils/imageFile');
const { uploadsRoot, uploadsUrlBase, resolveFilePath } = require('../config/storage');
const productService = require('./product.service');
const productRepository = require('../repositories/product.repository');

async function ensureProduct(productId) {
  return productService.getById(productId);
}

async function unlinkIfStored(webPath) {
  const abs = resolveFilePath(webPath);
  if (!abs) return;

  try {
    await fs.promises.unlink(abs);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function attach(productId, file, actorId) {
  const current = await ensureProduct(productId);

  const ext = imageFile.detectImageExt(file && file.buffer);
  if (!ext) {
    throw ApiError.badRequest(
      'Only JPEG, PNG, GIF or WebP images are supported. The uploaded file does not look like an image.'
    );
  }

  const filename = imageFile.generateStoredName(productId, ext);
  const absolutePath = path.join(uploadsRoot, filename);
  const previousPath = current.image_path || null;

  try {
    await fs.promises.mkdir(uploadsRoot, { recursive: true });
    await fs.promises.writeFile(absolutePath, file.buffer);

    const updated = await productRepository.updateImagePath(
      productId,
      `${uploadsUrlBase}/${filename}`
    );

    if (previousPath) {
      await unlinkIfStored(previousPath);
    }

    return updated;
  } catch (error) {
    await unlinkIfStored(`${uploadsUrlBase}/${filename}`);
    throw error;
  }
}

async function remove(productId, actorId) {
  const current = await ensureProduct(productId);
  const previousPath = current.image_path || null;

  const updated = await productRepository.clearImagePath(productId);

  if (previousPath) {
    await unlinkIfStored(previousPath);
  }

  return updated;
}

module.exports = {
  attach,
  remove,
  unlinkIfStored,
};