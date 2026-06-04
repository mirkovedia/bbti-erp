// lib/constants.ts
export const DOCUMENTOS_BUCKET = 'bbti-documentos';
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB en bytes

// Estados del flujo de planos (cada documento/versión tiene el suyo)
export const ESTADOS_PLANO = [
  'Solicitados por comercial',
  'En proceso',
  'Enviados a comercial',
  'Aprobados y firmados',
] as const;
