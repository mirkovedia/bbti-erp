export type EstadoProyecto =
  | 'EN PRODUCCIÓN'
  | 'LISTO PARA PRUEBAS'
  | 'EN INGENIERÍA'
  | 'COMPRAS EN CURSO'
  | 'RETRASADO'
  | 'COMPLETADO';

export type Rol =
  | 'Administrador'
  | 'Gerencia General'
  | 'Comercial'
  | 'Ingeniería'
  | 'Logística'
  | 'Producción'
  | 'Finanzas'
  | 'Solo Lectura';

export type EstadoMaterial = 'COMPLETO' | 'PARCIAL' | 'PENDIENTE';
export type EstadoEtapa = 'PENDIENTE' | 'EN PROCESO' | 'COMPLETADO';

export interface Permissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
  canConfig: boolean;
  canViewReports: boolean;
  canViewFinance: boolean;
  canEditFinance: boolean;
  canEditProduccion: boolean;
  canEditLogistica: boolean;
  canEditIngenieria: boolean;
  canEditComercial: boolean;
  canExport: boolean;
}

export interface User {
  id: string;
  nombre: string;
  email: string;
  area: string;
  rol: Rol;
  activo: boolean;
}

export interface Material {
  id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  comprado: number;
  estado: EstadoMaterial;
  codigo?: string;
  precio_unitario?: number;
}

export interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  estado: EstadoEtapa;
}

export interface Comentario {
  id: string;
  autor: string;
  texto: string;
  fecha: string;
}

export interface Documento {
  id: string;
  proyecto_id: string;
  nombre: string;
  tipo: string | null;
  storage_path: string | null;
  subido_por: string | null;
  estado: string | null;
  created_at: string;
}

export type EtapaFlujo = 'ingenieria' | 'logistica' | 'produccion' | 'pruebas' | 'completado';

export interface Confirmacion {
  proyecto_id: string;
  etapa: EtapaFlujo;
  confirmada_por: string | null;
  confirmada_at: string | null;
}

export interface Proyecto {
  id: string;
  cliente: string;
  fecha_creacion: string;
  monto: number;
  usuario_id: string;
  usuario_nombre: string;
  estado: EstadoProyecto;
  comercial?: {
    fecha_entrega: string;
    dias_plazo: number;
    adelanto: number;
    adelanto_fijado: boolean;
    metrado: string;
    alerta: string;
    comentarios: Comentario[];
  };
  ingenieria?: {
    estado_planos: string;
    observaciones: Comentario[];
  };
  logistica?: {
    materiales: Material[];
  };
  produccion?: {
    progreso: number;
    etapas: Etapa[];
    pruebas: boolean;
    envio: boolean;
  };
  finanzas?: {
    adelanto: number;
    fecha_adelanto: string;
    porcentaje: number;
    forma_pago: string;
    alerta: string;
    pagos: Array<{ id: string; descripcion: string; monto: number; fecha: string }>;
  };
  documentos?: Documento[];
  confirmaciones?: Confirmacion[];
}

export type TipoNotificacion = 'documento' | 'confirmacion' | 'datos' | 'hito';

export interface Notificacion {
  id: string;
  destinatario_id: string;
  proyecto_id: string | null;
  tipo: TipoNotificacion;
  mensaje: string;
  actor: string | null;
  leida: boolean;
  created_at: string;
}
