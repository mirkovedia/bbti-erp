import { S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2 expone API compatible S3: mismo SDK, endpoint propio y region "auto".
export const r2Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  // MinIO (dev local) requiere path-style; R2 real no lo necesita (default false)
  forcePathStyle: process.env.R2_FORCE_PATH_STYLE === 'true',
});
