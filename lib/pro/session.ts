// Sesión Pro en cookie httpOnly firmada. Requiere SESSION_SECRET (cadena aleatoria larga).
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from './crypto';

const secret = () => process.env.SESSION_SECRET || '';
const secure = () => (process.env.NODE_ENV === 'production' ? '; Secure' : '');

export async function sessionEmail(): Promise<string | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret());
}

/** Cabecera Set-Cookie que abre la sesión. */
export const sessionCookie = (email: string) =>
  `${SESSION_COOKIE}=${signSession(email, secret())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure()}`;
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`;

/** Redirección 303 que, opcionalmente, fija una cookie. */
export const redirectTo = (url: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { location: url, 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) } });
