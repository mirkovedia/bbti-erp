// scripts/setup-storage.mjs
import { serviceClient } from './lib/supabase-test.mjs';

const BUCKET = 'bbti-documentos';
const admin = serviceClient();

const { data: buckets, error: le } = await admin.storage.listBuckets();
if (le) { console.error('✗ listBuckets:', le.message); process.exit(1); }

if (buckets?.some((b) => b.id === BUCKET)) {
  console.log(`✓ Bucket ${BUCKET} ya existe`);
} else {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 26214400, // 25 MB
  });
  if (error) { console.error('✗ createBucket:', error.message); process.exit(1); }
  console.log(`✓ Bucket ${BUCKET} creado (privado, límite 25MB)`);
}
