// lib/constants.ts
export const DOCUMENTOS_BUCKET = 'bbti-documentos';
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB en bytes

// Estados del flujo de planos (cada documento/versión tiene el suyo)
export const ESTADOS_PLANO = [
  'Enviados a comercial',
  'Aprobados y firmados',
] as const;

// Prefijos para clasificar documentos por área/tipo (sin columna extra en BD).
// El nombre del archivo se guarda con el prefijo y cada pestaña filtra por él.
export const DOC_PREFIX = {
  comprobante: 'Comprobante adelanto: ',
  oc: 'OC: ',
  especificaciones: 'Especificaciones técnicas: ',
  despiece: 'Despiece: ',
} as const;
