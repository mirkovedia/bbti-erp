// lib/constants.ts
// (El límite de subida ya no vive aquí: lo define el servidor vía env MAX_UPLOAD_MB.)

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
