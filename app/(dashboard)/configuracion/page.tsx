'use client';

import { useEffect, useState, useRef } from 'react';
import { Settings, Save, Download, Upload, Loader2, ShieldAlert } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';

interface CompanyConfig {
  name: string;
  siglas: string;
  rubro: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
  website: string;
  moneda: string;
  igv: string;
  orden_prefix: string;
  dias_alerta: string;
}

const EMPTY: CompanyConfig = {
  name: 'BBTI',
  siglas: 'S.A.C.',
  rubro: 'Fabricación de Tableros Eléctricos',
  ruc: '',
  direccion: '',
  telefono: '',
  email: '',
  website: '',
  moneda: 'S/',
  igv: '18',
  orden_prefix: 'PR',
  dias_alerta: '7',
};

export default function ConfiguracionPage() {
  const { user } = useAppStore();
  const [config, setConfig] = useState<CompanyConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Estados para restauración de backup
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');

  const puedeConfig = can(user, 'canConfig');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/configuracion');
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          // Normalizar null/undefined a '' para no romper los inputs controlados
          const clean = Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, v ?? ''])
          );
          setConfig({ ...EMPTY, ...clean });
        }
      } catch (err) {
        console.error('Error fetching config:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleChange = (field: keyof CompanyConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await fetch('/api/configuracion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSavedMsg('Cambios guardados correctamente.');
        setTimeout(() => setSavedMsg(''), 3000);
      } else {
        const data = await res.json();
        setSavedMsg(data.error ?? 'Error al guardar');
      }
    } catch {
      setSavedMsg('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    try {
      const res = await fetch('/api/configuracion/backup');
      if (!res.ok) {
        const err = await res.json();
        alert(`Error al generar respaldo: ${err.error}`);
        return;
      }
      const backup = await res.json();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bbti-database-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error backup:', err);
      alert('Error de conexión al generar respaldo.');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm(
      '¡ATENCIÓN! Esta acción reemplazará la configuración de la empresa, los permisos de roles y TODOS los proyectos de la base de datos con los datos de este archivo de respaldo.\n\nEsta acción NO se puede deshacer. ¿Deseas continuar?'
    );
    if (!confirmRestore) {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
      return;
    }

    setRestoring(true);
    setRestoreMsg('');
    try {
      const text = await file.text();
      const backupObj = JSON.parse(text);

      const res = await fetch('/api/configuracion/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupObj),
      });

      if (res.ok) {
        setRestoreMsg('Base de datos restaurada correctamente. Recargando la aplicación...');
        setTimeout(() => {
          window.location.reload();
        }, 2500);
      } else {
        const body = await res.json().catch(() => ({}));
        setRestoreMsg(body.error || 'Error al restaurar el respaldo.');
      }
    } catch (err) {
      console.error('Error restoring backup:', err);
      setRestoreMsg('Archivo de respaldo no válido o corrupto.');
    } finally {
      setRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  if (!puedeConfig) {
    return (
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-12 text-center">
        <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-amber-500" />
        <p className="text-white font-medium">Acceso restringido</p>
        <p className="text-slate-400 mt-1">Solo el Administrador puede editar la configuración.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const inputCls =
    'w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

  const campos: { key: keyof CompanyConfig; label: string; placeholder?: string }[] = [
    { key: 'name', label: 'Nombre de la empresa' },
    { key: 'siglas', label: 'Siglas' },
    { key: 'rubro', label: 'Rubro' },
    { key: 'ruc', label: 'RUC', placeholder: '20XXXXXXXXX' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'website', label: 'Sitio web' },
    { key: 'orden_prefix', label: 'Prefijo de Correlativo (Proyectos)', placeholder: 'PR' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuración</h1>
          <p className="text-slate-400 mt-1">Datos de la empresa, respaldo y parámetros de sistema</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Restaurar Backup */}
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestore}
          />
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {restoring ? 'Restaurando...' : 'Restaurar Backup'}
          </button>

          {/* Generar Backup */}
          <button
            onClick={handleBackup}
            disabled={restoring}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 text-white font-medium rounded-lg transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Backup JSON (Completo)
          </button>
        </div>
      </div>

      {restoreMsg && (
        <div className={`p-4 rounded-xl border ${restoreMsg.includes('correctamente') ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          <p className="text-sm font-medium">{restoreMsg}</p>
        </div>
      )}

      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Settings className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Datos de la empresa y sistema</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campos.map((c) => (
            <div key={c.key}>
              <label className="block text-sm text-slate-400 mb-1">{c.label}</label>
              <input
                value={config[c.key] ?? ''}
                onChange={(e) => handleChange(c.key, e.target.value)}
                placeholder={c.placeholder}
                className={inputCls}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Moneda</label>
            <select value={config.moneda || 'S/'} onChange={(e) => handleChange('moneda', e.target.value)} className={inputCls}>
              <option value="S/">Soles (S/)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">IGV (%)</label>
            <input
              type="number"
              value={config.igv ?? ''}
              onChange={(e) => handleChange('igv', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Días para Alerta de Vencimiento (Reportes)</label>
            <input
              type="number"
              value={config.dias_alerta ?? ''}
              onChange={(e) => handleChange('dias_alerta', e.target.value)}
              className={inputCls}
              placeholder="7"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          {savedMsg && <p className="text-sm text-green-400">{savedMsg}</p>}
          <button
            onClick={handleSave}
            disabled={saving || restoring}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-lg transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
