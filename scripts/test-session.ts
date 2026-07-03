/**
 * Unit tests del token de sesión JWT.
 * Ejecutar: JWT_SECRET=un_secreto_de_al_menos_32_caracteres!! npx tsx scripts/test-session.ts
 */
import { SignJWT } from 'jose';
import { createSessionToken, verifySessionToken } from '../lib/auth/session';

let pass = 0, fail = 0;
const assert = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.error(`  ❌ ${msg}`); }
};

async function main() {
  const payload = { sub: 'user-123', rol: 'Administrador', nombre: 'Admin Sistema' };

  const token = await createSessionToken(payload);
  assert(typeof token === 'string' && token.split('.').length === 3, 'genera un JWT de 3 partes');

  const back = await verifySessionToken(token);
  assert(back !== null, 'el token propio verifica');
  assert(back?.sub === 'user-123', 'round-trip de sub');
  assert(back?.rol === 'Administrador', 'round-trip de rol');
  assert(back?.nombre === 'Admin Sistema', 'round-trip de nombre');

  const [h, p, s] = token.split('.');
  const tampered = await verifySessionToken(`${h}.${p}.${s.slice(0, -2)}xx`);
  assert(tampered === null, 'firma alterada → null (no lanza)');

  assert((await verifySessionToken('basura')) === null, 'token malformado → null');
  assert((await verifySessionToken('')) === null, 'token vacío → null');

  const hs512 = await new SignJWT({ rol: 'X', nombre: 'X' })
    .setProtectedHeader({ alg: 'HS512' })
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
  assert((await verifySessionToken(hs512)) === null, 'token HS512 (alg no fijado) → null');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
