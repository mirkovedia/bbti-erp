import { MAX_FILE_SIZE } from '@/lib/constants';

/**
 * Sube un archivo a R2 (PUT directo con URL firmada) y registra sus metadatos.
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

  const contentType = file.type || 'application/octet-stream';
  const urlRes = await fetch('/api/documentos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, filename: file.name, content_type: contentType, size: file.size }),
  });
  if (!urlRes.ok) throw new Error('No se pudo iniciar la subida');
  const { path, url } = await urlRes.json();

  // PUT directo al bucket (requiere CORS del bucket para este origen)
  const putRes = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!putRes.ok) throw new Error('No se pudo subir el archivo al almacenamiento');

  const tipo = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null;
  const metaRes = await fetch('/api/documentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, nombre: prefix + file.name, tipo, storage_path: path }),
  });
  if (!metaRes.ok) throw new Error('No se pudo registrar el documento');
};
