import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "./r2Client";

const bucket = process.env.R2_BUCKET || "data-prod";

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

  return {
    bucket,
    key: params.key,
  };
}

export async function deleteFromR2(key: string) {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return {
    bucket,
    key,
    deleted: true,
  };
}

export async function getR2SignedUrl(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );
}
