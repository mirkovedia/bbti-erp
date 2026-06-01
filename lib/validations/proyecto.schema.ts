import { z } from 'zod';

export const createProyectoSchema = z.object({
  cliente: z.string().min(2, 'El cliente es requerido'),
  monto: z.number().min(0, 'El monto debe ser positivo'),
  fecha_entrega: z.string().optional(),
  dias_plazo: z.number().min(1).optional(),
  adelanto: z.number().min(0).optional(),
  metrado: z.string().optional(),
  estado: z.enum([
    'EN PRODUCCIÓN',
    'LISTO PARA PRUEBAS',
    'EN INGENIERÍA',
    'COMPRAS EN CURSO',
    'RETRASADO',
    'COMPLETADO',
  ]),
});

export type CreateProyectoInput = z.infer<typeof createProyectoSchema>;
