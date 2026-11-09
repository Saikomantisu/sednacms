import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MEDIA_EXTENSIONS, type SignedUpload, SVG_TYPE } from './config.js';

function s3() {
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`sednacms: ${name} is required for S3 uploads`);
    return value;
  };
  const publicUrl = new URL(required('SEDNA_S3_PUBLIC_URL'));
  if (
    publicUrl.protocol !== 'https:' ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.username ||
    publicUrl.password
  )
    throw new Error('sednacms: SEDNA_S3_PUBLIC_URL must be a public HTTPS URL');
  return {
    publicUrl: publicUrl.href.replace(/\/$/, ''),
    bucket: required('SEDNA_S3_BUCKET'),
    client: new S3Client({
      endpoint: required('SEDNA_S3_ENDPOINT'),
      region: process.env.SEDNA_S3_REGION || 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: required('SEDNA_S3_KEY'),
        secretAccessKey: required('SEDNA_S3_SECRET'),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    }),
  };
}
export async function signS3Upload(file: { type: string; size: number }): Promise<SignedUpload> {
  const { client, bucket, publicUrl } = s3();
  const key = `sedna/${randomUUID()}.${MEDIA_EXTENSIONS[file.type]}`;
  try {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: file.type,
        ContentLength: file.size,
      }),
      { expiresIn: 300, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return { url, src: `${publicUrl}/${key}`, headers: { 'Content-Type': file.type } };
  } finally {
    client.destroy();
  }
}
// Only the server calls this with sanitised SVG output. SVGs never receive a public PUT signature.
export async function storeS3Svg(svg: string) {
  const { client, bucket, publicUrl } = s3();
  const key = `sedna/${randomUUID()}.svg`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: SVG_TYPE,
        ContentLength: Buffer.byteLength(svg),
        Body: Buffer.from(svg),
      }),
    );
    return `${publicUrl}/${key}`;
  } finally {
    client.destroy();
  }
}

export async function deleteS3File(key: string) {
  const { client, bucket } = s3();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(15000),
    });
  } finally {
    client.destroy();
  }
}
