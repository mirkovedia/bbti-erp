import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'bbti_session';
// jose funciona en runtime edge (jsonwebtoken NO — por eso se eligió jose).

export async function proxy(request: NextRequest) {
  // Rutas que deben pasar SIN sesión:
  // - /api/cron/*: se autentica con CRON_SECRET en su handler.
  // - /api/health: lo consulta el healthcheck de Docker.
  // - /api/auth/*: login/logout no tienen sesión todavía (sin este bypass,
  //   el POST de login se redirigiría a /login y sería imposible loguearse);
  //   /api/auth/me valida la sesión por su cuenta y responde 401 JSON.
  // Prefijos con frontera exacta ('/x' o '/x/...') para no matchear rutas
  // hermanas futuras (p. ej. /api/authorize) — esto es el gate de seguridad.
  const pathname = request.nextUrl.pathname;
  if (
    pathname === '/api/health' ||
    pathname === '/api/cron' || pathname.startsWith('/api/cron/') ||
    pathname === '/api/auth' || pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next({ request });
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
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
