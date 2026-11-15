// Descarga segura de la página auditada: solo http(s) público, redirecciones verificadas una a una, límites de tiempo y tamaño.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import type { PageData } from './checks.ts';

const UA = 'Mozilla/5.0 (compatible; AgenticsSEOAudit/1.0)';
const MAX_BYTES = 3_000_000;

export class AuditInputError extends Error {
  readonly status = 400;
}

function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function normalizeUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2000) throw new AuditInputError('Introduce una URL válida.');
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new AuditInputError('La URL no es válida.'); }
  if (!/^https?:$/.test(url.protocol)) throw new AuditInputError('Solo se admiten URLs http o https.');
  if (url.username || url.password) throw new AuditInputError('La URL no puede incluir credenciales.');
  url.hash = '';
  return url;
}

async function assertPublic(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new AuditInputError('Solo se pueden auditar webs públicas.');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new AuditInputError(`No se pudo resolver ${host}.`); })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivate)) throw new AuditInputError('Solo se pueden auditar webs públicas.');
}

async function readLimited(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); break; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** GET siguiendo hasta 6 redirecciones, validando cada destino. */
async function safeGet(start: URL, timeoutMs: number) {
  let url = start;
  let redirects = 0;
  const t0 = Date.now();
  for (;;) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'es,en;q=0.8' } });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (++redirects > 6) throw new AuditInputError('Demasiadas redirecciones.');
      url = new URL(location, url);
      if (!/^https?:$/.test(url.protocol)) throw new AuditInputError('Redirección a un protocolo no permitido.');
      continue;
    }
    return { res, url, redirects, ttfbMs: Date.now() - t0 };
  }
}

async function fetchText(url: URL, timeoutMs = 6000): Promise<{ status: number; text: string } | null> {
  try {
    const { res } = await safeGet(url, timeoutMs);
    return { status: res.status, text: res.ok ? await readLimited(res) : '' };
  } catch {
    return null;
  }
}

/** Estado HTTP que devuelve la página a un user-agent concreto (sin leer el cuerpo). */
async function statusFor(url: URL, userAgent: string): Promise<number | null> {
  try {
    await assertPublic(url);
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': userAgent, accept: 'text/html' } });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

/** Días hasta la caducidad del certificado TLS y su emisor. */
function readCertificate(host: string): Promise<{ daysLeft: number; issuer: string } | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 5000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return resolve(null);
      const issuer = Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : (cert.issuer?.O ?? cert.issuer?.CN ?? '');
      resolve({ daysLeft: Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000), issuer: String(issuer) });
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

export async function fetchPage(input: string): Promise<PageData> {
  const url = normalizeUrl(input);
  let page;
  try {
    page = await safeGet(url, 15_000);
  } catch (error) {
    if (error instanceof AuditInputError) throw error;
    throw new AuditInputError(`No se pudo acceder a ${url.host} (${error instanceof Error && error.name === 'TimeoutError' ? 'tiempo agotado' : 'error de conexión'}).`);
  }
  const { res, url: finalUrl, redirects, ttfbMs } = page;
  const type = res.headers.get('content-type') ?? '';
  if (res.ok && !/html|xml/i.test(type)) throw new AuditInputError(`La URL no devuelve HTML (${type || 'tipo desconocido'}).`);
  const html = await readLimited(res);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const origin = finalUrl.origin;
  const BOTS: [string, string][] = [
    ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
    ['ClaudeBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['PerplexityBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'],
  ];
  const [robots, llms, ssl, ...botStatuses] = await Promise.all([
    fetchText(new URL('/robots.txt', origin)),
    fetchText(new URL('/llms.txt', origin)),
    finalUrl.protocol === 'https:' ? readCertificate(finalUrl.hostname) : Promise.resolve(null),
    ...BOTS.map(([, ua]) => statusFor(finalUrl, ua)),
  ]);
  const robotsTxt = robots && robots.status === 200 && !/<html/i.test(robots.text.slice(0, 500)) ? robots.text : null;
  const declared = robotsTxt?.match(/^\s*sitemap\s*:\s*(\S+)/im)?.[1];
  let sitemapXml: string | null = null;
  for (const candidate of [declared, new URL('/sitemap.xml', origin).toString()].filter((x): x is string => !!x)) {
    try {
      const sm = await fetchText(new URL(candidate, origin));
      if (sm && sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.text)) { sitemapXml = sm.text; break; }
    } catch { /* URL de sitemap inválida */ }
  }
  return {
    url: url.toString(),
    finalUrl: finalUrl.toString(),
    status: res.status,
    headers,
    html,
    redirects,
    ttfbMs,
    robotsTxt,
    sitemapFound: !!declared || !!sitemapXml,
    sitemapXml,
    botResponses: BOTS.map(([bot], i) => ({ bot, status: botStatuses[i] as number | null })),
    ssl: ssl as { daysLeft: number; issuer: string } | null,
    llmsTxtFound: !!llms && llms.status === 200 && llms.text.length > 20 && !/<html/i.test(llms.text.slice(0, 500)),
  };
}
