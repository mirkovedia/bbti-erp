# Diseño: Subida de documentos (BBTI ERP)

**Fecha:** 2026-06-01
**Feature:** Permitir subir, descargar y eliminar documentos por proyecto desde la pestaña Ingeniería.

## Contexto

La página global `/documentos` ya lista documentos (tabla `proyecto_documentos`) y genera URLs firmadas de descarga, pero **no existe forma de subir archivos**. El bucket de Storage `bbti-documentos` no existe todavía. La pestaña Ingeniería del detalle de proyecto maneja estado de planos y observaciones, pero no documentos.

## Alcance (decisiones tomadas)

- **Ubicación de la subida:** solo en la pestaña Ingeniería del detalle de proyecto. Cada documento queda ligado a ese proyecto.
- **Tipos de archivo:** todos. **Tamaño máximo:** 25MB por archivo.
- **Permisos:**
  - Subir: cualquier usuario autenticado.
  - Descargar: cualquier usuario autenticado.
  - Eliminar: solo Administrador.

## Enfoque elegido: URL de subida firmada (signed upload URL)

El navegador no sube directamente al Storage (evita necesitar políticas RLS de Storage abiertas) ni a través de nuestra API (Vercel limita el body a 4.5MB, incompatible con 25MB). En su lugar:

1. El navegador pide a nuestra API una URL de subida firmada temporal.
2. La API (con service role) valida auth + que el proyecto exista, y genera la URL con `createSignedUploadUrl`.
3. El navegador sube el archivo directo a esa URL firmada (`uploadToSignedUrl`), sin pasar por nuestra API ni por límites de body.
4. El navegador llama a la API para registrar los metadatos del documento.

**Ventajas:** soporta 25MB, no requiere ninguna política RLS de Storage (todo el acceso es server-side con service role), y centraliza auth/permisos en la API.

## Componentes

### 1. Bucket de Storage
- `bbti-documentos`, privado, `fileSizeLimit: 25MB` (forzado a nivel de bucket).
- Creado programáticamente con el service role vía `scripts/setup-storage.mjs` (idempotente: no falla si ya existe).
- **Sin políticas RLS de Storage**: subir/descargar/borrar van por la API con service role.

### 2. API `/api/documentos` (refactor)

| Método/Ruta | Body / Query | Acción | Auth |
|---|---|---|---|
| `GET /api/documentos` | `?proyecto_id=<id>` (opcional) | Lista documentos; filtra por proyecto si se pasa | Autenticado (401 si no) |
| `POST /api/documentos/upload-url` | `{ proyecto_id, filename }` | Valida proyecto; devuelve `{ path, token, signedUrl }` para subir | Autenticado |
| `POST /api/documentos` | `{ proyecto_id, nombre, tipo, storage_path }` | Inserta fila en `proyecto_documentos` con `subido_por = nombre del usuario` | Autenticado |
| `POST /api/documentos/download-url` | `{ storage_path }` | Devuelve URL firmada de descarga (1h). Valida que el documento exista | Autenticado |
| `DELETE /api/documentos/[id]` | — | Borra el objeto en Storage + la fila | **Solo Administrador** |

- Todas las operaciones de Storage usan el cliente admin (service role).
- `path` de subida: `${proyecto_id}/${uuid}-${filename_saneado}`.
- `tipo` se deriva de la extensión del archivo.
- El endpoint `POST /api/documentos/download-url` reemplaza al actual `POST /api/documentos` (la página `/documentos` se actualiza para usar la nueva ruta).

### 3. Frontend: pestaña Ingeniería (`TabIngenieria.tsx`)
Nueva sección "Documentos" debajo de Observaciones:
- **Zona de subida** (input file + drag-drop). Validación de 25MB en cliente antes de subir. Spinner/barra durante la subida.
- **Lista de documentos** del proyecto: ícono por tipo, nombre, fecha, "subido por". Botón **descargar** (todos) y **eliminar** (solo si `user.rol === 'Administrador'`).
- Flujo de subida: elegir archivo → `POST /upload-url` → `supabase.storage.uploadToSignedUrl` → `POST` metadatos → refetch del proyecto (`onUpdate`).
- Tras eliminar: refetch del proyecto.

### 4. Datos y tipos
- El GET de detalle (`/api/proyectos/[id]`) incluye `documentos` (fila de `proyecto_documentos` del proyecto, ordenadas por `created_at` desc).
- `types/index.ts`: nuevo tipo `Documento { id, proyecto_id, nombre, tipo, storage_path, subido_por, created_at }`; añadir `documentos?: Documento[]` a `Proyecto`.

## Flujo de datos (subida)

```
[TabIngenieria] elegir archivo (valida <=25MB)
      │  POST /api/documentos/upload-url { proyecto_id, filename }
      ▼
[API] auth + valida proyecto → admin.storage.createSignedUploadUrl(path)
      │  { path, token }
      ▼
[TabIngenieria] supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)
      │  (subida directa al Storage)
      ▼
[TabIngenieria] POST /api/documentos { proyecto_id, nombre, tipo, storage_path: path }
      │
      ▼
[API] inserta fila en proyecto_documentos (subido_por = nombre)
      │
      ▼
[TabIngenieria] refetch del proyecto → lista actualizada
```

## Manejo de errores
- Cliente: archivo > 25MB → mensaje sin subir. Fallo de subida o de red → toast/mensaje, no se inserta metadato.
- API: 401 sin sesión; 404 si el proyecto/documento no existe; 403 al eliminar sin ser Admin; 500 con `console.error` y shape `{ error }`.
- Si la subida al Storage tiene éxito pero falla el insert de metadatos, el objeto queda huérfano en Storage (aceptable; se puede limpiar luego). No se reintenta automáticamente.

## Testing (E2E con Playwright)
Nuevo script o extensión de `e2e-sweep.mjs`:
1. Login como Admin → abrir detalle PR-01-2026 → pestaña Ingeniería.
2. Subir un archivo de prueba pequeño → aparece en la lista.
3. Descargar → la URL firmada responde 200.
4. Eliminar como Admin → desaparece de la lista y del Storage.
5. Verificar (vía service role) que el objeto fue borrado del bucket.

## Fuera de alcance (YAGNI)
- Versionado de documentos.
- Vista previa en línea (preview) de PDFs/imágenes.
- Subida desde la página global `/documentos`.
- Carpetas/categorías de documentos.
- Subida en otras pestañas (Comercial, Producción, etc.).
