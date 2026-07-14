/**
 * Rate-limit en memoria para el login: máx. MAX_ATTEMPTS intentos FALLIDOS
 * por clave (IP + email) dentro de una ventana de WINDOW_MS. Un login
 * correcto limpia la clave.
 *
 * En memoria a propósito: la app corre como UN contenedor detrás de Traefik;
 * si algún día hay N réplicas, migrar a un contador compartido (p. ej. tabla
 * o Redis) — con este diseño cada réplica limitaría por separado.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;

interface Entry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Entry>();

/** Poda ocasional para que el Map no crezca sin límite. */
const prune = (now: number): void => {
  if (attempts.size < 1000) return;
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
};

/** ¿La clave superó el máximo de intentos fallidos dentro de la ventana? */
export const isRateLimited = (key: string): boolean => {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
};

/** Registra un intento fallido (inicia la ventana en el primero). */
export const registerFailedAttempt = (key: string): void => {
  const now = Date.now();
  prune(now);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
};

/** Limpia la clave (login exitoso). */
export const clearAttempts = (key: string): void => {
  attempts.delete(key);
};
