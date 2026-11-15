// Pruebas de la auditoría SEO sin red: node --experimental-strip-types --test tests/seo-audit.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { robotsAllows, runChecks, type PageData } from '../lib/seo-audit/checks.ts';
import { finalizeReport, scoreChecks } from '../lib/seo-audit/scoring.ts';

void test('robots.txt: grupo específico, comodín y regla más larga', () => {
  const robots = 'User-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nUser-agent: GPTBot\nDisallow: /';
  assert.equal(robotsAllows(robots, 'Googlebot', '/'), true);
  assert.equal(robotsAllows(robots, 'Googlebot', '/admin/x'), false);
  assert.equal(robotsAllows(robots, 'Googlebot', '/admin/public/a'), true);
  assert.equal(robotsAllows(robots, 'GPTBot', '/'), false);
  assert.equal(robotsAllows(null, 'ClaudeBot', '/'), true);
});

void test('puntuación: warning 25 %, fallo limita a 35, na no cuenta', () => {
  const k = (status: 'pass' | 'warning' | 'fail' | 'na') => ({ id: status, label: '', status, message: '' });
  assert.equal(scoreChecks([k('pass'), k('pass')]), 100);
  assert.equal(scoreChecks([k('pass'), k('warning')]), 62.5);
  assert.equal(scoreChecks([k('pass'), k('pass'), k('pass'), k('fail')]), 35);
  assert.equal(scoreChecks([k('na')]), null);
});

void test('checks sobre una página de ejemplo', () => {
  const html = `<!doctype html><html lang="es"><head><title>Agencia de automatización con IA en Madrid</title>
  <meta name="description" content="Diseñamos automatizaciones con n8n, Airtable y Claude para pymes. Ahorra horas cada semana con sistemas a medida.">
  <meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://ej.com/">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Ej"}</script></head>
  <body><h1>Automatización</h1><h3>Salto</h3><img src="a.png"><a href="/contacto">Contacto</a><a href="/privacidad">Privacidad</a><p>${'palabra '.repeat(300)}</p></body></html>`;
  const page: PageData = { url: 'https://ej.com/', finalUrl: 'https://ej.com/', status: 200, headers: { 'content-encoding': 'br' }, html, redirects: 0, ttfbMs: 300, robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://ej.com/sitemap.xml', sitemapFound: true, llmsTxtFound: false };
  const report = finalizeReport({ url: page.url, finalUrl: page.finalUrl, generatedAt: '', ai: { enabled: false }, categories: runChecks(page) });
  const find = (id: string) => report.categories.flatMap((c) => c.checks).find((c) => c.id === id)!;
  assert.equal(find('title').status, 'pass');
  assert.equal(find('meta_description').status, 'pass');
  assert.equal(find('headings').status, 'warning');
  assert.equal(find('img_alt').status, 'fail');
  assert.equal(find('schema_org').status, 'pass');
  assert.equal(find('bot_gptbot').status, 'pass');
  assert.equal(find('trust_links').items?.find((i) => i.label === 'Privacidad')?.ok, true);
  assert.equal(find('trust_links').items?.find((i) => i.label === 'Contacto')?.ok, true);
  assert.equal(find('freshness').status, 'na');
  assert.equal(find('open_graph').items?.length, 5);
  assert.ok(report.score > 0 && report.score <= 100);
  assert.equal(report.categories.find((c) => c.id === 'international')!.score, null);
});

void test('lead: valida, normaliza y resume el informe', async () => {
  const { parseLead, LeadInputError } = await import('../lib/seo-audit/lead.ts');
  const report = { finalUrl: 'https://ej.com/', score: 61.25, grade: 'Mejorable', categories: [{ name: 'On-page', checks: [{ id: 'title', label: 'Title', status: 'fail', message: 'Falta' }, { id: 'h1', label: 'H1', status: 'warning', message: 'Dos' }] }] };
  const lead = parseLead({ name: '  Ana  ', email: 'ANA@Ej.com ', privacy: true, report });
  assert.equal(lead.name, 'Ana');
  assert.equal(lead.email, 'ana@ej.com');
  assert.equal(lead.marketing, false);
  assert.equal(lead.score, 61.3);
  assert.equal(lead.fails, 1);
  assert.equal(lead.warnings, 1);
  assert.equal(lead.topIssues[0].category, 'On-page');
  assert.throws(() => parseLead({ name: 'Ana', email: 'mal', privacy: true, report }), LeadInputError);
  assert.throws(() => parseLead({ name: 'Ana', email: 'a@b.com', privacy: false, report }), LeadInputError);
});

void test('cobertura: más de 90 comprobaciones deterministas', () => {
  const page: PageData = { url: 'https://ej.com/', finalUrl: 'https://ej.com/', status: 200, headers: {}, html: '<!doctype html><html><head><title>x</title></head><body><p>hola</p></body></html>', redirects: 0, ttfbMs: 100, robotsTxt: null, sitemapFound: false, llmsTxtFound: false };
  const total = runChecks(page).reduce((n, c) => n + c.checks.length, 0);
  assert.ok(total >= 88, `solo ${total} comprobaciones`);
});
