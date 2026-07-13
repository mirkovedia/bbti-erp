/**
 * Sube un archivo a R2 (PUT directo con URL firmada) y registra sus metadatos.
 * El `prefix` clasifica el documento por área/tipo (ver DOC_PREFIX en constants).
 * El límite de tamaño lo valida el SERVIDOR (env MAX_UPLOAD_MB) y su mensaje
 * de error se propaga tal cual al usuario.
 * Lanza Error con mensaje legible si algo falla.
 */
export const subirDocumento = async (
  proyectoId: string,
  file: File,
  prefix = ''
): Promise<void> => {
  const contentType = file.type || 'application/octet-stream';
  const urlRes = await fetch('/api/documentos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, filename: file.name, content_type: contentType, size: file.size }),
  });
  if (!urlRes.ok) {
    const body = await urlRes.json().catch(() => null);
    throw new Error(body?.error || 'No se pudo iniciar la subida');
  }
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
