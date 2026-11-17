// Pruebas del Plan Pro sin red: sesión firmada, firma de Stripe y validación del logo.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { hashToken, isValidLogo, newLoginToken, signSession, verifySession, verifyStripeSignature } from '../lib/pro/crypto.ts';

void test('sesión: válida, manipulada, otra clave y caducada', () => {
  const now = 1_800_000_000_000;
  const v = signSession('Ana@Ej.com', 'secreto', now);
  assert.equal(verifySession(v, 'secreto', now), 'ana@ej.com');
  assert.equal(verifySession(v, 'otra', now), null);
  const [, exp, sig] = v.split('.');
  assert.equal(verifySession(`${Buffer.from('pro@x.com').toString('base64url')}.${exp}.${sig}`, 'secreto', now), null);
  assert.equal(verifySession(v, 'secreto', now + 31 * 86_400_000), null);
  assert.equal(verifySession(undefined, 'secreto', now), null);
  assert.equal(verifySession(v, '', now), null);
});

void test('firma de webhook de Stripe', () => {
  const now = 1_800_000_000_000;
  const t = Math.floor(now / 1000);
  const body = '{"type":"checkout.session.completed"}';
  const sig = createHmac('sha256', 'whsec_x').update(`${t}.${body}`).digest('hex');
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_x', now), true);
  assert.equal(verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, 'whsec_x', now), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_y', now), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_x', now + 600_000), false);
  assert.equal(verifyStripeSignature(body, null, 'whsec_x', now), false);
});

void test('token de acceso y logo', () => {
  const { token, hash } = newLoginToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.equal(hashToken(token), hash);
  assert.equal(isValidLogo('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isValidLogo('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isValidLogo('https://x.com/logo.png'), false);
  assert.equal(isValidLogo(`data:image/png;base64,${'A'.repeat(210_000)}`), false);
});
