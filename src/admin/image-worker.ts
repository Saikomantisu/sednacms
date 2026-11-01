import avifUrl from '@jsquash/avif/codec/enc/avif_enc.wasm?url';
import jpegUrl from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url';
import resizeUrl from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url';
import webpUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import type { ImageProcessingOptions } from '../storage/config.js';
import { processPixels } from './image-codecs.js';

const urls = { avif: avifUrl, jpg: jpegUrl, webp: webpUrl, resize: resizeUrl };
self.onmessage = async (
  event: MessageEvent<{ image: ImageData; options: ImageProcessingOptions }>,
) => {
  try {
    const result = await processPixels(event.data.image, event.data.options, async (codec) => {
      const response = await fetch(urls[codec]);
      if (!response.ok) throw new Error('Could not load image encoder');
      return response.arrayBuffer();
    });
    self.postMessage(result, { transfer: [result.buffer] });
  } catch {
    self.postMessage({ error: 'Image processing failed' });
  }
};
