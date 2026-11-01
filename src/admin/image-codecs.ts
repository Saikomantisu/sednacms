import createAvif from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions as avifOptions } from '@jsquash/avif/meta.js';
import createJpeg from '@jsquash/jpeg/codec/enc/mozjpeg_enc.js';
import { defaultOptions as jpegOptions } from '@jsquash/jpeg/meta.js';
import resize, { initResize } from '@jsquash/resize';
import createWebp from '@jsquash/webp/codec/enc/webp_enc.js';
import { defaultOptions as webpOptions } from '@jsquash/webp/meta.js';
import type { ImageProcessingOptions } from '../storage/config.js';

export type Codec = ImageProcessingOptions['format'] | 'resize';

/** Single-threaded codecs run inside our worker without cross-origin isolation headers. */
export async function processPixels(
  image: ImageData,
  options: ImageProcessingOptions,
  loadWasm: (codec: Codec) => Promise<ArrayBuffer>,
) {
  const scale = Math.min(1, options.maxWidth / image.width, options.maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  if (width !== image.width || height !== image.height) {
    await initResize(await loadWasm('resize'));
    image = await resize(image, { width, height, method: 'lanczos3' });
  }
  const wasmBinary = await loadWasm(options.format);
  const quality = Math.round(options.quality * 100);
  let output: Uint8Array | null;
  if (options.format === 'avif') {
    const encoder = await createAvif({ wasmBinary });
    output = encoder.encode(image.data, width, height, { ...avifOptions, quality });
  } else if (options.format === 'jpg') {
    const encoder = await createJpeg({ wasmBinary });
    output = encoder.encode(image.data, width, height, { ...jpegOptions, quality });
  } else {
    const encoder = await createWebp({ wasmBinary });
    output = encoder.encode(image.data, width, height, { ...webpOptions, quality });
  }
  if (!output?.length) throw new Error('Image encoding failed');
  return { buffer: output.slice().buffer, width, height };
}
