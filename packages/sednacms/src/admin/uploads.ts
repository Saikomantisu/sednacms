import type { MediaFile } from '../api/media.js';
import type { ImageValue } from '../fields.js';
import type { SignedUpload, UploadConfig } from '../storage/config.js';
import {
  IMAGE_TYPES,
  MEDIA_TYPES,
  maxMediaBytes,
  mediaSizeError,
  SVG_TYPE,
} from '../storage/config.js';
import type { UploadthingRouter } from '../storage/uploadthing.js';
import type { UploadProgress } from './adapter.js';
import { getAdminAdapter } from './adapter.js';
import { api, RequestError } from './api.js';
import { prepareImage } from './image-processing.js';

export type { UploadProgress } from './adapter.js';

export async function uploadImage(
  file: File,
  progress: (progress: UploadProgress) => void,
): Promise<ImageValue> {
  const adapter = getAdminAdapter();
  if (adapter) return adapter.uploadImage(file, progress);
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Choose a supported image.');
  const media = await uploadMedia(file, progress, null, 'image');
  return { src: media.src, width: Number(media.width), height: Number(media.height), alt: '' };
}

export async function uploadMedia(
  file: File,
  progress: (progress: UploadProgress) => void,
  folder_id: string | null = null,
  kind: 'image' | 'media' = 'media',
): Promise<MediaFile> {
  if (!MEDIA_TYPES.includes(file.type))
    throw new Error('Choose an image, GIF, SVG, MP4, or WebM file.');
  if (file.size < 1 || file.size > maxMediaBytes(file.type))
    throw new Error(mediaSizeError(file.type));
  if (file.type === SVG_TYPE) {
    progress({ stage: 'preparing' });
    const descriptor = await api<Record<string, unknown>>('uploads?kind=svg', 'POST', file, {
      'X-Sedna-Filename': encodeURIComponent(file.name),
    });
    progress({ stage: 'finalizing' });
    return (await api<{ media: MediaFile }>('media', 'POST', { ...descriptor, folder_id })).media;
  }
  progress({ stage: 'preparing' });
  const path = kind === 'media' ? 'uploads?kind=media' : 'uploads';
  const config = await api<UploadConfig>(path);
  const prepared = IMAGE_TYPES.includes(file.type)
    ? await prepareImage(file, config.image)
    : { file, width: null, height: null };
  file = prepared.file;
  const transferred = (percent?: number) => {
    if (percent !== undefined && percent >= 100) progress({ stage: 'finalizing' });
    else progress({ stage: 'uploading', percent });
  };
  let src: string;
  if (config.provider === 'uploadthing') {
    const { genUploader } = await import('uploadthing/client');
    const { uploadFiles } = genUploader<UploadthingRouter>({ url: '/api/cms/uploads' });
    transferred(0);
    const [uploaded] = await uploadFiles(kind, {
      files: [file],
      signal: AbortSignal.timeout(120000),
      onUploadProgress: ({ progress: percent }) => transferred(percent),
    });
    src = uploaded.ufsUrl;
  } else {
    const signed = await api<SignedUpload>(path, 'POST', { type: file.type, size: file.size });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signed.url);
      xhr.timeout = 120000;
      for (const [key, value] of Object.entries(signed.headers)) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (event) => {
        transferred(
          event.lengthComputable && event.total > 0
            ? (event.loaded / event.total) * 100
            : undefined,
        );
      };
      xhr.upload.onload = () => progress({ stage: 'finalizing' });
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('Upload failed. Try again.'));
      xhr.onerror = () =>
        reject(new Error('Could not reach file storage. Check your connection and try again.'));
      xhr.ontimeout = () => reject(new Error('Upload timed out. Try again.'));
      transferred(0);
      xhr.send(file);
    });
    src = signed.src;
  }
  progress({ stage: 'finalizing' });
  try {
    const { media } = await api<{ media: MediaFile }>('media', 'POST', {
      name: file.name,
      src,
      type: file.type,
      size: file.size,
      width: prepared.width,
      height: prepared.height,
      folder_id,
    });
    return media;
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) throw error;
    throw new Error(
      'The file is in storage, but we couldn’t add it to the media library. Try again.',
    );
  }
}
