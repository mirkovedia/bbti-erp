// Siembra proyectos de demo realistas (tableros eléctricos) en todas las etapas del flujo.
// Ejecutar: node scripts/seed-demo.mjs   (usa BASE=producción por defecto)
import { serviceClient, getAuthCookie } from './lib/supabase-test.mjs';
const BASE = process.env.BASE || 'https://bbti-erp.vercel.app';
const svc = serviceClient();
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const H = { 'Content-Type': 'application/json', cookie };

const PERSONA = { ingenieria: 'Giancarlos Oscco', logistica: 'Carlos Ramírez', produccion: 'Ana Torres', pruebas: 'Ana Torres', completado: 'Ana Torres' };
const iso = (d) => d.toISOString();
const diasDesdeHoy = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
const fechaCreacion = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

const CATALOGO = [
  { nombre: 'Interruptor termomagnético 3P 100A', codigo: 'ITM-3P-100', unidad: 'und', precio: 285, cant: 4 },
  { nombre: 'Contactor 65A bobina 220V', codigo: 'CNT-65-220', unidad: 'und', precio: 198, cant: 6 },
  { nombre: 'Interruptor diferencial 4P 63A 30mA', codigo: 'IDF-4P-63', unidad: 'und', precio: 320, cant: 3 },
  { nombre: 'Cable THW-90 10mm²', codigo: 'CBL-THW-10', unidad: 'm', precio: 8.5, cant: 250 },
  { nombre: 'Bornera de paso 16mm²', codigo: 'BRN-16', unidad: 'und', precio: 6.2, cant: 80 },
  { nombre: 'Medidor trifásico digital', codigo: 'MED-3F-D', unidad: 'und', precio: 540, cant: 2 },
  { nombre: 'Relé térmico 30-40A', codigo: 'RLT-30-40', unidad: 'und', precio: 165, cant: 5 },
  { nombre: 'Gabinete metálico IP55 1800x800x400', codigo: 'GAB-IP55-18', unidad: 'und', precio: 1250, cant: 1 },
  { nombre: 'Riel DIN 35mm', codigo: 'RDN-35', unidad: 'm', precio: 12, cant: 20 },
  { nombre: 'Canaleta ranurada 40x40', codigo: 'CNL-40', unidad: 'm', precio: 9.8, cant: 30 },
];

// estadoMat: 'pendiente' | 'parcial' | 'completo'
const buildMateriales = (n, estadoMat) =>
  CATALOGO.slice(0, n).map((m) => {
    const comprado = estadoMat === 'completo' ? m.cant : estadoMat === 'parcial' ? Math.floor(m.cant / 2) : 0;
    const estado = comprado >= m.cant ? 'COMPLETO' : comprado > 0 ? 'PARCIAL' : 'PENDIENTE';
    return { nombre: m.nombre, codigo: m.codigo, unidad: m.unidad, cantidad: m.cant, comprado, estado, precio_unitario: m.precio };
  });

const PROYECTOS = [
  { cliente: 'Minera Andina SAC', monto: 185000, dias: 90, entrega: diasDesdeHoy(85), creado: fechaCreacion(5), adelantoPct: 0.30,
    confirmadas: [], matN: 6, matEstado: 'pendiente', etapasComp: 0, prog: 0, pruebas: false, envio: false, pagosExtra: 0,
    docs: [{ nombre: 'Plano unifilar rev0.pdf', estado: 'Solicitados por comercial', por: 'Giancarlos Oscco', rol: 'Ingeniería', tipo: 'pdf' }] },
  { cliente: 'Constructora del Pacífico SA', monto: 240000, dias: 75, entrega: diasDesdeHoy(60), creado: fechaCreacion(14), adelantoPct: 0.30,
    confirmadas: ['ingenieria'], matN: 7, matEstado: 'parcial', etapasComp: 0, prog: 0, pruebas: false, envio: false, pagosExtra: 0,
    docs: [{ nombre: 'Plano de fabricación rev2.pdf', estado: 'Aprobados y firmados', por: 'Giancarlos Oscco', rol: 'Ingeniería', tipo: 'pdf' }] },
  { cliente: 'Industrias del Sur SAC', monto: 310000, dias: 80, entrega: diasDesdeHoy(70), creado: fechaCreacion(28), adelantoPct: 0.30,
    confirmadas: ['ingenieria', 'logistica'], matN: 8, matEstado: 'completo', etapasComp: 2, prog: 40, pruebas: false, envio: false, pagosExtra: 1,
    docs: [{ nombre: 'Plano aprobado rev3.pdf', estado: 'Aprobados y firmados', por: 'Giancarlos Oscco', rol: 'Ingeniería', tipo: 'pdf' },
           { nombre: 'Comprobante adelanto: voucher_BCP.pdf', estado: null, por: 'José Flores', rol: 'Comercial', tipo: 'pdf' }] },
  { cliente: 'Agroindustrias Norte SA', monto: 175000, dias: 60, entrega: diasDesdeHoy(40), creado: fechaCreacion(35), adelantoPct: 0.30,
    confirmadas: ['ingenieria', 'logistica', 'produccion'], matN: 6, matEstado: 'completo', etapasComp: 5, prog: 100, pruebas: false, envio: false, pagosExtra: 2,
    docs: [{ nombre: 'Plano as-built.pdf', estado: 'Aprobados y firmados', por: 'Giancarlos Oscco', rol: 'Ingeniería', tipo: 'pdf' }] },
  { cliente: 'Cementos del Centro SAC', monto: 420000, dias: 90, entrega: diasDesdeHoy(-3), creado: fechaCreacion(80), adelantoPct: 0.30,
    confirmadas: ['ingenieria', 'logistica', 'produccion', 'pruebas', 'completado'], matN: 9, matEstado: 'completo', etapasComp: 5, prog: 100, pruebas: true, envio: true, pagosExtra: 2,
    docs: [{ nombre: 'Plano final firmado.pdf', estado: 'Aprobados y firmados', por: 'Giancarlos Oscco', rol: 'Ingeniería', tipo: 'pdf' },
           { nombre: 'Protocolo de pruebas.pdf', estado: 'Enviados a comercial', por: 'Ana Torres', rol: 'Producción', tipo: 'pdf' }] },
  { cliente: 'Pesquera Costa Azul SA', monto: 198000, dias: 70, entrega: diasDesdeHoy(-12), creado: fechaCreacion(60), adelantoPct: 0.30,
    confirmadas: ['ingenieria', 'logistica'], matN: 7, matEstado: 'completo', etapasComp: 1, prog: 20, pruebas: false, envio: false, pagosExtra: 1,
    docs: [{ nombre: 'Plano aprobado.pdf', estado: 'Aprobados y firmados', por: 'Giancarlos Oscco', rol: 'Ingeniería', tipo: 'pdf' }] },
];

// Limpiar demos previas (por nombre de cliente) — NO toca otros proyectos
const nombres = PROYECTOS.map((p) => p.cliente);
const { data: prev } = await svc.from('proyectos').select('id, cliente').in('cliente', nombres);
for (const p of prev ?? []) await svc.from('proyectos').delete().eq('id', p.id);
if (prev?.length) console.log(`limpiados ${prev.length} demos previas`);

let creados = 0;
for (const cfg of PROYECTOS) {
  // 1) crear esqueleto vía API (genera id, etapas, ingenieria, produccion, finanzas, comercial)
  const adelanto = Math.round(cfg.monto * cfg.adelantoPct);
  const res = await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: H,
    body: JSON.stringify({ cliente: cfg.cliente, monto: cfg.monto, fecha_entrega: cfg.entrega, dias_plazo: cfg.dias, adelanto }) });
  const proy = await res.json();
  const id = proy.id;
  if (!id) { console.log('XX no se creó', cfg.cliente, JSON.stringify(proy)); continue; }

  // 2) fecha de creación realista + metrado
  await svc.from('proyectos').update({ fecha_creacion: cfg.creado }).eq('id', id);
  await svc.from('proyecto_comercial').update({ metrado: `Metrado ${cfg.cliente} - tablero general` }).eq('proyecto_id', id);

  // 3) materiales
  await svc.from('proyecto_materiales').delete().eq('proyecto_id', id);
  const mats = buildMateriales(cfg.matN, cfg.matEstado).map((m) => ({ proyecto_id: id, ...m }));
  if (mats.length) await svc.from('proyecto_materiales').insert(mats);

  // 4) etapas: primeras `etapasComp` COMPLETADO, la siguiente EN PROCESO, resto PENDIENTE
  const { data: etapas } = await svc.from('proyecto_etapas').select('id, orden').eq('proyecto_id', id).order('orden');
  for (let i = 0; i < (etapas?.length ?? 0); i++) {
    const estado = i < cfg.etapasComp ? 'COMPLETADO' : i === cfg.etapasComp && cfg.etapasComp < 5 && cfg.prog > 0 ? 'EN PROCESO' : 'PENDIENTE';
    await svc.from('proyecto_etapas').update({ estado }).eq('id', etapas[i].id);
  }
  await svc.from('proyecto_produccion').update({ progreso: cfg.prog, pruebas: cfg.pruebas, envio: cfg.envio }).eq('proyecto_id', id);

  // 5) confirmaciones (esto DERIVA el estado del proyecto)
  if (cfg.confirmadas.length) {
    await svc.from('proyecto_confirmaciones').insert(cfg.confirmadas.map((etapa) => ({
      proyecto_id: id, etapa, confirmada_por: PERSONA[etapa] ?? 'Sistema',
    })));
  }

  // 6) pagos adicionales (Finanzas)
  for (let i = 0; i < cfg.pagosExtra; i++) {
    await svc.from('proyecto_pagos').insert({ proyecto_id: id, descripcion: `Pago parcial ${i + 1}`, monto: Math.round(cfg.monto * 0.2), fecha: fechaCreacion(20 - i * 7) });
  }
  await svc.from('proyecto_finanzas').update({ adelanto, porcentaje: cfg.adelantoPct * 100 }).eq('proyecto_id', id);

  // 7) documentos + bitácora (con archivo placeholder para que la descarga funcione)
  for (const d of cfg.docs) {
    const sp = `${id}/${d.nombre.replace(/[^\w.\-]/g, '_')}`;
    await svc.storage.from('bbti-documentos').upload(sp, new Blob([`%PDF-1.4 demo ${d.nombre}`], { type: 'application/pdf' }), { upsert: true });
    const { data: doc } = await svc.from('proyecto_documentos').insert({
      proyecto_id: id, nombre: d.nombre, tipo: d.tipo, storage_path: sp, estado: d.estado,
      subido_por: d.por, subido_por_rol: d.rol,
    }).select('id').single();
    await svc.from('documento_eventos').insert({ documento_id: doc?.id, proyecto_id: id, documento_nombre: d.nombre, tipo: 'subida', usuario: d.por, rol: d.rol });
  }

  // 8) un comentario y una observación para llenar
  await svc.from('proyecto_comentarios').insert({ proyecto_id: id, autor: 'José Flores', texto: 'Cliente confirmó alcance y adelanto.', fecha: cfg.creado });

  creados++;
  console.log(`OK  ${id}  ${cfg.cliente}  (confirmadas: ${cfg.confirmadas.join(',') || 'ninguna'})`);
}

console.log(`\n===== ${creados} proyectos de demo creados =====`);
process.exit(0);
