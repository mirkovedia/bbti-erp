import { z } from 'zod';

export const roles = [
  'Administrador',
  'Gerencia General',
  'Comercial',
  'Ingeniería',
  'Logística',
  'Producción',
  'Finanzas',
  'Solo Lectura',
] as const;

export const usuarioSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  email: z.string().email('Email inválido'),
  area: z.string().min(2, 'El área es obligatoria'),
  rol: z.enum(roles, { message: 'Rol inválido' }),
  // Política de seguridad: mínimo 12 caracteres (las claves cortas son el
  // primer eslabón del phishing/fuerza bruta).
  password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres'),
});

export type UsuarioInput = z.infer<typeof usuarioSchema>;
