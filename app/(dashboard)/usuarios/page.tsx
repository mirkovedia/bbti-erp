'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, Plus, X, UserCheck, UserX, Shield, Save, Loader2 } from 'lucide-react';
import { Rol, Permissions } from '@/types';
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

const PERM_METADATA: Array<{ key: keyof Permissions; name: string; desc: string; category: string }> = [
  // Acceso General
  { key: 'canCreate', name: 'Crear Proyectos', desc: 'Permite crear nuevos proyectos y generar sus registros de área', category: 'Acceso General' },
  { key: 'canEdit', name: 'Editar Proyectos', desc: 'Permite modificar cliente, monto y estado base de proyectos', category: 'Acceso General' },
  { key: 'canDelete', name: 'Eliminar Proyectos', desc: 'Permite enviar proyectos a la papelera y restaurarlos', category: 'Acceso General' },
  { key: 'canExport', name: 'Exportar Reportes', desc: 'Habilita la exportación de reportes a PDF y Excel', category: 'Acceso General' },
  { key: 'canViewReports', name: 'Ver Reportes', desc: 'Permite acceder a la sección de reportes y KPIs del sistema', category: 'Acceso General' },
  
  // Administración
  { key: 'canManageUsers', name: 'Gestionar Usuarios', desc: 'Permite crear, activar, desactivar y administrar roles de usuarios', category: 'Administración' },
  { key: 'canConfig', name: 'Modificar Configuración', desc: 'Permite editar los datos de la empresa, IGV, y realizar copias de seguridad', category: 'Administración' },
  
  // Edición por Área
  { key: 'canEditComercial', name: 'Editar Comercial', desc: 'Permite modificar plazos, adelantos, adjuntar OC y comentarios comerciales', category: 'Edición por Área' },
  { key: 'canEditIngenieria', name: 'Editar Ingeniería', desc: 'Permite subir planos, agregar observaciones y firmar la etapa de ingeniería', category: 'Edición por Área' },
  { key: 'canEditLogistica', name: 'Editar Logística', desc: 'Permite gestionar y comprar materiales de proyectos', category: 'Edición por Área' },
  { key: 'canEditProduccion', name: 'Editar Producción', desc: 'Permite avanzar etapas de fabricación y firmar la entrega/pruebas', category: 'Edición por Área' },
  { key: 'canViewFinance', name: 'Ver Finanzas', desc: 'Permite visualizar la pestaña de finanzas y sus pagos adicionales', category: 'Edición por Área' },
  { key: 'canEditFinance', name: 'Editar Finanzas', desc: 'Permite modificar adelantos, formas de pago y agregar pagos adicionales', category: 'Edición por Área' }
];

export default function UsuariosPage() {
  const { user, rolePermissions, setRolePermissions } = useAppStore();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Tabs: 'usuarios' | 'roles'
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles'>('usuarios');
  
  // Estado local para edición de permisos
  const [selectedRole, setSelectedRole] = useState<Rol>('Comercial');
  const [localPerms, setLocalPerms] = useState<Record<Rol, Permissions> | null>(
    rolePermissions ? JSON.parse(JSON.stringify(rolePermissions)) : null
  );
  const [savingPerms, setSavingPerms] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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
    // El setState ocurre tras await (deferido); falso positivo de set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsuarios();
  }, []);

  // Re-clona localPerms cuando se abre la pestaña de roles o cambian los permisos globales (ajuste en render)
  const [prevPermsKey, setPrevPermsKey] = useState({ rp: rolePermissions, tab: activeTab });
  if (rolePermissions && (prevPermsKey.rp !== rolePermissions || prevPermsKey.tab !== activeTab)) {
    setPrevPermsKey({ rp: rolePermissions, tab: activeTab });
    setLocalPerms(JSON.parse(JSON.stringify(rolePermissions))); // deep clone
  }

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

  const handleTogglePerm = (key: keyof Permissions, checked: boolean) => {
    if (!localPerms) return;
    setLocalPerms((prev) => {
      if (!prev) return null;
      const updatedRolePerms = { ...prev[selectedRole], [key]: checked };
      return { ...prev, [selectedRole]: updatedRolePerms };
    });
  };

  const handleSavePerms = async () => {
    if (!localPerms) return;
    setSavingPerms(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await fetch('/api/role-permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rol: selectedRole,
          permissions: localPerms[selectedRole],
        }),
      });
      if (res.ok) {
        setSuccessMsg(`Permisos del rol "${selectedRole}" guardados con éxito.`);
        // Actualizar Zustand inmediatamente para propagar cambios en caliente
        setRolePermissions(localPerms);
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || 'Error al guardar permisos.');
      }
    } catch {
      setErrorMsg('Error de conexión con el servidor.');
    } finally {
      setSavingPerms(false);
    }
  };

  // Acceso restringido: gestionar usuarios es función de sistema, solo Admin.
  if (user && !puedeGestionar) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-amber-400 font-medium mb-1">Acceso restringido</p>
        <p className="text-slate-400">Solo el Administrador puede gestionar usuarios y roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios y Permisos</h1>
          <p className="text-slate-400 mt-1">Configura accesos y gestiona los integrantes del sistema</p>
        </div>
        
        <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800 overflow-x-auto scrollbar-none max-w-full">
          <div className="flex min-w-max gap-1">
            <button
              onClick={() => setActiveTab('usuarios')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all shrink-0 ${activeTab === 'usuarios' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-4 h-4" />
              Usuarios
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all shrink-0 ${activeTab === 'roles' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Shield className="w-4 h-4" />
              Roles y Permisos
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'usuarios' ? (
        // ================= TAB: USUARIOS =================
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-xl border border-slate-800/40">
            <p className="text-sm text-slate-400 font-medium">{usuarios.length} usuarios registrados</p>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              Nuevo Usuario
            </button>
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
                    <tr className="border-b border-slate-700 bg-slate-800/10">
                      {['Usuario', 'Email', 'Área', 'Rol', 'Estado', ''].map((h) => (
                        <th key={h} className="text-left py-3.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {ini(u.nombre)}
                            </div>
                            <span className="text-white font-medium truncate max-w-[180px]">{u.nombre}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300 text-sm truncate max-w-[200px]">{u.email}</td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{u.area}</td>
                        <td className="py-3 px-4"><RoleBadge rol={u.rol} /></td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.activo ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {u.id !== user?.id && (
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
        </div>
      ) : (
        // ================= TAB: ROLES Y PERMISOS =================
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* List of Roles */}
          <div className="lg:col-span-1 bg-[var(--navy2)] p-3 lg:p-4 rounded-xl border border-slate-800 flex flex-row lg:flex-col overflow-x-auto scrollbar-none gap-2 items-center lg:items-stretch">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-3 shrink-0 hidden lg:block">Roles</h3>
            <div className="flex flex-row lg:flex-col gap-2 w-full min-w-max lg:min-w-0">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm rounded-lg transition-all text-left shrink-0 w-auto lg:w-full ${selectedRole === r ? 'bg-blue-600/25 text-blue-300 border border-blue-600/30' : 'text-slate-400 hover:bg-slate-800/40 hover:text-white border border-transparent'}`}
                >
                  <span>{r}</span>
                  {r === 'Administrador' && <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Role Permissions Matrix */}
          <div className="lg:col-span-3 bg-[var(--navy2)] p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Permisos de {selectedRole}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Configura qué acciones y datos están autorizados para este rol</p>
                </div>
                {selectedRole === 'Administrador' && (
                  <span className="text-xs bg-red-500/10 border border-red-500/30 text-red-300 px-2 py-1 rounded-full">Protección del Sistema</span>
                )}
              </div>

              {localPerms ? (
                <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-2">
                  {['Acceso General', 'Administración', 'Edición por Área'].map((category) => {
                    const categoryPerms = PERM_METADATA.filter((p) => p.category === category);
                    return (
                      <div key={category} className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/60 pb-1.5">{category}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {categoryPerms.map((perm) => (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-3 p-3 bg-slate-900/20 rounded-lg border border-slate-800 hover:bg-slate-800/20 transition-all select-none ${selectedRole === 'Administrador' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                            >
                              <input
                                type="checkbox"
                                checked={localPerms[selectedRole]?.[perm.key] ?? false}
                                disabled={selectedRole === 'Administrador' || savingPerms}
                                onChange={(e) => handleTogglePerm(perm.key, e.target.checked)}
                                className="w-4.5 h-4.5 rounded text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-slate-800 border-slate-700 mt-0.5 disabled:opacity-50"
                              />
                              <div className="space-y-0.5">
                                <span className="text-sm font-medium text-white">{perm.name}</span>
                                <p className="text-xs text-slate-500 leading-normal">{perm.desc}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {selectedRole !== 'Administrador' && (
              <div className="border-t border-slate-800 pt-5 mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-h-[20px]">
                  {successMsg && <p className="text-sm text-green-400 font-medium">{successMsg}</p>}
                  {errorMsg && <p className="text-sm text-red-400 font-medium">{errorMsg}</p>}
                </div>
                <button
                  onClick={handleSavePerms}
                  disabled={savingPerms || !localPerms}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  {savingPerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingPerms ? 'Guardando...' : 'Guardar Permisos'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-700 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
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
