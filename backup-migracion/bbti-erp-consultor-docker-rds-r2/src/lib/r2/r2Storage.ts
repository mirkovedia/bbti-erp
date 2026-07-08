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
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  });

  await r2Client.send(command);

  return {
    bucket,
    key: params.key,
  };
}

export async function deleteFromR2(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await r2Client.send(command);

  return {
    bucket,
    key,
    deleted: true,
  };
}

export async function getR2SignedUrl(key: string, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  });
}
