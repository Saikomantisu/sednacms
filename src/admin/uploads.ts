import type { ImageValue } from '../fields.js';
import type { SignedUpload, UploadConfig } from '../storage/config.js';
import type { UploadthingRouter } from '../storage/uploadthing.js';
import { api } from './api.js';
import { prepareImage } from './image-processing.js';

export type UploadProgress =
  | { stage: 'preparing' | 'finalizing' }
  | { stage: 'uploading'; percent?: number };

export async function uploadImage(
  file: File,
  progress: (progress: UploadProgress) => void,
): Promise<ImageValue> {
  progress({ stage: 'preparing' });
  const config = await api<UploadConfig>('uploads');
  const prepared = await prepareImage(file, config.image);
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
    const [uploaded] = await uploadFiles('image', {
      files: [file],
      signal: AbortSignal.timeout(120000),
      onUploadProgress: ({ progress: percent }) => transferred(percent),
    });
    src = uploaded.ufsUrl;
  } else {
    const signed = await api<SignedUpload>('uploads', 'POST', { type: file.type, size: file.size });
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
        reject(new Error('Could not reach image storage. Check your connection and try again.'));
      xhr.ontimeout = () => reject(new Error('Upload timed out. Try again.'));
      transferred(0);
      xhr.send(file);
    });
    src = signed.src;
  }
  return { src, width: prepared.width, height: prepared.height, alt: '' };
}
