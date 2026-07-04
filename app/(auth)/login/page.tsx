'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle } from 'lucide-react';

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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
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

  return (
    <div className="min-h-screen flex bg-[var(--navy)]">
      {/* Panel de marca */}
      <div className="hidden md:flex md:w-1/2 relative flex-col justify-between p-12 overflow-hidden">
        {/* Fondo de marca (degradado petróleo) + overlay para legibilidad */}
        <Image src="/login-bg.png" alt="" fill priority sizes="(min-width: 768px) 50vw, 0px" className="object-cover" />
        <div className="absolute inset-0 bg-[var(--brand-teal)]/55" />
        <div className="relative z-10">
          <Image src="/bbti-logo.png" alt="BBTI" width={180} height={44} priority className="h-11 w-auto" />
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Innovación en<br />cada proyecto
          </h1>
          <p className="mt-3 text-lg text-white/85">Sistema de Gestión de Proyectos</p>
          <p className="mt-1 text-sm text-[var(--brand-amber)] font-medium">Diseño, fabricación y montaje a medida</p>
        </div>
        <div className="relative z-10 text-xs text-white/70">BBTI S.A.C. — Tableros Eléctricos</div>
      </div>

      {/* Formulario */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-md">
          {/* Logo en móvil */}
          <div className="md:hidden flex justify-center mb-8">
            <Image src="/bbti-logo.png" alt="BBTI" width={150} height={37} priority className="h-9 w-auto" />
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
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Contraseña</label>
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
              className="w-full py-2.5 bg-[var(--brand-amber)] hover:brightness-110 text-[#1a1206] font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">BBTI S.A.C. — Sistema de Gestión v1.0</p>
        </div>
      </div>
    </div>
  );
}
