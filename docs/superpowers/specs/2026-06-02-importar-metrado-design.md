# Diseño: Importar metrado (Excel) → materiales en Logística

**Fecha:** 2026-06-02
**Feature:** En el tab Comercial, subir un Excel de metrado (cotización BBTI). El sistema lo lee, extrae los materiales y los carga automáticamente en el tab Logística del mismo proyecto.

## Contexto

- El tab **Comercial** hoy tiene un campo "Metrado" de texto simple (`comercial.metrado`).
- El tab **Logística** maneja materiales `{id, nombre, cantidad, unidad, comprado, estado}` en la tabla `proyecto_materiales`, con alta/edición/baja y guardado por reemplazo total vía `PATCH /api/proyectos/[id]` (body `materiales`).
- El Excel real (`metrado.xlsx`, 1.1MB, 14 hojas) tiene la cotización en la hoja **"COT"**: encabezado `ITEM | CANT. | DESCRIPCIÓN | P. UNITARIO | P. TOTAL | ESPECIFICACIÓN`, ~112 ítems-material en la tabla principal (hasta la fila "PRECIO TOTAL"). Debajo hay desgloses por ítem que se ignoran. Filas de categoría (ITEM entero sin cantidad) se saltan.

## Decisiones tomadas

- **Alcance: Rico.** Capturar `codigo` y `precio_unitario` del Excel; enriquecer Logística para mostrar código / precio unit / precio total.
- **Comportamiento: vista previa + reemplazar.** Mostrar cuántos materiales se detectaron + preview, y al confirmar reemplazar los materiales de Logística.
- **Parseo: en el cliente** (navegador) con la librería `xlsx` (ya es dependencia).

## Componentes

### 1. Parser puro — `lib/utils/parse-metrado.ts`
Función `parseMetrado(workbook: XLSX.WorkBook): { materiales: MaterialParsed[]; warnings: string[] }`.

- Elige la hoja: la llamada **"COT"** si existe; si no, la primera hoja que contenga una fila de encabezado válida.
- **Detecta la fila de encabezado** buscando una fila cuyas celdas (normalizadas: sin acentos, mayúsculas, trim) contengan "DESCRIPCION" y "CANT". Mapea los índices de columna por título: ITEM, CANT(IDAD), DESCRIPCION, P. UNITARIO, ESPECIFICACION.
- Lee las filas siguientes hasta encontrar una celda con "PRECIO TOTAL" o el fin de datos.
- Por cada fila:
  - Si no hay `DESCRIPCION` no vacía → se ignora.
  - Si no hay `CANT` numérica > 0 → fila de categoría/sección → se ignora.
  - Genera `{ codigo: String(ITEM), nombre: DESCRIPCION.trim(), cantidad: Number(CANT), unidad: 'und', comprado: 0, precio_unitario: Number(P.UNITARIO) || 0, estado: 'PENDIENTE' }`.
  - `codigo`: si el ITEM es número con decimales (p. ej. 1.0199999) se formatea a 2 decimales.
- `warnings`: si no encuentra hoja/encabezado → un warning explicativo (la UI lo muestra y no importa nada).

`MaterialParsed` = `Omit<Material, 'id'>` con `codigo` y `precio_unitario`.

### 2. Migración 003 — `supabase/migrations/003_materiales_metrado.sql`
```sql
alter table proyecto_materiales
  add column if not exists codigo text,
  add column if not exists precio_unitario numeric(12,2) default 0;
```
(El usuario la aplica en el SQL Editor de Supabase.)

### 3. Tipos — `types/index.ts`
`Material += { codigo?: string; precio_unitario?: number }`.

### 4. API — `PATCH /api/proyectos/[id]`
En el bloque de `materiales` (reemplazo total ya existente), incluir `codigo` y `precio_unitario` en el insert. El GET de detalle ya devuelve `*` de `proyecto_materiales`, así que los nuevos campos vienen solos.

### 5. UI — tab Comercial (`TabComercial.tsx`)
Sección "Metrado":
- Botón **"Importar metrado (Excel)"** (input file `.xlsx,.xls`), visible si `canEditLogistica` o `canEditComercial` (se decide: usar `canEditLogistica` porque escribe materiales de Logística).
- Al elegir archivo: leer con `XLSX.read(arrayBuffer)`, llamar `parseMetrado`.
- Mostrar un **modal de vista previa**: "Se detectaron N materiales", tabla de los primeros 10 (código, descripción, cantidad, precio unit), y el monto total (Σ cantidad×precio_unitario). Si hay warnings, mostrarlos.
- Botón **"Importar a Logística (reemplaza los actuales)"**:
  - `PATCH` con `{ materiales: <parseados>, comercial: { metrado: <nombreArchivo> } }`.
  - Tras éxito: `refetch()` del proyecto y cerrar modal; toast/aviso "112 materiales importados".

### 6. UI — tab Logística (`TabLogistica.tsx`) enriquecida
- Añadir columnas **CÓDIGO** (antes de Material), **PRECIO UNIT.** y **PRECIO TOTAL** (= cantidad × precio_unitario).
- Footer con **TOTAL** = Σ (cantidad × precio_unitario).
- El alta manual gana campos opcionales `codigo` y `precio_unitario`.
- Se mantiene: editar `comprado`, estado derivado, eliminar, guardar (reemplazo).

## Flujo de datos

```
[TabComercial] elegir Excel
   → XLSX.read(arrayBuffer)  (en el navegador)
   → parseMetrado(wb) → { materiales[], warnings[] }
   → modal vista previa (N materiales, total)
   → confirmar
   → PATCH /api/proyectos/[id] { materiales, comercial:{metrado:filename} }
   → refetch proyecto (onUpdate)
[TabLogistica] (al cambiar de tab) muestra los materiales con código/precio/total
```

## Manejo de errores
- Excel sin hoja COT ni encabezado reconocible → warning en el modal, no importa nada.
- 0 materiales detectados → aviso "No se encontraron materiales en el Excel".
- Fallo del PATCH → mensaje de error, no se cierra el modal.
- Archivo no-Excel → el `XLSX.read` falla → mensaje "Archivo inválido".

## Testing
- **Parser (`scripts/test-parse-metrado.mjs`):** lee `metrado.xlsx`, llama `parseMetrado`, asegura: 112 materiales, el primero `{codigo:'1.01', nombre contiene 'CAJA CON SOPORTE 01', cantidad:8, precio_unitario≈8840.09}`, ninguna fila de categoría, 0 con cantidad≤0.
- **E2E (`scripts/e2e-metrado.mjs`, Playwright):** login admin → detalle PR-01-2026 → tab Comercial → importar `metrado.xlsx` → modal muestra "112" → confirmar → tab Logística muestra 112 materiales con código y precio. 0 page errors.

## Fuera de alcance (YAGNI)
- Importar mano de obra u otras hojas (Materiales, Cableado, etc.).
- Guardar el archivo Excel como documento en Storage.
- Recalcular el monto del proyecto desde el metrado.
- Edición de `codigo`/`precio_unitario` de materiales ya importados (solo alta manual y comprado).
