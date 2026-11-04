import { IMAGE_TYPES, type ImageProcessingOptions, MAX_IMAGE_BYTES } from '../storage/config.js';

export async function prepareImage(file: File, options: ImageProcessingOptions | false) {
  if (!IMAGE_TYPES.includes(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES)
    throw new Error('Choose a JPEG, PNG, WebP, GIF, or AVIF image up to 32 MB.');

  const localUrl = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    image.src = localUrl;
    try {
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Invalid image dimensions');
    } catch {
      throw new Error('This image could not be opened. Try a JPEG, PNG, or WebP copy.');
    }
    if (options === false) return { file, width: image.naturalWidth, height: image.naturalHeight };

    // Canvas only decodes pixels and flattens transparency for JPG. jSquash
    // performs the resize and encoding in a worker.
    canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not process the image. Try another browser.');
    if (options.format === 'jpg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.height = 0;
    const { buffer, width, height } = await processImage(pixels, options);
    const type = options.format === 'jpg' ? 'image/jpeg' : `image/${options.format}`;
    const blob = new Blob([buffer], { type });
    if (!blob.size || blob.size > MAX_IMAGE_BYTES)
      throw new Error('The processed image exceeds 32 MB. Choose a smaller image.');
    const name = file.name.replace(/\.[^.]*$/, '') || 'image';
    return {
      file: new File([blob], `${name}.${options.format}`, { type }),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(localUrl);
    // Release the canvas buffer after encoding, including failed conversions.
    if (canvas) canvas.width = canvas.height = 0;
  }
}

type ProcessedImage = { buffer: ArrayBuffer; width: number; height: number };

async function processImage(
  image: ImageData,
  options: ImageProcessingOptions,
): Promise<ProcessedImage> {
  const worker = new Worker(new URL('./image-worker.js', import.meta.url), { type: 'module' });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<ProcessedImage>((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Image processing timed out. Try a smaller image.')),
        120000,
      );
      worker.onmessage = (event: MessageEvent<ProcessedImage & { error?: string }>) => {
        if (event.data.buffer) resolve(event.data);
        else reject(new Error('Could not process the image. Try a smaller image.'));
      };
      worker.onerror = () => reject(new Error('Could not load the image encoder. Try again.'));
      worker.onmessageerror = () =>
        reject(new Error('Could not read the processed image. Try again.'));
      worker.postMessage({ image, options }, [image.data.buffer]);
    });
  } finally {
    clearTimeout(timeout);
    worker.terminate();
  }
}
