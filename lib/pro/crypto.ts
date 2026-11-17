// Utilidades puras del Plan Pro (sin red ni base de datos): sesión firmada y firma de webhooks de Stripe.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const SESSION_COOKIE = 'seo_pro';
export const SESSION_DAYS = 30;

/** Cookie de sesión: base64url(email).expiraciónMs.firma (HMAC-SHA256 con SESSION_SECRET). */
export function signSession(email: string, secret: string, now = Date.now()): string {
  const exp = now + SESSION_DAYS * 86_400_000;
  const body = `${Buffer.from(email.toLowerCase()).toString('base64url')}.${exp}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifySession(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || !secret) return null;
  const [mail, exp, sig] = value.split('.');
  if (!mail || !exp || !sig) return null;
  const expected = createHmac('sha256', secret).update(`${mail}.${exp}`).digest('base64url');
  if (!safeEqual(sig, expected) || Number(exp) < now) return null;
  return Buffer.from(mail, 'base64url').toString();
}

/** Token de un solo uso para el enlace de acceso. Solo se guarda su hash. */
export function newLoginToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Verifica la cabecera Stripe-Signature (t=...,v1=...) con tolerancia de 5 minutos. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => safeEqual(s, expected));
}

/** Logo de marca: solo data URL png/jpeg/webp (sin SVG, por seguridad) y como máximo ~150 KB. */
export function isValidLogo(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 200_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
}

export const PRO_ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
