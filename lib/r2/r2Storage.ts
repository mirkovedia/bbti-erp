import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client } from './r2Client';

const bucket = process.env.R2_BUCKET || '';

export async function uploadToR2(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
  return { bucket, key: params.key };
}

export async function deleteFromR2(key: string) {
  await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { bucket, key, deleted: true };
}

/** URL firmada de DESCARGA (GET). `filename` fuerza descarga con nombre legible. */
export async function getR2SignedUrl(key: string, expiresInSeconds = 3600, filename?: string) {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }
        : {}),
    }),
    { expiresIn: expiresInSeconds }
  );
}

/** URL firmada de SUBIDA (PUT) — reemplaza createSignedUploadUrl de Supabase.
 *  El navegador sube directo con fetch PUT; el archivo no pasa por el server.
 *  `contentLength` viaja FIRMADO: el storage rechaza cuerpos de otro tamaño,
 *  así el límite de 25MB se hace cumplir server-side (no solo en el cliente). */
export async function getR2UploadUrl(
  key: string,
  contentType?: string,
  contentLength?: number,
  expiresInSeconds = 600
) {
  return getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ...(contentLength ? { ContentLength: contentLength } : {}),
    }),
    { expiresIn: expiresInSeconds }
  );
}
