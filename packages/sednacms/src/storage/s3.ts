import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SignedUpload } from './config.js';

export async function signS3Upload(file: { type: string; size: number }): Promise<SignedUpload> {
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`sednacms: ${name} is required for S3 uploads`);
    return value;
  };
  const publicUrl = new URL(required('SEDNA_S3_PUBLIC_URL'));
  if (publicUrl.protocol !== 'https:' || publicUrl.search || publicUrl.hash || publicUrl.username)
    throw new Error('sednacms: SEDNA_S3_PUBLIC_URL must be a public HTTPS URL');
  const client = new S3Client({
    endpoint: required('SEDNA_S3_ENDPOINT'),
    region: process.env.SEDNA_S3_REGION || 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: required('SEDNA_S3_KEY'),
      secretAccessKey: required('SEDNA_S3_SECRET'),
    },
    // Avoid optional SDK checksum headers that some S3-compatible stores do not support.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
  const key = `sedna/${randomUUID()}.${extension}`;
  try {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: required('SEDNA_S3_BUCKET'),
        Key: key,
        ContentType: file.type,
        ContentLength: file.size,
      }),
      { expiresIn: 300, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return {
      url,
      src: `${publicUrl.href.replace(/\/$/, '')}/${key}`,
      headers: { 'Content-Type': file.type },
    };
  } finally {
    client.destroy();
  }
}
