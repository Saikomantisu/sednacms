/** Serializable storage configuration. Credentials are read from runtime environment variables. */
export interface StorageAdapter {
  provider: 'uploadthing' | 's3';
  image?: false | Partial<ImageProcessingOptions>;
}

export interface ImageProcessingOptions {
  format: 'webp' | 'jpg' | 'avif';
  maxWidth: number;
  maxHeight: number;
  /** Output quality between 0 and 1, for all formats. */
  quality: number;
}

export function resolveImageProcessing(
  image: StorageAdapter['image'],
): ImageProcessingOptions | false {
  if (image === false) return false;
  const options: ImageProcessingOptions = {
    format: 'webp',
    maxWidth: 2560,
    maxHeight: 2560,
    quality: 0.8,
    ...image,
  };
  if (!['webp', 'jpg', 'avif'].includes(options.format))
    throw new Error('Image format must be webp, jpg, or avif.');
  for (const size of [options.maxWidth, options.maxHeight]) {
    if (!Number.isInteger(size) || size < 1 || size > 16384)
      throw new Error('Image maximum dimensions must be integers between 1 and 16384.');
  }
  if (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1)
    throw new Error('Image quality must be between 0 and 1.');
  return options;
}

export function uploadthingStorage(options: Pick<StorageAdapter, 'image'> = {}): StorageAdapter {
  return { provider: 'uploadthing', image: resolveImageProcessing(options.image) };
}

export function s3Storage(options: Pick<StorageAdapter, 'image'> = {}): StorageAdapter {
  return { provider: 's3', image: resolveImageProcessing(options.image) };
}

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export interface UploadConfig {
  provider: StorageAdapter['provider'];
  maxBytes: number;
  types: string[];
  image: ImageProcessingOptions | false;
}

export interface SignedUpload {
  url: string;
  src: string;
  headers: Record<string, string>;
}
