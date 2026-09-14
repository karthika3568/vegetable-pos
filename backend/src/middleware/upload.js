const multer = require('multer');

const ApiError = require('../utils/ApiError');
const { MAX_IMAGE_BYTES } = require('../config/storage');
const imageFile = require('../utils/imageFile');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 0,
  },
  fileFilter(req, file, cb) {
    if (!imageFile.isAllowedExtension(file.originalname)) {
      return cb(new ApiError(400, 'Only JPEG, PNG, GIF or WebP images are supported.'));
    }
    if (!imageFile.isAllowedMimeType(file.mimetype)) {
      return cb(new ApiError(400, 'Only JPEG, PNG, GIF or WebP images are supported.'));
    }
    return cb(null, true);
  },
});

function handleImageUpload(fieldName, req, res, next) {
  upload.single(fieldName)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          ApiError.badRequest(`Image must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller.`)
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(ApiError.badRequest('Upload one image file at a time.'));
      }
      return next(ApiError.badRequest('Image upload failed. Please try again.'));
    }

    if (err instanceof ApiError) return next(err);
    return next(err);
  });
}

function uploadProductImage(req, res, next) {
  return handleImageUpload('image', req, res, next);
}

function uploadInvoiceImageOptional(req, res, next) {
  return handleImageUpload('invoiceImage', req, res, next);
}

module.exports = {
  uploadProductImage,
  uploadInvoiceImageOptional,
  upload,
};