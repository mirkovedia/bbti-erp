import type { WorkBook } from 'xlsx';
import * as XLSX from 'xlsx';

export interface MaterialParsed {
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  comprado: number;
  precio_unitario: number;
  estado: 'PENDIENTE';
}

export interface ParseResult {
  materiales: MaterialParsed[];
  warnings: string[];
}

export interface SheetOption {
  name: string;
  count: number;
}

// Normaliza texto para comparar encabezados: sin acentos, mayúsculas, sin espacios extra.
const norm = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// Formatea el código ITEM: "1.0199999" -> "1.02", entero -> "3"
const formatCodigo = (v: unknown): string => {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v ?? '').trim();
};

const isTotalRow = (row: unknown[]): boolean =>
  row.some((c) => {
    const n = norm(c);
    return (
      n === 'TOTAL' ||
      n.includes('SUB TOTAL') ||
      n.includes('SUBTOTAL') ||
      n.includes('PRECIO TOTAL') ||
      n.includes('TOTAL EQUIPOS')
    );
  });

/**
 * Parsea la PRIMERA tabla de materiales de una hoja del metrado.
 *
 * Robusto a formatos distintos: detecta la fila de encabezado por contenido
 * ("DESCRIPCIÓN" + una columna de cantidad: CANT/CANTIDAD/UND) y mapea columnas
 * por título. La cantidad sale de "CANT" si existe; si no, de "UND" (que en las
 * hojas de equipos contiene los números). Lee hasta la primera fila de TOTAL y
 * salta filas de categoría (sin cantidad).
 */
export const parseMetradoSheet = (workbook: WorkBook, sheetName: string): ParseResult => {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return { materiales: [], warnings: [`La hoja "${sheetName}" no existe.`] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  // Fila de encabezado: contiene DESCRIPCION y una columna de cantidad
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm);
    const hasDesc = cells.some((c) => c.includes('DESCRIPCION'));
    const hasQty = cells.some((c) => c.startsWith('CANT') || c === 'UND' || c === 'UNIDAD' || c === 'UNID');
    if (hasDesc && hasQty) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) {
    return { materiales: [], warnings: [`La hoja "${sheetName}" no tiene un encabezado de materiales reconocible.`] };
  }

  const header = rows[headerRow].map(norm);
  const find = (pred: (c: string) => boolean) => header.findIndex(pred);
  const colItem = find((c) => c === 'ITEM');
  const colCodigo = find((c) => c === 'CODIGO');
  const colDesc = find((c) => c.includes('DESCRIPCION'));
  const colCant = find((c) => c.startsWith('CANT'));
  const colUnd = find((c) => c === 'UND' || c === 'UNIDAD' || c === 'UNID');
  const colPUnit = find((c) => c.includes('UNITARIO') || c.includes('P.UNIT') || c.includes('P UNIT'));

  // Cantidad: CANT si existe; si no, la columna UND (que trae los números).
  const colQty = colCant !== -1 ? colCant : colUnd;
  // UND es unidad de medida solo cuando hay un CANT aparte.
  const colUnidad = colCant !== -1 ? colUnd : -1;
  if (colDesc === -1 || colQty === -1) {
    return { materiales: [], warnings: [`La hoja "${sheetName}" no tiene columnas de descripción/cantidad.`] };
  }

  const materiales: MaterialParsed[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isTotalRow(row)) break;

    const desc = String(row[colDesc] ?? '').trim();
    if (!desc) continue;

    const cant = toNumber(row[colQty]);
    if (!Number.isFinite(cant) || cant <= 0) continue; // fila de categoría/sección

    const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] ?? '').trim() : '';
    const codigo = codigoRaw || (colItem !== -1 ? formatCodigo(row[colItem]) : '');
    const unidad = colUnidad !== -1 ? (String(row[colUnidad] ?? '').trim() || 'und') : 'und';
    const precio = colPUnit !== -1 ? toNumber(row[colPUnit]) : NaN;

    materiales.push({
      codigo,
      nombre: desc,
      cantidad: cant,
      unidad,
      comprado: 0,
      precio_unitario: Number.isFinite(precio) ? precio : 0,
      estado: 'PENDIENTE',
    });
  }

  const warnings = materiales.length === 0 ? [`La hoja "${sheetName}" no contiene materiales con cantidad.`] : [];
  return { materiales, warnings };
};

/** Lista las hojas que contienen una tabla de materiales, con su conteo. */
export const listSheetsWithMateriales = (workbook: WorkBook): SheetOption[] =>
  workbook.SheetNames
    .map((name) => ({ name, count: parseMetradoSheet(workbook, name).materiales.length }))
    .filter((s) => s.count > 0);

/** Hoja sugerida por defecto: la que menciona EQUIPOS, o la de mayor conteo. */
export const suggestSheet = (sheets: SheetOption[]): string | null => {
  if (sheets.length === 0) return null;
  const equipos = sheets.find((s) => /EQUIPO/i.test(s.name));
  if (equipos) return equipos.name;
  return [...sheets].sort((a, b) => b.count - a.count)[0].name;
};
