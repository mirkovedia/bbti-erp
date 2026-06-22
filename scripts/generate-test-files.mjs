// scripts/generate-test-files.mjs
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

// ----------------------------------------------------
// 1. GENERACIÓN DEL EXCEL: metrado_test.xlsx
// ----------------------------------------------------
console.log('Generando metrado_test.xlsx...');

const wb = XLSX.utils.book_new();

// Creamos datos simulados de materiales en la hoja "Precios Equipos"
const preciosEquiposData = [
  ['Item', 'Código', 'Descripción', 'Cantidad', 'Unidad', 'Precio Unitario', 'P.U.'], // Cabeceras
  [1, 'ITM-316A', 'ITM 3x16A, Caja Moldeada, 50kA, ABB', 12, 'und', 145.00, 145.00],
  [2, 'CAB-10CU', 'Cable de cobre 10mm2, Indeco', 150, 'm', 12.50, 12.50],
  [3, 'GAB-MET80', 'Gabinete Metálico Autosoportado 800x600x400', 2, 'und', 850.00, 850.00],
  [4, 'CON-LC1D', 'Contactor Tripolar 18A LC1D188BD, Schneider', 8, 'und', 68.00, 68.00],
  [5, 'BOR-PT4', 'Borneras de paso PT 4-PE, Phoenix Contact', 120, 'und', 3.20, 3.20]
];

const wsPrecios = XLSX.utils.aoa_to_sheet(preciosEquiposData);

// Opcional: hoja COT adicional para simular estructura comercial
const cotData = [
  ['Código', 'Descripción', 'Cantidad', 'Precio'],
  ['TAB-DIST-01', 'Tablero de Distribución Principal TD-01', 1, 3500.00],
  ['TAB-BOM-01', 'Tablero de Control de Bombas TB-01', 1, 2400.00]
];
const wsCot = XLSX.utils.aoa_to_sheet(cotData);

XLSX.utils.book_append_sheet(wb, wsPrecios, 'Precios Equipos');
XLSX.utils.book_append_sheet(wb, wsCot, 'COT');

// Guardar archivo Excel
const excelPath = path.resolve('metrado_test.xlsx');
XLSX.writeFile(wb, excelPath);
console.log(`¡metrado_test.xlsx creado con éxito en: ${excelPath}`);

// ----------------------------------------------------
// 2. GENERACIÓN DEL PDF: plano_test.pdf
// ----------------------------------------------------
console.log('Generando plano_test.pdf...');

const doc = new jsPDF({
  orientation: 'landscape',
  unit: 'mm',
  format: 'a4'
});

// Dibujar marco del plano (Border Frame)
doc.setLineWidth(1);
doc.setDrawColor(37, 84, 104); // Brand Teal
doc.rect(10, 10, 277, 190);

doc.setLineWidth(0.3);
doc.rect(12, 12, 273, 186);

// Título del Plano
doc.setFont('helvetica', 'bold');
doc.setFontSize(22);
doc.setTextColor(6, 11, 24); // Brand Navy
doc.text('PLANO DE DISTRIBUCION DE TABLEROS TD-01', 20, 25);

// Subtítulo
doc.setFont('helvetica', 'normal');
doc.setFontSize(12);
doc.setTextColor(100, 100, 100);
doc.text('Proyecto: Siderurgica del Pacifico · PR-99', 20, 32);

// Dibujar un esquema técnico simulado (Cajas que simulan componentes)
doc.setDrawColor(236, 157, 46); // Brand Amber (Amarillo)
doc.setFillColor(240, 244, 248);
doc.rect(30, 50, 60, 90, 'FD'); // Tablero 1
doc.rect(110, 50, 60, 90, 'FD'); // Tablero 2

doc.setFillColor(37, 84, 104);
doc.rect(40, 60, 40, 15, 'F');
doc.rect(120, 60, 40, 15, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(255, 255, 255);
doc.text('INTERRUPTOR PPAL', 42, 70);
doc.text('CONTROL BOMBAS', 122, 70);

// Cajetín de firmas (Title block)
doc.setDrawColor(100, 100, 100);
doc.rect(180, 130, 100, 65);
doc.line(180, 145, 280, 145);
doc.line(180, 160, 280, 160);
doc.line(180, 175, 280, 175);
doc.line(230, 160, 230, 195);

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(0, 0, 0);
doc.text('BBTI ERP - CONTROL DE PLANTA', 185, 137);
doc.text('APROBADO POR:', 185, 152);
doc.text('Giancarlos Oscco', 185, 157);
doc.text('DIBUJADO POR:', 185, 167);
doc.text('Ingenieria Dep.', 185, 172);

doc.text('ESCALA: S/E', 185, 185);
doc.text('FECHA: 18/06/2026', 235, 185);
doc.text('PLANO N°: PLANO-TD01-01', 185, 192);

// Guardar archivo PDF
const pdfData = doc.output('arraybuffer');
const pdfPath = path.resolve('plano_test.pdf');
fs.writeFileSync(pdfPath, Buffer.from(pdfData));
console.log(`¡plano_test.pdf creado con éxito en: ${pdfPath}`);
console.log('--- Proceso Finalizado con Éxito ---');
