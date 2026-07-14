import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'bbti_session';
// jose funciona en runtime edge (jsonwebtoken NO — por eso se eligió jose).

/**
 * Cabeceras de seguridad en TODAS las respuestas.
 * - CSP: red de seguridad contra XSS e iframes falsos (frame-ancestors 'none'
 *   bloquea clickjacking/phishing por embebido). connect-src permite el
 *   endpoint S3/R2 (el navegador sube archivos DIRECTO con presigned URLs).
 * - Se calculan en el proxy (runtime) y no en next.config (build) porque el
 *   endpoint R2 llega por variable de entorno al arrancar el contenedor.
 */
const applySecurityHeaders = (res: NextResponse): NextResponse => {
  let connectSrc = "'self'";
  const r2 = process.env.R2_ENDPOINT_URL;
  if (r2) {
    try {
      const u = new URL(r2);
      // path-style (MinIO dev) usa el host tal cual; virtual-host (R2 real)
      // antepone el bucket como subdominio → se permite también *.host
      connectSrc += ` ${u.protocol}//${u.host} ${u.protocol}//*.${u.host}`;
    } catch {
      // R2_ENDPOINT_URL malformado: no ampliar connect-src
    }
  }
  const esProd = process.env.NODE_ENV === 'production';
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Next inyecta scripts inline de hidratación; en dev el HMR necesita eval
      `script-src 'self' 'unsafe-inline'${esProd ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.COOKIE_SECURE === 'true') {
    // Solo detrás de HTTPS real (Traefik): fuerza HTTPS en visitas futuras
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return res;
};

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Anti-CSRF (cinturón sobre SameSite=lax): en mutaciones, si el navegador
  // envía Origin, debe coincidir con el host del request (detrás de Traefik,
  // X-Forwarded-Host). Clientes sin Origin (curl, cron, tests) pasan — esto
  // defiende contra navegadores en sitios ajenos, no contra herramientas.
  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const origin = request.headers.get('origin');
    if (origin) {
      const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (!originHost || originHost !== host) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
        );
      }
    }
  }

  // Rutas que deben pasar SIN sesión:
  // - /api/cron/*: se autentica con CRON_SECRET en su handler.
  // - /api/health: lo consulta el healthcheck de Docker.
  // - /api/auth/*: login/logout no tienen sesión todavía (sin este bypass,
  //   el POST de login se redirigiría a /login y sería imposible loguearse);
  //   /api/auth/me valida la sesión por su cuenta y responde 401 JSON.
  // Prefijos con frontera exacta ('/x' o '/x/...') para no matchear rutas
  // hermanas futuras (p. ej. /api/authorize) — esto es el gate de seguridad.
  if (
    pathname === '/api/health' ||
    pathname === '/api/cron' || pathname.startsWith('/api/cron/') ||
    pathname === '/api/auth' || pathname.startsWith('/api/auth/')
  ) {
    return applySecurityHeaders(NextResponse.next({ request }));
  }

  let autenticado = false;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.JWT_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ['HS256'] });
      autenticado = true;
    } catch {
      autenticado = false; // token vencido o alterado → tratar como anónimo
    }
  }

  if (!autenticado && !pathname.startsWith('/login') && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(NextResponse.next({ request }));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
