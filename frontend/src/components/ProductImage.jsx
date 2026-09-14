import { useState } from 'react';
import { imageUrl } from '../utils/imageUrl.js';

/**
 * Product image thumbnail with a clean default placeholder.
 *
 * A failed/absent image (no path, broken file, loading error) always
 * falls back to the placeholder - the POS and product list never show
 * broken-image icons. Images are lazy-loaded so list/POS rendering is
 * never blocked by picture downloads.
 */
export default function ProductImage({ source, alt = '', className = '', lazy = true, size = 'thumb' }) {
  const [failed, setFailed] = useState(false);
  const url = source ? imageUrl(source) : null;
  const show = url && !failed;
  const cls = ['product-image', `product-image-${size}`, className].filter(Boolean).join(' ');

  return (
    <span className={`${cls}${show ? '' : ' has-placeholder'}`}>
      {show ? (
        <img
          src={url}
          alt={alt}
          loading={lazy ? 'lazy' : undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="product-image-placeholder" aria-hidden="true" />
      )}
    </span>
  );
}