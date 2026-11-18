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

void test('IA: Claude usa salida estructurada (sin tool_choice forzado) y lee el JSON del texto', async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  let sent: Record<string, unknown> = {};
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"ok":true}' }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const { runStructured } = await import('../lib/ai-client.ts');
    const out = await runStructured({ name: 'x', system: 's', user: 'u', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } });
    assert.deepEqual(out.data, { ok: true });
    assert.equal(out.engine, 'claude');
    assert.equal('tool_choice' in sent, false);
    assert.equal((sent.output_config as { format: { type: string } }).format.type, 'json_schema');
  } finally {
    globalThis.fetch = original;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

void test('correos a leads: escapado, asunto y enlace de baja', async () => {
  const { followupMail, reviewMail, reportMail, newLeadNotice } = await import('../lib/seo-audit/emails.ts');
  const d = { name: 'Ana <b>López</b>', email: 'ana@ej.com', auditedUrl: 'https://ej.com/', score: 66.3, warnings: 3, reportUrl: 'https://auditoria.agenticsprojects.com/r/abc', unsubscribeUrl: 'https://x/api/unsubscribe?id=1&t=2',
    topIssues: [{ label: 'Cabeceras <script>', message: 'Faltan', category: 'Confianza' }] };
  const f = followupMail(d);
  assert.equal(f.subject, 'Ana, ¿pudiste revisar la auditoría de ej.com?');
  assert.ok(!f.html.includes('<script>') && f.html.includes('&lt;script&gt;'));
  assert.ok(f.html.includes('date de baja aquí') && f.html.includes('66/100'));
  assert.ok(reviewMail(d, 'https://g.page/r/x/review').html.includes('https://g.page/r/x/review'));
  assert.equal(reportMail(d).subject, 'Tu informe SEO de ej.com: 66/100');
  assert.ok(newLeadNotice(d, 'yo@ej.com').html.includes('No acepta comunicaciones'));
  const { unsubscribeToken, verifyUnsubscribe } = await import('../lib/pro/crypto.ts');
  const t = unsubscribeToken('11111111-1111-1111-1111-111111111111', 's');
  assert.equal(verifyUnsubscribe('11111111-1111-1111-1111-111111111111', t, 's'), true);
  assert.equal(verifyUnsubscribe('22222222-2222-2222-2222-222222222222', t, 's'), false);
});
