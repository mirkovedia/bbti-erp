'use client';

import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con un retardo: solo se actualiza tras `delay` ms sin cambios.
 * Útil para que el filtrado/búsqueda no se recalcule en cada tecla.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
