'use client';

import { useEffect, useState } from 'react';
import { Settings, Save, Download, ShieldAlert } from 'lucide-react';
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
  orden_prefix: 'OC',
};

export default function ConfiguracionPage() {
  const { user } = useAppStore();
  const [config, setConfig] = useState<CompanyConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const puedeConfig = can(user, 'canConfig');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/configuracion');
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setConfig({ ...EMPTY, ...data });
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
      const res = await fetch('/api/proyectos');
      const proyectos = await res.json();
      const backup = { config, proyectos, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bbti-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error backup:', err);
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuración</h1>
          <p className="text-slate-400 mt-1">Datos de la empresa y respaldo</p>
        </div>
        <button
          onClick={handleBackup}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 text-white font-medium rounded-lg transition-all"
        >
          <Download className="w-4 h-4" />
          Backup JSON
        </button>
      </div>

      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Settings className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Datos de la empresa</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campos.map((c) => (
            <div key={c.key}>
              <label className="block text-sm text-slate-400 mb-1">{c.label}</label>
              <input
                value={config[c.key]}
                onChange={(e) => handleChange(c.key, e.target.value)}
                placeholder={c.placeholder}
                className={inputCls}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Moneda</label>
            <select value={config.moneda} onChange={(e) => handleChange('moneda', e.target.value)} className={inputCls}>
              <option value="S/">Soles (S/)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">IGV (%)</label>
            <input
              type="number"
              value={config.igv}
              onChange={(e) => handleChange('igv', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          {savedMsg && <p className="text-sm text-green-400">{savedMsg}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
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
