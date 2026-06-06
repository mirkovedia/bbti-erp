# Diseño: Integración de la marca BBTI al ERP (rebrand)

**Fecha:** 2026-06-06
**Proyecto:** BBTI ERP
**Estado:** Aprobado por el usuario (pendiente revisión del spec)

## Problema

El ERP usa un tema oscuro genérico (navy + azul + cian, fuente Inter) que no refleja la identidad de
la empresa. La web corporativa **bbtigroup.com.pe** ya tiene una marca definida que el sistema debe
adoptar para verse parte de la misma empresa.

## Branding extraído de bbtigroup.com.pe

- **Color primario (chrome):** azul petróleo `#255468` — fondo de la barra de navegación del sitio.
- **Acento / acción (CTA):** ámbar `#ec9d2e` (botón "Contáctanos", titular del hero); variante `#ffb433`.
- **Base del sitio:** blanco, texto negro (NO se adopta — el ERP sigue oscuro).
- **Tipografía:** **Poppins**.
- **Logo:** wordmark "bbti" minúsculas + ícono ámbar de barras. PNG transparente, blanco+ámbar,
  diseñado para fondo oscuro (`/icons/bbti2.png`, 1988×484, 8.7 KB).
- **Rubro:** tableros eléctricos (coincide con lo que gestiona el ERP).

## Decisión

**Tema oscuro + acentos BBTI.** Se conserva el fondo oscuro (mejor para un ERP de uso intenso y
denso en datos), pero todo el "chrome" y los acentos pasan a la marca: sidebar petróleo, acciones
ámbar, secundario teal, fuente Poppins, logo bbti. La barra de navegación del propio sitio es oscura,
así que un ERP oscuro es coherente con la marca.

## Sistema de color

| Rol | Hoy | Nuevo (BBTI) |
|-----|-----|--------------|
| Chrome (sidebar) | navy | azul petróleo `#255468` |
| Acción primaria (botones, activo, links, foco, progreso) | azul `#2563eb` | ámbar `#ec9d2e` |
| Acento secundario | cian `#06b6d4` | teal claro (≈ `#3a7d9a`) |
| Éxito / Error / Violeta | verde / rojo / violeta | se mantienen |
| Fondo de paneles | navy `#060b18`/`#0b1225` | se mantiene (oscuro) |
| Texto | `#f8fafc` | se mantiene |

### Enfoque técnico: override de paletas Tailwind v4 (Approach A, aprobado)

Los componentes usan clases Tailwind crudas (`bg-blue-600`, `text-cyan-400`) en cientos de lugares.
En vez de editar cada componente, se **redefinen las escalas `blue` y `cyan` de Tailwind** en el
bloque `@theme` de `globals.css`:
- `--color-blue-50 … --color-blue-950` → **rampa ámbar** (anclada en `#ec9d2e` ≈ `blue-500`).
- `--color-cyan-50 … --color-cyan-950` → **rampa teal** (anclada en `#255468` ≈ `cyan-800`, con
  pasos más claros para acentos de texto/íconos).

Así toda la app se reskinea desde un solo archivo, reversible y sin tocar componentes. Se documenta
con un comentario en `globals.css` que `blue` ahora pinta ámbar y `cyan` pinta teal (para no
confundir a quien lea el código).

> Los hexadecimales exactos de cada rampa se fijan en el plan de implementación.

### Tokens de chrome explícitos

- `--color-sidebar` pasa de `var(--navy)` a **`#255468`** (petróleo).
- Se añade `--brand-amber: #ec9d2e` y `--brand-teal: #255468` como tokens de marca para usos
  puntuales (login, favicon).

## Tipografía

Cargar **Poppins** con `next/font/google` en `app/layout.tsx` (pesos 400/500/600/700), exponerla
como variable CSS y usarla en el `body` de `globals.css` (reemplaza `'Inter'`).

## Logo y favicon

- Descargar `https://www.bbtigroup.com.pe/icons/bbti2.png` → `public/bbti-logo.png`.
- **Sidebar:** reemplazar el texto "BBTI ERP" + ícono rayo por el logo bbti (`next/image`) + una
  etiqueta pequeña **"ERP"** (pill) que distingue el sistema interno de la web pública.
- **Login:** logo bbti en el panel de marca.
- **Favicon:** `app/icon.png` generado a partir del ícono ámbar del logo (cuadrado).

## Chrome (marco de la interfaz): sidebar y topbar

> Nota: "chrome" aquí es el término de diseño para el **marco visual de la app** (sidebar + topbar),
> NO el navegador Google Chrome. Todo el rebrand es CSS/HTML estándar y se ve igual en Chrome, Edge
> y Firefox.

- **Sidebar:** fondo petróleo `#255468`; ítem de menú activo en ámbar (sale del override de paletas);
  texto de items en `#e2e8f0`/blanco. Logo bbti+ERP en la cabecera.
- **Topbar:** se mantiene oscuro (`navy2`) para enmarcar el contenido; el badge de rol y la campanita
  toman los acentos de marca automáticamente por el override.

## Login partido (split-screen)

Reescribir `app/(auth)/login/page.tsx` a 2 columnas. **La lógica de autenticación con Supabase NO
cambia** — solo el envoltorio visual; se conservan el estado de carga (spinner) y los mensajes de
error existentes.

- **Panel izquierdo** (`hidden md:flex`): fondo petróleo con degradado y la **foto de tableros** del
  sitio de fondo (descargada a `public/login-bg.jpg`) con overlay petróleo para legibilidad. Encima:
  **logo bbti** grande (blanco) + lema *"Innovación en cada proyecto"* + subtítulo *"Sistema de
  Gestión de Proyectos"*. Acentos ámbar.
- **Panel derecho:** el formulario actual (email + contraseña + botón "Entrar") reestilizado con la
  marca; botón primario ámbar; **autofocus** en el email al cargar.
- **Móvil** (`< md`): se apila — logo bbti sobre una franja petróleo arriba, formulario debajo.

```
┌─────────────────────┬──────────────────────┐
│  ▓ petróleo + foto  │                      │
│   bbti  (logo)      │   Iniciar sesión     │
│   Innovación en      │   Email   [______]   │
│   cada proyecto      │   Clave   [______]   │
│   Sistema de Gestión │   [   Entrar   ]     │  ← ámbar
└─────────────────────┴──────────────────────┘
```

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `app/globals.css` | **Modificar** — override paletas `blue→ámbar`/`cyan→teal`; tokens de marca; `--color-sidebar`→petróleo; var de fuente; comentario explicativo |
| `app/layout.tsx` | **Modificar** — Poppins con `next/font/google` |
| `public/bbti-logo.png` | **Nuevo** — logo descargado |
| `public/login-bg.jpg` | **Nuevo** — foto de tableros para el login |
| `app/icon.png` | **Nuevo** — favicon desde el ícono ámbar |
| `components/layout/Sidebar.tsx` | **Modificar** — logo bbti+"ERP" + fondo petróleo |
| `app/(auth)/login/page.tsx` | **Modificar** — pantalla partida (auth intacta) |

## Verificación

- `npm run build` limpio.
- **Captura visual multi-navegador con Playwright** del login y del dashboard tras login, en
  **Chromium (Chrome/Edge) Y Firefox**: confirmar que petróleo/ámbar/Poppins/logo se ven bien, con
  contraste suficiente (texto sobre petróleo, ámbar sobre oscuro) e idénticos en ambos motores.
- `scripts/e2e-sweep.mjs` (8 páginas, 0 errores) → el reskin no rompe funcionalidad.
- Deploy a producción y verificación con `Ctrl+Shift+R`.

## Fuera de alcance (YAGNI)

- Tema claro (se mantiene oscuro).
- Cambios de lógica de negocio o de componentes individuales (el color sale del override de paletas).
- Selector de "acceso rápido por rol" en el login (no elegido).
- Modo de alternancia de temas / preferencia por usuario.
