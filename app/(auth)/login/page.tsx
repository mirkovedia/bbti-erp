'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Zap, Shield, BarChart3, Clock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Credenciales incorrectas. Verifica tu email y contraseña.');
        return;
      }

      router.push('/proyectos');
      router.refresh();
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, title: 'Gestión de Proyectos', desc: 'Control total de órdenes de producción' },
    { icon: Shield, title: 'Roles y Permisos', desc: 'Acceso segmentado por área' },
    { icon: Clock, title: 'Seguimiento en Tiempo Real', desc: 'Monitoreo de avance y entregas' },
  ];

  return (
    <div className="min-h-screen flex bg-[var(--navy)]">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 bg-gradient-to-br from-[var(--navy)] to-[var(--navy2)]">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">BBTI</h1>
            <p className="text-sm text-slate-400">Sistema ERP</p>
          </div>
        </div>

        <h2 className="text-2xl font-semibold text-white mb-2">
          Fabricación de Tableros Eléctricos
        </h2>
        <p className="text-slate-400 mb-10 text-lg">
          Gestión integral de proyectos, producción y finanzas.
        </p>

        <div className="space-y-6">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
                <f.icon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">{f.title}</h3>
                <p className="text-slate-400 text-sm">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">BBTI ERP</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Iniciar Sesión</h2>
          <p className="text-slate-400 mb-8">Ingresa tus credenciales para acceder al sistema.</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            BBTI S.A.C. — Sistema de Gestión v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
