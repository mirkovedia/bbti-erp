import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

/**
 * Exporta un arreglo de objetos a un archivo Excel (.xlsx) usando SheetJS.
 */
export const exportToExcel = (
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = 'Datos'
): void => {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

interface PdfColumn {
  header: string;
  key: string;
}

/**
 * Exporta una tabla simple a PDF usando jsPDF (sin plugins externos).
 * Dibuja encabezado, filas y pie con la marca BBTI.
 */
export const exportToPDF = (
  title: string,
  columns: PdfColumn[],
  rows: Record<string, unknown>[],
  filename: string
): void => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 50;

  // Encabezado
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text('BBTI S.A.C.', marginX, y);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(title, marginX, y + 20);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, marginX, y + 36);

  y += 60;

  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - marginX * 2;
  const colWidth = usableWidth / columns.length;

  // Encabezados de tabla
  doc.setFillColor(37, 99, 235);
  doc.rect(marginX, y - 12, usableWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  columns.forEach((col, i) => {
    doc.text(col.header, marginX + i * colWidth + 4, y + 2);
  });

  y += 18;
  doc.setTextColor(40, 40, 40);

  // Filas
  rows.forEach((row, idx) => {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 50;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(240, 244, 250);
      doc.rect(marginX, y - 11, usableWidth, 18, 'F');
    }
    columns.forEach((col, i) => {
      const value = String(row[col.key] ?? '');
      const text = value.length > 28 ? `${value.slice(0, 27)}…` : value;
      doc.text(text, marginX + i * colWidth + 4, y + 1);
    });
    y += 18;
  });

  doc.save(`${filename}.pdf`);
};
