import { createClient } from '@/lib/supabase/client';
import { DOCUMENTOS_BUCKET, MAX_FILE_SIZE } from '@/lib/constants';

/**
 * Sube un archivo al Storage y registra sus metadatos como documento del proyecto.
 * El `prefix` clasifica el documento por área/tipo (ver DOC_PREFIX en constants).
 * Lanza Error con mensaje legible si algo falla.
 */
export const subirDocumento = async (
  proyectoId: string,
  file: File,
  prefix = ''
): Promise<void> => {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('El archivo supera el límite de 25MB.');
  }

  const urlRes = await fetch('/api/documentos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, filename: file.name }),
  });
  if (!urlRes.ok) throw new Error('No se pudo iniciar la subida');
  const { path, token } = await urlRes.json();

  const supabase = createClient();
  const { error: upErr } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .uploadToSignedUrl(path, token, file);
  if (upErr) throw new Error(upErr.message);

  const tipo = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null;
  const metaRes = await fetch('/api/documentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, nombre: prefix + file.name, tipo, storage_path: path }),
  });
  if (!metaRes.ok) throw new Error('No se pudo registrar el documento');
};
