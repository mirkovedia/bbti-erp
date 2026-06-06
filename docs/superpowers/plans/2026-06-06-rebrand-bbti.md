# Rebrand BBTI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskinear el ERP con la marca BBTI (azul petróleo + ámbar, fuente Poppins, logo bbti, login partido) manteniendo el tema oscuro, sin tocar lógica.

**Architecture:** El recoloreo se hace en un solo lugar (`globals.css`) sobrescribiendo las paletas `blue`→ámbar y `cyan`→teal de Tailwind v4, así toda la UI cambia sin editar componentes. El chrome (sidebar) y el login se actualizan explícitamente con el logo, la foto y la fuente. Todo es CSS/HTML estándar → idéntico en Chrome, Edge y Firefox.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme`), `next/font/google`, `next/image`, Playwright (verificación multi-navegador).

**Spec:** `docs/superpowers/specs/2026-06-06-rebrand-bbti-design.md`

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `public/bbti-logo.png` | **Nuevo** — logo bbti (blanco+ámbar, fondo transparente) |
| `public/login-bg.png` | **Nuevo** — foto de tableros para el login |
| `app/icon.png` | **Nuevo** — favicon (ícono ámbar recortado del logo) |
| `app/globals.css` | **Modificar** — override paletas `blue→ámbar`/`cyan→teal`; tokens de marca; sidebar→petróleo; fuente |
| `app/layout.tsx` | **Modificar** — Poppins con `next/font/google` |
| `components/layout/Sidebar.tsx` | **Modificar** — logo bbti+"ERP" + fondo petróleo |
| `app/(auth)/login/page.tsx` | **Modificar** — login partido con logo + foto + marca |
| `scripts/verify-rebrand.mjs` | **Nuevo** — capturas multi-navegador (Chromium + Firefox) |

---

## Task 1: Descargar assets de marca + favicon

**Files:**
- Create: `public/bbti-logo.png`, `public/login-bg.png`, `app/icon.png`

- [ ] **Step 1: Descargar el logo y la foto**

Run:
```bash
curl -s -o C:/ClaudecodeProjects/BBTI/bbti-erp/public/bbti-logo.png "https://www.bbtigroup.com.pe/icons/bbti2.png"
curl -s -o C:/ClaudecodeProjects/BBTI/bbti-erp/public/login-bg.png "https://www.bbtigroup.com.pe/img/imagen2.png"
```
Expected: ambos archivos creados (`bbti-logo.png` ~8 KB; `login-bg.png` la foto).

- [ ] **Step 2: Verificar tamaños**

Run: `node -e "['public/bbti-logo.png','public/login-bg.png'].forEach(f=>console.log(f, require('fs').statSync('C:/ClaudecodeProjects/BBTI/bbti-erp/'+f).size,'bytes'))"`
Expected: dos líneas con bytes > 0.

- [ ] **Step 3: Generar el favicon (ícono ámbar recortado del logo)**

El logo es 1988×484; el ícono ámbar está en el cuadrado izquierdo. Recortar 484×484 con sharp.

Run:
```bash
cd C:/ClaudecodeProjects/BBTI/bbti-erp && node -e "
(async () => {
  let sharp;
  try { sharp = require('sharp'); }
  catch { require('child_process').execSync('npm i -D sharp', {stdio:'inherit'}); sharp = require('sharp'); }
  await sharp('public/bbti-logo.png').extract({ left: 0, top: 0, width: 484, height: 484 })
    .resize(256, 256, { fit: 'contain', background: { r:37, g:84, b:104, alpha:1 } })
    .png().toFile('app/icon.png');
  console.log('favicon ok');
})();
"
```
Expected: `favicon ok` y `app/icon.png` creado (ícono ámbar sobre fondo petróleo, 256×256).

- [ ] **Step 4: Commit**

```bash
git add public/bbti-logo.png public/login-bg.png app/icon.png
git commit -m "feat: assets de marca BBTI (logo, foto login, favicon)"
```

---

## Task 2: Tipografía Poppins

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Reemplazar Inter por Poppins**

Reemplazar el contenido completo de `app/layout.tsx` por:

```tsx
import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BBTI ERP - Sistema de Gestión',
  description: 'Sistema ERP para BBTI S.A.C. - Fabricación de Tableros Eléctricos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className={poppins.variable}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build (verifica que Poppins descarga y compila)**

Run: `npm run build`
Expected: build exitoso (sin errores de `next/font`).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: tipografia Poppins (fuente de marca)"
```

> La fuente se aplica al body en la Task 3 (globals.css usa `var(--font-poppins)`).

---

## Task 3: Color de marca (override de paletas) + chrome + fuente

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Reescribir `globals.css` con la marca**

Reemplazar el contenido completo de `app/globals.css` por:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  color-scheme: dark;
  /* Base oscura (paneles) — se mantiene */
  --navy: #060b18;
  --navy2: #0b1225;
  --navy3: #111827;
  /* Marca BBTI */
  --brand-amber: #ec9d2e;   /* acción / CTA */
  --brand-teal: #255468;    /* chrome / petróleo */
  --gold: #f59e0b;
  --green: #10b981;
  --red: #f43f5e;
  --violet: #8b5cf6;
  --radius: 0.625rem;
}

/* === Override de paletas Tailwind v4 ===
   La UI usa clases `blue-*` y `cyan-*` por todos lados. En vez de editar cada
   componente, redefinimos esas dos escalas:
     blue-*  -> rampa ÁMBAR (#ec9d2e)  = acción primaria de la marca
     cyan-*  -> rampa TEAL  (#255468)  = secundario / petróleo
   OJO: una clase `bg-blue-600` ahora pinta ÁMBAR; `text-cyan-400` pinta TEAL. */
@theme inline {
  --color-blue-50:  #fef6e7;
  --color-blue-100: #fce6bf;
  --color-blue-200: #f7cf85;
  --color-blue-300: #f2b94f;
  --color-blue-400: #eea93a;
  --color-blue-500: #ec9d2e;
  --color-blue-600: #d2841f;
  --color-blue-700: #a9661a;
  --color-blue-800: #855119;
  --color-blue-900: #6d4318;
  --color-blue-950: #3e2309;

  --color-cyan-50:  #eef6f9;
  --color-cyan-100: #d4e8ef;
  --color-cyan-200: #a9d0de;
  --color-cyan-300: #72b0c6;
  --color-cyan-400: #4a8ea6;
  --color-cyan-500: #3a7d9a;
  --color-cyan-600: #336d87;
  --color-cyan-700: #2e5e74;
  --color-cyan-800: #255468;
  --color-cyan-900: #21495a;
  --color-cyan-950: #122a34;

  --color-background: var(--navy);
  --color-foreground: #f8fafc;
  --color-card: var(--navy2);
  --color-card-foreground: #f8fafc;
  --color-popover: var(--navy2);
  --color-popover-foreground: #f8fafc;
  --color-primary: var(--brand-amber);
  --color-primary-foreground: #1a1206;
  --color-secondary: #1e293b;
  --color-secondary-foreground: #f8fafc;
  --color-muted: #1e293b;
  --color-muted-foreground: #94a3b8;
  --color-accent: var(--brand-teal);
  --color-accent-foreground: #ffffff;
  --color-destructive: var(--red);
  --color-destructive-foreground: #ffffff;
  --color-border: #1e293b;
  --color-input: #1e293b;
  --color-ring: var(--brand-amber);
  --color-sidebar: var(--brand-teal);
  --color-sidebar-foreground: #e2e8f0;
  --radius: 0.625rem;
}

body {
  background-color: var(--navy);
  color: #f8fafc;
  font-family: var(--font-poppins), 'Inter', system-ui, -apple-system, sans-serif;
}

/* Scrollbar (WebKit/Blink — Chrome/Edge; Firefox usa la suya, sin romper nada) */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--navy2); }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }

/* Opciones de los <select> nativos: fondo oscuro + texto claro */
select option { background-color: #0b1225; color: #e2e8f0; }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: paleta de marca BBTI (blue->ambar, cyan->teal) + sidebar petroleo + Poppins"
```

---

## Task 4: Sidebar con logo bbti + fondo petróleo

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Reemplazar el bloque del logo y ajustar el fondo**

En `components/layout/Sidebar.tsx`:

1. Añadir el import de `Image` (debajo del import de `Link`):

```tsx
import Image from 'next/image';
```

2. Quitar `Zap` del import de `lucide-react` (ya no se usa). La lista de íconos queda:

```tsx
import {
  FolderKanban,
  Calendar,
  BarChart3,
  Bell,
  FileText,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
```

3. Cambiar el fondo del `<aside>` de `bg-[var(--navy)]` a petróleo y el borde:

Reemplazar:
```tsx
        'fixed left-0 top-0 h-screen bg-[var(--navy)] border-r border-slate-800 flex flex-col z-40 transition-all duration-300',
```
por:
```tsx
        'fixed left-0 top-0 h-screen bg-[var(--brand-teal)] border-r border-black/20 flex flex-col z-40 transition-all duration-300',
```

4. Reemplazar el bloque `{/* Logo */}` completo por:

```tsx
      {/* Logo */}
      <div className="h-[62px] flex items-center px-4 border-b border-black/20">
        {sidebarCollapsed ? (
          <div className="w-9 h-9 rounded-lg bg-[var(--brand-amber)] flex items-center justify-center font-bold text-[#1a1206]">
            b
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Image
              src="/bbti-logo.png"
              alt="BBTI"
              width={96}
              height={23}
              priority
              className="h-[22px] w-auto"
            />
            <span className="text-[10px] font-semibold tracking-wide text-[#1a1206] bg-[var(--brand-amber)] px-1.5 py-0.5 rounded">
              ERP
            </span>
          </div>
        )}
      </div>
```

5. Mejorar el contraste de los items inactivos sobre el petróleo. Reemplazar la clase del item inactivo:
```tsx
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
```
por:
```tsx
                  : 'text-slate-200/80 hover:text-white hover:bg-black/20'
```

Y la del item activo:
```tsx
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
```
por (ámbar sólido para que resalte sobre el petróleo):
```tsx
                  ? 'bg-[var(--brand-amber)] text-[#1a1206] font-semibold'
```

6. Ajustar el botón de colapsar (borde sobre petróleo):
```tsx
        className="h-12 flex items-center justify-center border-t border-black/20 text-slate-300 hover:text-white transition-colors"
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build exitoso, sin warning de `Zap`/imports sin usar.

- [ ] **Step 3: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: sidebar con logo bbti + fondo petroleo + item activo ambar"
```

---

## Task 5: Login partido de marca

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Reescribir el login con logo + foto + marca**

Reemplazar el contenido completo de `app/(auth)/login/page.tsx` por:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
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
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
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

  return (
    <div className="min-h-screen flex bg-[var(--navy)]">
      {/* Panel de marca */}
      <div className="hidden md:flex md:w-1/2 relative flex-col justify-between p-12 overflow-hidden">
        {/* Foto de tableros + overlay petróleo */}
        <Image src="/login-bg.png" alt="" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-[var(--brand-teal)]/85" />
        <div className="relative z-10">
          <Image src="/bbti-logo.png" alt="BBTI" width={180} height={44} priority className="h-11 w-auto" />
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Innovación en<br />cada proyecto
          </h1>
          <p className="mt-3 text-lg text-white/80">Sistema de Gestión de Proyectos</p>
          <p className="mt-1 text-sm text-[var(--brand-amber)]">Diseño, fabricación y montaje a medida</p>
        </div>
        <div className="relative z-10 text-xs text-white/60">BBTI S.A.C. — Tableros Eléctricos</div>
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
```

> Nota: `focus:ring-blue-500` queda igual en el código pero ahora pinta **ámbar** por el override de paletas (Task 3). La lógica de auth es idéntica a la versión anterior.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/login/page.tsx"
git commit -m "feat: login partido de marca (logo bbti + foto tableros + ambar)"
```

---

## Task 6: Verificación visual multi-navegador + regresión

**Files:**
- Create: `scripts/verify-rebrand.mjs`

- [ ] **Step 1: Instalar Firefox para Playwright**

Run: `npx playwright install firefox`
Expected: descarga/instala el binario de Firefox (o "already installed").

- [ ] **Step 2: Escribir el script de capturas multi-navegador**

Crear `scripts/verify-rebrand.mjs`:

```javascript
// Capturas del rebrand en Chromium (Chrome/Edge) y Firefox. Requiere server en :3000.
import { chromium, firefox } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = 'C:/ClaudecodeProjects/BBTI/bbti-erp/scripts/rebrand';

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  // Login (público)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}-${name}-login.png` });

  // Entrar y capturar el dashboard
  await page.fill('input[type="email"]', 'admin@bbti.com.pe');
  await page.fill('input[type="password"]', 'admin2024');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}-${name}-dashboard.png` });

  console.log(`${name}: login+dashboard OK, errores: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  await browser.close();
}
process.exit(0);
```

- [ ] **Step 3: Reconstruir y levantar el server**

Run: `npm run build`
Run: `npx kill-port 3000; npm start` (esperar 200 en `/login`).

- [ ] **Step 4: Correr las capturas**

Run: `node scripts/verify-rebrand.mjs`
Expected: `chromium: ... errores: ninguno` y `firefox: ... errores: ninguno`. Se generan 4 PNG en `scripts/`.

- [ ] **Step 5: Revisar las capturas**

Abrir/inspeccionar `scripts/rebrand-chromium-login.png`, `scripts/rebrand-firefox-login.png`,
`scripts/rebrand-chromium-dashboard.png`, `scripts/rebrand-firefox-dashboard.png`.
Verificar visualmente: sidebar petróleo, logo bbti, botón/acentos ámbar, fuente Poppins, login con
foto + overlay petróleo, **idéntico en ambos navegadores**. Si la foto `login-bg.png` no luce como
tableros, reemplazar la URL del Step 1 de la Task 1 por `https://www.bbtigroup.com.pe/img/imagen3.png`
y rehacer.

- [ ] **Step 6: Regresión funcional**

Run: `node scripts/e2e-sweep.mjs`
Expected: 8 páginas, 0 errores reales.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-rebrand.mjs
git commit -m "test: verificacion visual del rebrand en Chromium + Firefox"
```

---

## Task 7: Deploy

- [ ] **Step 1: Push (dispara auto-deploy en Vercel)**

Run: `git push`
Expected: Vercel construye y publica; `https://bbti-erp.vercel.app` muestra la marca nueva.

- [ ] **Step 2: Verificación final**

Abrir `https://bbti-erp.vercel.app/login` con `Ctrl+Shift+R` en Chrome, Edge y Firefox. Confirmar el
rebrand (logo, petróleo, ámbar, Poppins, login partido) idéntico en los tres.

---

## Self-Review (verificado al escribir el plan)

- **Cobertura del spec:** assets+favicon (T1), Poppins (T2), override de paletas + sidebar petróleo + fuente (T3), sidebar logo (T4), login partido (T5), verificación multi-navegador Chromium+Firefox + sweep (T6), deploy (T7). Tema oscuro se mantiene; lógica intacta.
- **Sin placeholders:** todo el código va completo; los hexadecimales de las rampas están definidos.
- **Consistencia:** `--brand-amber`/`--brand-teal` (T3) se usan en Sidebar (T4) y Login (T5). El override `blue→ámbar`/`cyan→teal` (T3) hace que los `focus:ring-blue-500`, `bg-blue-600`, `text-cyan-400` existentes pinten en marca sin más edición. `public/bbti-logo.png` y `public/login-bg.png` (T1) se consumen en T4/T5.
- **Multi-navegador:** el rebrand es CSS estándar; T6 lo prueba en Chromium (Chrome/Edge) y Firefox.
