'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, Plus, X, UserCheck, UserX } from 'lucide-react';
import { Rol } from '@/types';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { usuarioSchema, UsuarioInput } from '@/lib/validations/usuario.schema';
import { ini } from '@/lib/utils/format';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  area: string;
  rol: Rol;
  activo: boolean;
}

const ROLES: Rol[] = [
  'Administrador',
  'Gerencia General',
  'Comercial',
  'Ingeniería',
  'Logística',
  'Producción',
  'Finanzas',
  'Solo Lectura',
];

export default function UsuariosPage() {
  const { user } = useAppStore();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const puedeGestionar = can(user, 'canManageUsers');

  const fetchUsuarios = async () => {
    try {
      const res = await fetch('/api/usuarios');
      const data = await res.json();
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching usuarios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const toggleActivo = async (u: Usuario) => {
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !u.activo }),
      });
      if (res.ok) {
        setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, activo: !x.activo } : x)));
      }
    } catch (err) {
      console.error('Error toggling usuario:', err);
    }
  };

  // Acceso restringido: gestionar usuarios es función de sistema, solo Admin.
  if (user && !puedeGestionar) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-amber-400 font-medium mb-1">Acceso restringido</p>
        <p className="text-slate-400">Solo el Administrador puede gestionar usuarios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-slate-400 mt-1">{usuarios.length} usuarios en el sistema</p>
        </div>
        {puedeGestionar && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Nuevo Usuario
          </button>
        )}
      </div>

      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : usuarios.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No hay usuarios registrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  {['Usuario', 'Email', 'Área', 'Rol', 'Estado', ''].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
                          {ini(u.nombre)}
                        </div>
                        <span className="text-white font-medium">{u.nombre}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-sm">{u.email}</td>
                    <td className="py-3 px-4 text-slate-400 text-sm">{u.area}</td>
                    <td className="py-3 px-4"><RoleBadge rol={u.rol} /></td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.activo ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {puedeGestionar && u.id !== user?.id && (
                        <button
                          onClick={() => toggleActivo(u)}
                          title={u.activo ? 'Desactivar' : 'Activar'}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        >
                          {u.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <UsuarioModal
          roles={ROLES}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchUsuarios();
          }}
        />
      )}
    </div>
  );
}

interface ModalProps {
  roles: Rol[];
  onClose: () => void;
  onCreated: () => void;
}

const UsuarioModal = ({ roles, onClose, onCreated }: ModalProps) => {
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioInput>({ resolver: zodResolver(usuarioSchema) });

  const onSubmit = async (values: UsuarioInput) => {
    setServerError('');
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        setServerError(data.error ?? 'Error al crear usuario');
        return;
      }
      onCreated();
    } catch {
      setServerError('Error de conexión');
    }
  };

  const inputCls =
    'w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-700 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Nuevo Usuario</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre</label>
            <input {...register('nombre')} className={inputCls} placeholder="Juan Pérez" />
            {errors.nombre && <p className="text-red-400 text-xs mt-1">{errors.nombre.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input {...register('email')} className={inputCls} placeholder="juan@bbti.com.pe" />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Área</label>
            <input {...register('area')} className={inputCls} placeholder="Comercial" />
            {errors.area && <p className="text-red-400 text-xs mt-1">{errors.area.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Rol</label>
            <select {...register('rol')} className={inputCls} defaultValue="">
              <option value="" disabled>Seleccionar rol</option>
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {errors.rol && <p className="text-red-400 text-xs mt-1">{errors.rol.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Contraseña inicial</label>
            <input {...register('password')} type="password" className={inputCls} placeholder="••••••" />
            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
          </div>

          {serverError && <p className="text-red-400 text-sm">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-lg transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
