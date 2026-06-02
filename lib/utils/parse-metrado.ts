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

export interface ParseMetradoResult {
  materiales: MaterialParsed[];
  warnings: string[];
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
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v ?? '').trim();
};

/**
 * Parsea un workbook de metrado (cotización BBTI) y devuelve los materiales de la
 * tabla principal de la hoja "COT" (o la primera hoja con encabezado válido).
 *
 * Robusto a membretes de alto variable: detecta la fila de encabezado por su
 * contenido ("DESCRIPCION" + "CANT") y mapea columnas por título, no por posición.
 * Lee hasta la fila "PRECIO TOTAL" o el fin de datos. Salta filas de categoría
 * (ITEM sin cantidad).
 */
export const parseMetrado = (workbook: WorkBook): ParseMetradoResult => {
  const warnings: string[] = [];
  const sheetNames = workbook.SheetNames;
  const preferred = sheetNames.find((n) => norm(n) === 'COT');
  const candidates = preferred ? [preferred, ...sheetNames] : sheetNames;

  for (const sheetName of candidates) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

    // Buscar fila de encabezado: contiene DESCRIPCION y CANT
    let headerRow = -1;
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].map(norm);
      const hasDesc = cells.some((c) => c.includes('DESCRIPCION'));
      const hasCant = cells.some((c) => c.startsWith('CANT'));
      if (hasDesc && hasCant) {
        headerRow = i;
        break;
      }
    }
    if (headerRow === -1) continue;

    // Mapear índices de columna por título
    const header = rows[headerRow].map(norm);
    const findCol = (pred: (c: string) => boolean) => header.findIndex(pred);
    const colItem = findCol((c) => c === 'ITEM');
    const colCant = findCol((c) => c.startsWith('CANT'));
    const colDesc = findCol((c) => c.includes('DESCRIPCION'));
    const colPUnit = findCol((c) => c.includes('UNITARIO') || c === 'P. UNITARIO' || c.includes('P UNITARIO'));
    if (colCant === -1 || colDesc === -1) continue;

    const materiales: MaterialParsed[] = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      // Fin de la tabla principal
      if (row.some((c) => norm(c).includes('PRECIO TOTAL'))) break;

      const desc = String(row[colDesc] ?? '').trim();
      if (!desc) continue;

      const cant = toNumber(row[colCant]);
      // Sin cantidad válida -> fila de categoría/sección -> saltar
      if (!Number.isFinite(cant) || cant <= 0) continue;

      const precio = colPUnit !== -1 ? toNumber(row[colPUnit]) : NaN;
      materiales.push({
        codigo: colItem !== -1 ? formatCodigo(row[colItem]) : '',
        nombre: desc,
        cantidad: cant,
        unidad: 'und',
        comprado: 0,
        precio_unitario: Number.isFinite(precio) ? precio : 0,
        estado: 'PENDIENTE',
      });
    }

    if (materiales.length === 0) {
      warnings.push(`La hoja "${sheetName}" no contiene materiales con cantidad.`);
      continue;
    }
    return { materiales, warnings };
  }

  warnings.push('No se encontró una hoja con formato de metrado (encabezado con "DESCRIPCIÓN" y "CANT").');
  return { materiales: [], warnings };
};
