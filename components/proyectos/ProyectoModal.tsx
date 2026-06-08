'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { createProyectoSchema, CreateProyectoInput } from '@/lib/validations/proyecto.schema';
import { today } from '@/lib/utils/format';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

// Referencias estables (buena práctica de react-hook-form: no recrear en cada render).
const proyectoResolver = zodResolver(createProyectoSchema);
const proyectoDefaults: Partial<CreateProyectoInput> = { monto: 0 };

export const ProyectoModal = ({ onClose, onCreated }: Props) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateProyectoInput>({
    resolver: proyectoResolver,
    defaultValues: proyectoDefaults,
  });

  // Los días de plazo se calculan automáticamente desde la fecha de entrega.
  const fechaEntrega = watch('fecha_entrega');
  useEffect(() => {
    if (!fechaEntrega) return;
    const dias = Math.ceil((new Date(fechaEntrega).getTime() - new Date(today()).getTime()) / 86400000);
    setValue('dias_plazo', dias > 0 ? dias : 0);
  }, [fechaEntrega, setValue]);

  const onSubmit = async (data: CreateProyectoInput) => {
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/proyectos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Error al crear el proyecto');
        return;
      }

      onCreated();
    } catch {
      setError('Error de conexion');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[var(--navy2)] border border-slate-700 rounded-xl w-full max-w-lg mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Nueva Orden de Proyecto</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Cliente *</label>
            <input
              {...register('cliente')}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nombre del cliente"
            />
            {errors.cliente && (
              <p className="mt-1 text-xs text-red-400">{errors.cliente.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Monto (S/)</label>
            <input
              type="number"
              step="0.01"
              {...register('monto', { valueAsNumber: true })}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
            {errors.monto && (
              <p className="mt-1 text-xs text-red-400">{errors.monto.message}</p>
            )}
          </div>
          <p className="text-xs text-slate-500">
            El estado del proyecto avanza automáticamente según el progreso de cada área.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Fecha de Entrega</label>
              <input
                type="date"
                {...register('fecha_entrega')}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Días de Plazo <span className="text-slate-500">(automático)</span></label>
              <input
                type="number"
                readOnly
                {...register('dias_plazo', { setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)) })}
                className="w-full px-3 py-2 bg-slate-800/30 border border-slate-700 rounded-lg text-slate-300 cursor-not-allowed focus:outline-none"
                placeholder="Elige una fecha"
                title="Se calcula automáticamente a partir de la fecha de entrega"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Adelanto (S/)</label>
            <input
              type="number"
              step="0.01"
              {...register('adelanto', { setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)) })}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
