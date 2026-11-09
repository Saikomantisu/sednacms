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
export const RASTER_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];
export const SVG_TYPE = 'image/svg+xml';
export const IMAGE_TYPES = [...RASTER_IMAGE_TYPES, SVG_TYPE];
export const MAX_SVG_BYTES = 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  [SVG_TYPE]: 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
export const MEDIA_TYPES = Object.keys(MEDIA_EXTENSIONS);
export const MAX_MEDIA_BYTES = MAX_VIDEO_BYTES;
export function maxMediaBytes(type: string): number {
  if (type === SVG_TYPE) return MAX_SVG_BYTES;
  if (RASTER_IMAGE_TYPES.includes(type)) return MAX_IMAGE_BYTES;
  if (type === 'video/mp4' || type === 'video/webm') return MAX_VIDEO_BYTES;
  return 0;
}
export function mediaSizeError(type: string) {
  return type === SVG_TYPE
    ? 'Choose an SVG up to 1 MB.'
    : type.startsWith('video/')
      ? 'Choose an MP4 or WebM video up to 100 MB.'
      : 'Choose a JPEG, PNG, WebP, GIF, or AVIF image up to 32 MB.';
}

export interface UploadConfig {
  provider: StorageAdapter['provider'];
  maxBytes: number;
  limits: Record<string, number>;
  types: string[];
  image: ImageProcessingOptions | false;
}

export interface SignedUpload {
  url: string;
  src: string;
  headers: Record<string, string>;
}
