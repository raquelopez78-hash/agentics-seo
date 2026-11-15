// Comprobaciones deterministas de SEO clásico y AI SEO a partir de la página ya descargada. Módulo puro.
import type { AuditCategory, AuditCheck, CategoryId, CheckItem, CheckStatus } from './scoring.ts';
import { CATEGORY_NAMES } from './scoring.ts';

export type PageData = {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  redirects: number;
  ttfbMs: number;
  robotsTxt: string | null;
  sitemapFound: boolean;
  llmsTxtFound: boolean;
  /** Contenido del sitemap (urlset) para comprobar si incluye la URL. */
  sitemapXml?: string | null;
  /** Respuesta de la página a user-agents de bots de IA (detección de bloqueo por firewall/WAF). */
  botResponses?: { bot: string; status: number | null }[];
  /** Certificado TLS de la página. */
  ssl?: { daysLeft: number; issuer: string } | null;
};

// ---------- utilidades HTML (sin dependencias) ----------
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '').trim() : null;
};
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
const meta = (html: string, key: string) => {
  const t = tags(html, 'meta').find((m) => (attr(m, 'name') ?? attr(m, 'property') ?? '').toLowerCase() === key);
  return t ? attr(t, 'content') : null;
};
const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const inner = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi'))].map((m) => stripTags(m[1]));
const cut = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function visibleText(html: string) {
  return stripTags(html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' '));
}

export function pageBasics(html: string) {
  return { title: inner(html, 'title')[0] ?? '', description: meta(html, 'description') ?? '', h1: inner(html, 'h1')[0] ?? '', text: visibleText(html) };
}

// ---------- robots.txt ----------
/** ¿Puede este user-agent rastrear la ruta? Aplica el grupo específico o "*", y la regla más larga gana (RFC 9309). */
export function robotsAllows(robots: string | null, userAgent: string, path = '/'): boolean {
  if (!robots) return true;
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else lastWasAgent = false;
  }
  const ua = userAgent.toLowerCase();
  const group = groups.find((g) => g.agents.includes(ua)) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    const pattern = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (pattern.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

// ---------- comprobaciones ----------
type Builder = (id: string, label: string, status: CheckStatus, message: string, extra?: Partial<AuditCheck>) => void;

export function runChecks(p: PageData): AuditCategory[] {
  const out: Record<CategoryId, AuditCheck[]> = { crawling: [], url_arch: [], onpage: [], content: [], structured_data: [], performance: [], mobile_a11y: [], trust_eeat: [], international: [], ai_geo: [] };
  const add = (cat: CategoryId): Builder => (id, label, status, message, extra) => out[cat].push({ id, label, status, message, ...extra });
  const html = p.html;
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html;
  const u = new URL(p.finalUrl);
  const path = u.pathname + u.search;
  const text = visibleText(html);
  const words = text ? text.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length : 0;
  const links = tags(html, 'a').map((a) => attr(a, 'href')).filter((h): h is string => !!h && !h.startsWith('#') && !/^(mailto|tel|javascript):/i.test(h));
  const resolved = links.map((h) => { try { return new URL(h, p.finalUrl); } catch { return null; } }).filter((x): x is URL => !!x);
  const internal = resolved.filter((l) => l.hostname === u.hostname);
  const linkText = tags(html, 'a').join(' ').toLowerCase() + ' ' + html.match(/<a\b[\s\S]*?<\/a>/gi)?.join(' ').toLowerCase();
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const parsedLd: unknown[] = [];
  let ldErrors = 0;
  for (const block of jsonLd) { try { parsedLd.push(JSON.parse(block)); } catch { ldErrors++; } }
  const ldTypes = new Set<string>();
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      const t = (n as Record<string, unknown>)['@type'];
      (Array.isArray(t) ? t : [t]).forEach((x) => typeof x === 'string' && ldTypes.add(x));
      Object.values(n).forEach(walk);
    }
  };
  parsedLd.forEach(walk);
  const hasType = (...t: string[]) => t.some((x) => ldTypes.has(x));

  // 1. Rastreo e indexación
  {
    const c = add('crawling');
    c('http_status', 'Código HTTP', p.status === 200 ? 'pass' : p.status < 400 ? 'warning' : 'fail', `La página responde ${p.status}.`, { fix: 'La URL canónica debe responder 200.', source: 'https://developers.google.com/search/docs/crawling-indexing/http-network-errors' });
    c('robots_txt', 'robots.txt', p.robotsTxt !== null ? 'pass' : 'warning', p.robotsTxt !== null ? 'robots.txt accesible.' : 'No se encontró /robots.txt.', { fix: 'Publica un robots.txt con la URL del sitemap.', source: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro' });
    const allowed = robotsAllows(p.robotsTxt, 'Googlebot', path);
    c('robots_allows', 'Rastreo permitido a Googlebot', allowed ? 'pass' : 'fail', allowed ? 'robots.txt permite rastrear esta URL.' : 'robots.txt bloquea esta URL a Googlebot.', { fix: 'Elimina el Disallow que afecta a esta ruta.' });
    const robotsMeta = `${meta(html, 'robots') ?? ''} ${meta(html, 'googlebot') ?? ''} ${p.headers['x-robots-tag'] ?? ''}`.toLowerCase();
    const noindex = /noindex|none/.test(robotsMeta);
    c('noindex', 'Indexable', noindex ? 'fail' : 'pass', noindex ? 'La página tiene noindex (meta robots o X-Robots-Tag).' : 'Sin directivas noindex.', { evidence: robotsMeta.trim() || undefined, fix: 'Quita noindex si quieres que aparezca en Google.' });
    const canonicalTag = tags(head, 'link').find((l) => (attr(l, 'rel') ?? '').toLowerCase() === 'canonical');
    const canonical = canonicalTag ? attr(canonicalTag, 'href') : null;
    if (!canonical) c('canonical', 'Canonical', 'warning', 'No hay <link rel="canonical">.', { fix: 'Añade un canonical autorreferente absoluto.', source: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls' });
    else {
      let same = false;
      try { const cu = new URL(canonical, p.finalUrl); same = cu.host === u.host && cu.pathname.replace(/\/$/, '') === u.pathname.replace(/\/$/, ''); } catch { /* inválido */ }
      c('canonical', 'Canonical', same ? 'pass' : 'warning', same ? 'Canonical autorreferente.' : 'El canonical apunta a otra URL.', { evidence: canonical, fix: 'Verifica que el canonical apunte a la versión preferida.' });
    }
    c('sitemap', 'Sitemap XML', p.sitemapFound ? 'pass' : 'warning', p.sitemapFound ? 'Sitemap localizado.' : 'No se encontró sitemap (robots.txt ni /sitemap.xml).', { fix: 'Genera un sitemap.xml y decláralo en robots.txt.', source: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview' });
  }

  // 2. URL y arquitectura
  {
    const c = add('url_arch');
    c('https', 'HTTPS', u.protocol === 'https:' ? 'pass' : 'fail', u.protocol === 'https:' ? 'Servida por HTTPS.' : 'La página no usa HTTPS.', { fix: 'Fuerza HTTPS con redirección 301.' });
    c('url_length', 'Longitud de URL', p.finalUrl.length <= 100 ? 'pass' : 'warning', `${p.finalUrl.length} caracteres.`, { fix: 'URLs cortas y descriptivas (< 100 caracteres).' });
    c('url_lowercase', 'URL en minúsculas', u.pathname === u.pathname.toLowerCase() ? 'pass' : 'warning', u.pathname === u.pathname.toLowerCase() ? 'Ruta en minúsculas.' : 'La ruta contiene mayúsculas.', { evidence: u.pathname });
    c('url_separators', 'Separadores', u.pathname.includes('_') ? 'warning' : 'pass', u.pathname.includes('_') ? 'Usa guiones bajos; Google recomienda guiones.' : 'Sin guiones bajos.', { source: 'https://developers.google.com/search/docs/crawling-indexing/url-structure' });
    c('url_params', 'Parámetros', [...u.searchParams.keys()].length > 2 ? 'warning' : 'pass', `${[...u.searchParams.keys()].length} parámetros en la URL.`);
    c('redirects', 'Cadena de redirecciones', p.redirects <= 1 ? 'pass' : p.redirects <= 3 ? 'warning' : 'fail', `${p.redirects} redirección(es) hasta la URL final.`, { evidence: p.redirects ? `${p.url} → ${p.finalUrl}` : undefined, fix: 'Enlaza directamente a la URL final.' });
    c('internal_links', 'Enlaces internos', internal.length >= 5 ? 'pass' : internal.length ? 'warning' : 'fail', `${internal.length} enlaces internos.`, { fix: 'Enlaza a páginas relevantes del sitio para distribuir autoridad.' });
  }

  // 3. On-page
  {
    const c = add('onpage');
    const title = inner(head, 'title')[0] ?? '';
    c('title', 'Title', !title ? 'fail' : title.length >= 30 && title.length <= 60 ? 'pass' : 'warning', !title ? 'Falta la etiqueta <title>.' : `${title.length} caracteres (ideal 30–60; Google suele truncar a partir de ~60).`, { evidence: title ? cut(title) : undefined, fix: 'Título único con la keyword principal al inicio.', source: 'https://developers.google.com/search/docs/appearance/title-link' });
    const desc = meta(head, 'description') ?? '';
    c('meta_description', 'Meta description', !desc ? 'fail' : desc.length >= 70 && desc.length <= 160 ? 'pass' : 'warning', !desc ? 'Falta la meta description.' : `${desc.length} caracteres (ideal 70–160).`, { evidence: desc ? cut(desc) : undefined, fix: 'Resume la propuesta de valor con una llamada a la acción.', source: 'https://developers.google.com/search/docs/appearance/snippet' });
    const h1 = inner(html, 'h1');
    c('h1', 'H1', h1.length === 1 ? 'pass' : h1.length === 0 ? 'fail' : 'warning', h1.length === 1 ? 'Un único H1.' : `${h1.length} H1 encontrados.`, { evidence: h1[0] ? cut(h1[0]) : undefined, fix: 'Usa exactamente un H1 descriptivo.' });
    const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
    const skip = levels.some((l, i) => i > 0 && l - levels[i - 1] > 1);
    c('headings', 'Jerarquía de encabezados', !levels.length ? 'fail' : skip ? 'warning' : 'pass', skip ? 'Hay saltos de nivel (p. ej. H2 → H4).' : `${levels.length} encabezados con jerarquía correcta.`, { evidence: levels.slice(0, 20).map((l) => `H${l}`).join(' '), fix: 'No saltes niveles de encabezado.' });
    const og = ['og:title', 'og:description', 'og:image'].filter((k) => !meta(head, k));
    c('open_graph', 'Open Graph', og.length === 0 ? 'pass' : og.length < 3 ? 'warning' : 'fail', og.length ? `Faltan: ${og.join(', ')}.` : 'Open Graph completo.', { fix: 'Añade og:title, og:description y og:image (1200×630).', source: 'https://ogp.me/' });
    c('twitter_card', 'Twitter / X Card', meta(head, 'twitter:card') ? 'pass' : 'warning', meta(head, 'twitter:card') ? 'twitter:card presente.' : 'Falta twitter:card.', { fix: 'Añade <meta name="twitter:card" content="summary_large_image">.' });
  }

  // 4. Contenido
  {
    const c = add('content');
    c('word_count', 'Volumen de texto', words >= 600 ? 'pass' : words >= 250 ? 'warning' : 'fail', `${words} palabras visibles.`, { fix: 'Desarrolla el contenido hasta cubrir la intención de búsqueda (orientativo ≥ 600 palabras).' });
    const ratio = html.length ? text.length / html.length : 0;
    c('text_ratio', 'Ratio texto/HTML', ratio >= 0.1 ? 'pass' : ratio >= 0.04 ? 'warning' : 'fail', `${Math.round(ratio * 1000) / 10}% del HTML es texto visible.`, { fix: 'Reduce código inline y aumenta contenido útil.' });
    const paras = inner(html, 'p').filter((x) => x.length > 40);
    c('paragraphs', 'Estructura en párrafos', paras.length >= 4 ? 'pass' : 'warning', `${paras.length} párrafos con contenido.`);
    const lists = (html.match(/<(ul|ol|table)\b/gi) ?? []).length;
    c('scannable', 'Listas y tablas', lists ? 'pass' : 'warning', lists ? `${lists} listas/tablas: contenido escaneable.` : 'Sin listas ni tablas.', { fix: 'Usa listas y tablas: ayudan a usuarios y a los extractos de IA.' });
  }

  // 5. Datos estructurados
  {
    const c = add('structured_data');
    c('jsonld_present', 'JSON-LD', jsonLd.length ? 'pass' : 'fail', jsonLd.length ? `${jsonLd.length} bloque(s) JSON-LD.` : 'No hay datos estructurados JSON-LD.', { fix: 'Añade Schema.org en JSON-LD.', source: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data' });
    if (jsonLd.length) c('jsonld_valid', 'JSON-LD válido', ldErrors ? 'fail' : 'pass', ldErrors ? `${ldErrors} bloque(s) con JSON inválido.` : 'Todos los bloques se parsean correctamente.', { fix: 'Valida en validator.schema.org.' });
    c('schema_org', 'Entidad Organization / Person', hasType('Organization', 'LocalBusiness', 'Corporation', 'Person', 'ProfessionalService') ? 'pass' : 'warning', hasType('Organization', 'LocalBusiness', 'Corporation', 'Person', 'ProfessionalService') ? 'Entidad de marca declarada.' : 'No se declara la entidad (Organization/LocalBusiness/Person).', { evidence: [...ldTypes].join(', ') || undefined, fix: 'Declara Organization con logo, sameAs y contacto.' });
    c('schema_website', 'WebSite / WebPage', hasType('WebSite', 'WebPage', 'WebApplication', 'SoftwareApplication', 'Article', 'BlogPosting', 'Product', 'Service', 'FAQPage') ? 'pass' : 'warning', hasType('WebSite', 'WebPage', 'WebApplication', 'SoftwareApplication', 'Article', 'BlogPosting', 'Product', 'Service', 'FAQPage') ? 'Tipo de página declarado.' : 'No se declara el tipo de página.');
    c('breadcrumbs', 'Breadcrumbs', hasType('BreadcrumbList') ? 'pass' : u.pathname === '/' ? 'na' : 'warning', hasType('BreadcrumbList') ? 'BreadcrumbList presente.' : u.pathname === '/' ? 'No aplica en la home.' : 'Sin BreadcrumbList.');
  }

  // 6. Rendimiento (lo básico desde el HTML; Core Web Vitals llegan aparte vía PageSpeed)
  {
    const c = add('performance');
    const kb = Math.round(new TextEncoder().encode(html).byteLength / 1024);
    c('html_size', 'Peso del HTML', kb <= 150 ? 'pass' : kb <= 400 ? 'warning' : 'fail', `${kb} KB de HTML.`, { fix: 'Reduce HTML inline y markup innecesario.' });
    c('ttfb', 'Tiempo de respuesta (TTFB)', p.ttfbMs <= 800 ? 'pass' : p.ttfbMs <= 1800 ? 'warning' : 'fail', `${p.ttfbMs} ms hasta la respuesta.`, { fix: 'Caché de página/CDN y servidor más cercano.', source: 'https://web.dev/articles/ttfb' });
    const enc = p.headers['content-encoding'] ?? '';
    c('compression', 'Compresión', /br|gzip|zstd|deflate/.test(enc) ? 'pass' : 'warning', enc ? `Comprimido con ${enc}.` : 'Respuesta sin compresión declarada.', { fix: 'Activa Brotli o gzip en el servidor.' });
    const blocking = tags(head, 'script').filter((s) => attr(s, 'src') && !/\s(async|defer)\b/i.test(s) && !/type=["']module/i.test(s)).length;
    c('render_blocking', 'Scripts bloqueantes', blocking === 0 ? 'pass' : blocking <= 2 ? 'warning' : 'fail', `${blocking} script(s) síncronos en <head>.`, { fix: 'Añade defer/async a los scripts no críticos.' });
    const imgs = tags(html, 'img');
    const lazy = imgs.filter((i) => /loading=["']?lazy/i.test(i)).length;
    c('lazy_images', 'Lazy loading de imágenes', imgs.length < 4 ? 'na' : lazy ? 'pass' : 'warning', imgs.length < 4 ? 'Pocas imágenes.' : `${lazy}/${imgs.length} imágenes con loading="lazy".`);
    c('cwv', 'Core Web Vitals (PageSpeed)', 'pending', 'Midiendo con PageSpeed Insights…');
  }

  // 7. Móvil y accesibilidad
  {
    const c = add('mobile_a11y');
    const vp = meta(head, 'viewport');
    c('viewport', 'Meta viewport', vp && /width=device-width/.test(vp) ? 'pass' : 'fail', vp ? `viewport: ${vp}` : 'Falta meta viewport.', { fix: '<meta name="viewport" content="width=device-width, initial-scale=1">' });
    const lang = attr(tags(html, 'html')[0] ?? '', 'lang');
    c('html_lang', 'Atributo lang', lang ? 'pass' : 'fail', lang ? `lang="${lang}".` : 'El <html> no declara idioma.', { fix: 'Añade lang="es" (o el idioma correspondiente).' });
    const imgs = tags(html, 'img');
    const noAlt = imgs.filter((i) => attr(i, 'alt') === null).length;
    c('img_alt', 'Texto alternativo', !imgs.length ? 'na' : noAlt === 0 ? 'pass' : noAlt / imgs.length < 0.2 ? 'warning' : 'fail', !imgs.length ? 'Sin imágenes.' : `${noAlt}/${imgs.length} imágenes sin alt.`, { fix: 'Describe cada imagen informativa en alt; alt="" para decorativas.' });
    const inputs = tags(html, 'input').filter((i) => !/type=["']?(hidden|submit|button)/i.test(i));
    const unlabeled = inputs.filter((i) => { const id = attr(i, 'id'); return !attr(i, 'aria-label') && !attr(i, 'aria-labelledby') && !(id && new RegExp(`for=["']${id}["']`).test(html)); }).length;
    c('form_labels', 'Etiquetas de formulario', !inputs.length ? 'na' : unlabeled ? 'warning' : 'pass', !inputs.length ? 'Sin campos de formulario.' : `${unlabeled}/${inputs.length} campos sin etiqueta.`);
    const fav = tags(head, 'link').some((l) => /icon/i.test(attr(l, 'rel') ?? ''));
    c('favicon', 'Favicon', fav ? 'pass' : 'warning', fav ? 'Favicon declarado.' : 'Sin favicon declarado.', { source: 'https://developers.google.com/search/docs/appearance/favicon-in-search' });
  }

  // 8. Confianza y E-E-A-T
  {
    const c = add('trust_eeat');
    const has = (re: RegExp) => re.test(linkText);
    c('contact', 'Página de contacto', has(/contact|contacto|tel:|mailto:/) ? 'pass' : 'warning', has(/contact|contacto|tel:|mailto:/) ? 'Hay vía de contacto enlazada.' : 'No se encuentra enlace de contacto.', { fix: 'Enlaza contacto visible (teléfono, email, dirección).' });
    c('legal', 'Aviso legal y privacidad', has(/privac|legal|cookies|terms|t[eé]rminos/) ? 'pass' : 'fail', has(/privac|legal|cookies|terms|t[eé]rminos/) ? 'Enlaces legales presentes.' : 'Faltan aviso legal / privacidad.', { fix: 'Obligatorio en la UE (LSSI/RGPD) y señal de confianza.' });
    c('about', 'Quiénes somos / autoría', has(/about|nosotros|quienes|qui[eé]nes|equipo|team|autor|author/) || !!meta(head, 'author') || hasType('Person') ? 'pass' : 'warning', 'Señales de autoría o empresa detrás del contenido.', { fix: 'Añade página "Sobre nosotros" y autoría con credenciales.', source: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
    const social = resolved.filter((l) => /linkedin|instagram|facebook|x\.com|twitter|youtube|tiktok/.test(l.hostname)).length;
    c('social', 'Perfiles sociales', social ? 'pass' : 'warning', social ? `${social} enlaces a perfiles sociales.` : 'Sin enlaces a perfiles sociales.', { fix: 'Enlaza perfiles y decláralos en sameAs.' });
    const hsts = !!p.headers['strict-transport-security'];
    c('hsts', 'Cabecera HSTS', hsts ? 'pass' : 'warning', hsts ? 'HSTS activo.' : 'Sin Strict-Transport-Security.');
  }

  // 9. Internacional
  {
    const c = add('international');
    const alternates = tags(head, 'link').filter((l) => (attr(l, 'rel') ?? '').toLowerCase() === 'alternate' && attr(l, 'hreflang'));
    if (!alternates.length) c('hreflang', 'hreflang', 'na', 'Sin hreflang: se asume sitio monolingüe.');
    else {
      const langs = alternates.map((l) => attr(l, 'hreflang') as string);
      c('hreflang', 'hreflang', 'pass', `${langs.length} variantes: ${langs.join(', ')}.`);
      c('hreflang_default', 'x-default', langs.includes('x-default') ? 'pass' : 'warning', langs.includes('x-default') ? 'x-default declarado.' : 'Falta hreflang="x-default".', { source: 'https://developers.google.com/search/docs/specialty/international/localized-versions' });
      const self = alternates.some((l) => { try { return new URL(attr(l, 'href') ?? '', p.finalUrl).pathname === u.pathname; } catch { return false; } });
      c('hreflang_self', 'hreflang autorreferente', self ? 'pass' : 'warning', self ? 'Incluye la propia URL.' : 'La página no se incluye a sí misma en hreflang.');
    }
  }

  // 10. AI SEO / GEO
  {
    const c = add('ai_geo');
    const bots: [string, string][] = [['GPTBot', 'OpenAI'], ['OAI-SearchBot', 'ChatGPT Search'], ['ClaudeBot', 'Anthropic'], ['PerplexityBot', 'Perplexity'], ['Google-Extended', 'Gemini']];
    for (const [bot, who] of bots) {
      const ok = robotsAllows(p.robotsTxt, bot, path);
      c(`bot_${bot.toLowerCase()}`, `${bot} (${who})`, ok ? 'pass' : 'warning', ok ? `${bot} puede acceder.` : `robots.txt bloquea ${bot}: no te citará.`, { fix: `Permite ${bot} si quieres aparecer en ${who}.` });
    }
    c('llms_txt', 'llms.txt', p.llmsTxtFound ? 'pass' : 'warning', p.llmsTxtFound ? '/llms.txt publicado.' : 'Sin /llms.txt (propuesta emergente, opcional).', { source: 'https://llmstxt.org/' });
    c('faq', 'Preguntas y respuestas', hasType('FAQPage', 'QAPage') || /<(details|summary)\b/i.test(html) || /\?\s*<\/h[2-4]>/i.test(html) ? 'pass' : 'warning', 'Bloques pregunta-respuesta facilitan que los asistentes te citen.', { fix: 'Añade una sección FAQ con respuestas directas de 40–60 palabras.' });
    const ssr = words >= 150;
    c('ssr', 'Contenido en el HTML inicial', ssr ? 'pass' : 'fail', ssr ? 'El texto está en el HTML servido.' : 'Casi no hay texto en el HTML: muchos bots de IA no ejecutan JavaScript.', { fix: 'Usa SSR/SSG para que el contenido esté en el HTML.' });
  }


  // ---------- Comprobaciones ampliadas ----------
  {
    const c = add('crawling');
    const robotsMeta = (meta(html, 'robots') ?? '').toLowerCase();
    c('nofollow_meta', 'Meta nofollow', /nofollow|none/.test(robotsMeta) ? 'warning' : 'pass', /nofollow|none/.test(robotsMeta) ? 'La página pide no seguir sus enlaces.' : 'Los enlaces se pueden seguir.', { fix: 'Quita nofollow de la meta robots salvo que sea intencionado.' });
    const canonicalTag = tags(head, 'link').find((l) => (attr(l, 'rel') ?? '').toLowerCase() === 'canonical');
    const canonical = canonicalTag ? attr(canonicalTag, 'href') : null;
    c('canonical_absolute', 'Canonical absoluto', !canonical ? 'na' : /^https?:\/\//i.test(canonical) ? 'pass' : 'warning', !canonical ? 'Sin canonical.' : /^https?:\/\//i.test(canonical) ? 'URL canónica absoluta.' : 'Canonical relativo: Google recomienda URL absoluta.', { evidence: canonical ?? undefined });
    const sitemapInRobots = !!p.robotsTxt && /^\s*sitemap\s*:/im.test(p.robotsTxt);
    c('robots_sitemap', 'Sitemap en robots.txt', p.robotsTxt === null ? 'na' : sitemapInRobots ? 'pass' : 'warning', sitemapInRobots ? 'robots.txt declara el sitemap.' : 'robots.txt no declara el sitemap.', { fix: 'Añade "Sitemap: https://tudominio/sitemap.xml" a robots.txt.' });
    const title = inner(head, 'title')[0] ?? '';
    const soft404 = /\b404\b|not found|no encontrad|página no existe/i.test(title + ' ' + (inner(html, 'h1')[0] ?? ''));
    c('soft_404', 'Soft 404', soft404 && p.status === 200 ? 'fail' : 'pass', soft404 && p.status === 200 ? 'Parece una página de error que responde 200.' : 'No hay indicios de soft 404.', { fix: 'Las páginas inexistentes deben responder 404 o 410.' });
  }
  {
    const c = add('url_arch');
    const depth = u.pathname.split('/').filter(Boolean).length;
    c('url_depth', 'Profundidad de URL', depth <= 3 ? 'pass' : depth <= 5 ? 'warning' : 'fail', `${depth} nivel(es) de carpeta.`, { fix: 'Mantén las páginas importantes a ≤ 3 niveles de la raíz.' });
    const nonAscii = /%[0-9a-f]{2}|[^\x20-\x7e]/i.test(u.pathname);
    c('url_ascii', 'Caracteres de la URL', nonAscii ? 'warning' : 'pass', nonAscii ? 'La ruta contiene caracteres codificados o acentos.' : 'Solo caracteres ASCII legibles.', { evidence: nonAscii ? u.pathname : undefined, fix: 'Usa letras sin acentos, números y guiones.' });
    const internalNofollow = tags(html, 'a').filter((a) => /nofollow/i.test(attr(a, 'rel') ?? '') && (() => { try { return new URL(attr(a, 'href') ?? '', p.finalUrl).hostname === u.hostname; } catch { return false; } })()).length;
    c('internal_nofollow', 'Enlaces internos nofollow', internalNofollow ? 'warning' : 'pass', internalNofollow ? `${internalNofollow} enlace(s) internos con nofollow.` : 'Sin nofollow en enlaces internos.', { fix: 'No uses nofollow en enlaces a tu propio sitio.' });
    const anchors = (html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []).map((a) => stripTags(a).toLowerCase());
    const generic = anchors.filter((a) => /^(click aqu[ií]|haz clic aqu[ií]|aqu[ií]|leer m[aá]s|m[aá]s info|ver m[aá]s|click here|read more|more)$/.test(a)).length;
    c('anchor_text', 'Texto de enlaces', generic ? 'warning' : 'pass', generic ? `${generic} enlace(s) con texto genérico ("leer más", "aquí"…).` : 'Textos de enlace descriptivos.', { fix: 'Usa anclas que describan el destino.' });
    const external = resolved.filter((l) => l.hostname !== u.hostname).length;
    c('external_links', 'Enlaces externos', external ? 'pass' : 'warning', `${external} enlace(s) a otros dominios.`, { fix: 'Cita fuentes externas de autoridad cuando aporten valor.' });
  }
  {
    const c = add('onpage');
    const title = (inner(head, 'title')[0] ?? '').toLowerCase();
    const h1 = (inner(html, 'h1')[0] ?? '').toLowerCase();
    c('title_h1', 'Title distinto del H1', !title || !h1 ? 'na' : title === h1 ? 'warning' : 'pass', title === h1 ? 'Title y H1 son idénticos.' : 'Title y H1 se complementan.', { fix: 'Usa el H1 para el usuario y el title para el resultado de búsqueda.' });
    const charset = /<meta[^>]+charset\s*=\s*["']?utf-8/i.test(head);
    c('charset', 'Codificación UTF-8', charset ? 'pass' : 'warning', charset ? 'Declara UTF-8.' : 'No declara <meta charset="utf-8">.');
    c('doctype', 'Doctype HTML5', /^\s*<!doctype html>/i.test(html) ? 'pass' : 'warning', /^\s*<!doctype html>/i.test(html) ? 'Doctype HTML5 correcto.' : 'Falta <!DOCTYPE html> al inicio.');
    const emptyHeadings = (html.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi) ?? []).filter((h) => !stripTags(h)).length;
    c('empty_headings', 'Encabezados vacíos', emptyHeadings ? 'warning' : 'pass', emptyHeadings ? `${emptyHeadings} encabezado(s) sin texto.` : 'Ningún encabezado vacío.');
    const h2 = inner(html, 'h2').length;
    c('h2_structure', 'Subtítulos H2', h2 >= 2 ? 'pass' : h2 === 1 ? 'warning' : 'fail', `${h2} H2 en la página.`, { fix: 'Divide el contenido en secciones con H2 descriptivos.' });
    c('og_url', 'og:url', meta(head, 'og:url') ? 'pass' : 'warning', meta(head, 'og:url') ? 'og:url presente.' : 'Falta og:url.');
  }
  {
    const c = add('content');
    const paras = inner(html, 'p').filter((x) => x.length > 40);
    const seen = new Set<string>();
    let dup = 0;
    for (const x of paras) { const k = x.toLowerCase(); if (seen.has(k)) dup++; else seen.add(k); }
    c('duplicate_paragraphs', 'Párrafos duplicados', dup ? 'warning' : 'pass', dup ? `${dup} párrafo(s) repetidos.` : 'Sin párrafos repetidos.');
    const long = paras.filter((x) => x.split(/\s+/).length > 150).length;
    c('long_paragraphs', 'Párrafos largos', long ? 'warning' : paras.length ? 'pass' : 'na', long ? `${long} párrafo(s) de más de 150 palabras.` : 'Párrafos de longitud legible.', { fix: 'Párrafos de 2-4 frases mejoran lectura y extractos.' });
    const fresh = /datePublished|dateModified/.test(html) || /<time\b[^>]*datetime=/i.test(html) || !!meta(head, 'article:modified_time') || !!meta(head, 'article:published_time');
    c('freshness', 'Fecha de publicación/actualización', fresh ? 'pass' : 'warning', fresh ? 'Indica fecha de publicación o actualización.' : 'No se indica fecha del contenido.', { fix: 'Muestra y marca (datePublished/dateModified) la fecha de actualización.' });
    const media = tags(html, 'img').length + tags(html, 'video').length + tags(html, 'iframe').length;
    c('media', 'Elementos multimedia', media ? 'pass' : 'warning', media ? `${media} imagen(es)/vídeo(s).` : 'Sin imágenes ni vídeos.', { fix: 'Apoya el texto con imágenes, gráficos o vídeo propios.' });
  }
  {
    const c = add('structured_data');
    const flat = JSON.stringify(parsedLd);
    const isOrg = hasType('Organization', 'LocalBusiness', 'Corporation', 'ProfessionalService');
    c('schema_logo', 'Logo en Schema', !isOrg ? 'na' : /"logo"/.test(flat) ? 'pass' : 'warning', !isOrg ? 'Sin entidad Organization.' : /"logo"/.test(flat) ? 'Organization incluye logo.' : 'Organization sin logo.', { source: 'https://developers.google.com/search/docs/appearance/structured-data/logo' });
    c('schema_sameas', 'sameAs (perfiles de marca)', !isOrg && !hasType('Person') ? 'na' : /"sameAs"/.test(flat) ? 'pass' : 'warning', /"sameAs"/.test(flat) ? 'Vincula perfiles oficiales con sameAs.' : 'Sin sameAs: ayuda a IA y Google a reconocer la entidad.');
    const isArticle = hasType('Article', 'BlogPosting', 'NewsArticle');
    c('schema_article', 'Datos de artículo', !isArticle ? 'na' : /"author"/.test(flat) && /"datePublished"/.test(flat) ? 'pass' : 'warning', !isArticle ? 'No es un artículo.' : 'Article con autor y fecha.', { fix: 'Incluye author, datePublished y dateModified.' });
  }
  {
    const c = add('performance');
    const nodes = (html.match(/<[a-z][a-z0-9-]*\b/gi) ?? []).length;
    c('dom_size', 'Tamaño del DOM', nodes <= 1500 ? 'pass' : nodes <= 3000 ? 'warning' : 'fail', `≈ ${nodes} elementos HTML.`, { fix: 'Reduce wrappers y elementos ocultos.', source: 'https://developer.chrome.com/docs/lighthouse/performance/dom-size' });
    const imgs = tags(html, 'img');
    const noDims = imgs.filter((i) => !attr(i, 'width') || !attr(i, 'height')).length;
    c('img_dimensions', 'Dimensiones de imágenes', !imgs.length ? 'na' : noDims === 0 ? 'pass' : noDims / imgs.length < 0.3 ? 'warning' : 'fail', !imgs.length ? 'Sin imágenes.' : `${noDims}/${imgs.length} imágenes sin width/height (riesgo de CLS).`, { fix: 'Declara width y height en cada <img>.' });
    const srcs = imgs.map((i) => (attr(i, 'src') ?? '') + ' ' + (attr(i, 'srcset') ?? '')).join(' ') + ' ' + tags(html, 'source').map((s) => attr(s, 'type') ?? '').join(' ');
    c('modern_images', 'Formatos modernos', !imgs.length ? 'na' : /\.(webp|avif)|image\/(webp|avif)|_next\/image|format=(webp|avif)/i.test(srcs) ? 'pass' : 'warning', /\.(webp|avif)|image\/(webp|avif)|_next\/image|format=(webp|avif)/i.test(srcs) ? 'Usa WebP/AVIF.' : 'No se detectan imágenes WebP/AVIF.', { fix: 'Sirve imágenes en WebP o AVIF.' });
    const thirdParty = new Set(tags(html, 'script').map((s) => attr(s, 'src')).filter((s): s is string => !!s).map((s) => { try { return new URL(s, p.finalUrl).hostname; } catch { return ''; } }).filter((h) => h && h !== u.hostname)).size;
    c('third_party', 'Scripts de terceros', thirdParty <= 4 ? 'pass' : thirdParty <= 8 ? 'warning' : 'fail', `${thirdParty} dominio(s) externos cargando scripts.`, { fix: 'Elimina etiquetas de terceros que no aporten.' });
    const cc = p.headers['cache-control'] ?? '';
    c('cache_control', 'Cabecera de caché', cc ? 'pass' : 'warning', cc ? `Cache-Control: ${cut(cc, 60)}` : 'Sin Cache-Control.');
  }
  {
    const c = add('mobile_a11y');
    const vp = (meta(head, 'viewport') ?? '').toLowerCase();
    const noZoom = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(vp);
    c('zoom', 'Zoom permitido', !vp ? 'na' : noZoom ? 'fail' : 'pass', noZoom ? 'El viewport bloquea el zoom.' : 'El usuario puede hacer zoom.', { fix: 'Quita user-scalable=no y maximum-scale=1.' });
    const buttons = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? []).filter((b) => !stripTags(b) && !/aria-label|title=/i.test(b)).length;
    c('button_names', 'Botones con nombre accesible', buttons ? 'warning' : 'pass', buttons ? `${buttons} botón(es) sin texto ni aria-label.` : 'Todos los botones tienen nombre.');
    const emptyLinks = (html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []).filter((a) => !stripTags(a) && !/aria-label|title=|<img[^>]+alt=["'][^"']+/i.test(a)).length;
    c('link_names', 'Enlaces con nombre accesible', emptyLinks ? 'warning' : 'pass', emptyLinks ? `${emptyLinks} enlace(s) sin texto accesible.` : 'Todos los enlaces tienen texto.');
    c('landmarks', 'Estructura semántica', /<main\b/i.test(html) ? 'pass' : 'warning', /<main\b/i.test(html) ? 'Usa <main> y regiones semánticas.' : 'Sin elemento <main>.', { fix: 'Usa header, nav, main y footer.' });
  }
  {
    const c = add('trust_eeat');
    const mixed = u.protocol === 'https:' ? (html.match(/<(img|script|link|iframe|source)\b[^>]+(src|href)=["']http:\/\//gi) ?? []).length : 0;
    c('mixed_content', 'Contenido mixto', u.protocol !== 'https:' ? 'na' : mixed ? 'fail' : 'pass', mixed ? `${mixed} recurso(s) cargados por http://.` : 'Todos los recursos por HTTPS.', { fix: 'Carga todos los recursos por HTTPS.' });
    const sec = ['content-security-policy', 'x-content-type-options', 'referrer-policy'].filter((h) => p.headers[h]).length;
    c('security_headers', 'Cabeceras de seguridad', sec >= 2 ? 'pass' : sec ? 'warning' : 'fail', `${sec}/3 cabeceras (CSP, X-Content-Type-Options, Referrer-Policy).`);
    const nap = /tel:|"telephone"|"address"|<address\b/i.test(html);
    c('nap', 'Datos de contacto (NAP)', nap ? 'pass' : 'warning', nap ? 'Muestra teléfono o dirección.' : 'No se detecta teléfono ni dirección.', { fix: 'Muestra nombre, dirección y teléfono, y márcalos en Schema.' });
  }
  {
    const c = add('ai_geo');
    for (const [bot, who] of [['Bingbot', 'Copilot / Bing'], ['Applebot-Extended', 'Apple Intelligence']] as [string, string][]) {
      const ok = robotsAllows(p.robotsTxt, bot, path);
      c(`bot_${bot.toLowerCase()}`, `${bot} (${who})`, ok ? 'pass' : 'warning', ok ? `${bot} puede acceder.` : `robots.txt bloquea ${bot}.`);
    }
    const first = inner(html, 'p').find((x) => x.length > 40) ?? '';
    c('lead_answer', 'Respuesta directa al inicio', !first ? 'fail' : first.length <= 320 ? 'pass' : 'warning', !first ? 'No hay párrafo introductorio.' : `Primer párrafo de ${first.length} caracteres.`, { evidence: first ? cut(first, 120) : undefined, fix: 'Abre con 1-2 frases que respondan qué es y para quién.' });
    const stats = (text.match(/\d+([.,]\d+)?\s?(%|€|\$|euros|clientes|años|horas)/gi) ?? []).length;
    c('citable_data', 'Datos citables', stats >= 3 ? 'pass' : stats ? 'warning' : 'fail', `${stats} cifra(s) concretas en el texto.`, { fix: 'Incluye datos, cifras y resultados verificables: los asistentes de IA citan hechos.' });
    c('entity_clarity', 'Entidad de marca clara', hasType('Organization', 'LocalBusiness', 'Person', 'Corporation') && /"name"/.test(JSON.stringify(parsedLd)) ? 'pass' : 'warning', 'La IA identifica mejor marcas declaradas con nombre, logo y perfiles.', { fix: 'Declara Organization con name, url, logo y sameAs.' });
  }


  // ---------- Desgloses, contexto y comprobaciones avanzadas ----------
  const upsert = (cat: CategoryId, check: AuditCheck) => {
    const i = out[cat].findIndex((k) => k.id === check.id);
    if (i >= 0) out[cat][i] = check; else out[cat].push(check);
  };
  const drop = (cat: CategoryId, ...ids: string[]) => { out[cat] = out[cat].filter((k) => !ids.includes(k.id)); };
  const ldFlat = JSON.stringify(parsedLd);
  const isArticle = hasType('Article', 'BlogPosting', 'NewsArticle') || (meta(head, 'og:type') ?? '').toLowerCase() === 'article' || !!meta(head, 'article:published_time');
  const lower = html.toLowerCase();

  // On-page: Open Graph y Twitter con desglose
  {
    const og: CheckItem[] = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map((k) => ({ label: k, ok: !!meta(head, k), value: meta(head, k) ?? undefined }));
    const okOg = og.filter((x) => x.ok).length;
    drop('onpage', 'og_url');
    upsert('onpage', { id: 'open_graph', label: 'Open Graph', status: okOg === 5 ? 'pass' : okOg >= 3 ? 'warning' : 'fail', message: `${okOg} de 5 atributos presentes.`, items: og, fix: 'Completa og:title, og:description, og:image (1200×630), og:url y og:type.', source: 'https://ogp.me/' });
    const tw: CheckItem[] = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].map((k) => ({ label: k, ok: !!meta(head, k), value: meta(head, k) ?? undefined }));
    const okTw = tw.filter((x) => x.ok).length;
    upsert('onpage', { id: 'twitter_card', label: 'Twitter / X Cards', status: okTw === 4 ? 'pass' : tw[0].ok || okOg >= 3 ? 'warning' : 'fail', message: `${okTw} de 4 atributos presentes${okTw < 4 && okOg >= 3 ? ' (X usa Open Graph como respaldo)' : ''}.`, items: tw, fix: 'Añade twitter:card, twitter:title, twitter:description y twitter:image.', source: 'https://developer.x.com/en/docs/x-for-websites/cards/overview/markup' });
    const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
    const h = out.onpage.find((k) => k.id === 'headings');
    if (h && levels.length) h.evidence = `Secuencia: ${levels.slice(0, 30).map((l) => `H${l}`).join(' → ')}${levels.length > 30 ? ' …' : ''}`;
    const subs = [...inner(html, 'h2'), ...inner(html, 'h3')];
    const vague = subs.filter((x) => x.split(/\s+/).length < 2 || /^(inicio|home|m[aá]s|secci[oó]n|t[ií]tulo|bienvenid[oa]s?|servicios|contacto)$/i.test(x)).length;
    upsert('onpage', { id: 'headings_descriptive', label: 'Encabezados descriptivos', status: !subs.length ? 'na' : vague / subs.length <= 0.3 ? 'pass' : 'warning', message: !subs.length ? 'Sin H2/H3.' : `${vague} de ${subs.length} subtítulos son de una palabra o genéricos.`, fix: 'Usa subtítulos que describan el contenido de la sección.', source: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide' });
  }

  // Rastreo
  {
    const refresh = /<meta[^>]+http-equiv=["']?refresh/i.test(head);
    upsert('crawling', { id: 'meta_refresh', label: 'Sin meta refresh', status: refresh ? 'warning' : 'pass', message: refresh ? 'Usa <meta http-equiv="refresh"> (redirección obsoleta).' : 'No usa meta refresh.', fix: 'Sustituye la meta refresh por una redirección 301.', source: 'https://developer.mozilla.org/es/docs/Web/HTML/Element/meta#http-equiv' });
    const xml = p.sitemapXml ?? null;
    const norm = (s: string) => s.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const inSitemap = !!xml && [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].some((m) => norm(m[1]) === norm(p.finalUrl));
    upsert('crawling', { id: 'sitemap_includes', label: 'URL incluida en el sitemap', status: !xml ? 'na' : /<sitemapindex/i.test(xml) ? 'na' : inSitemap ? 'pass' : 'warning', message: !xml ? 'No se pudo leer el sitemap.' : /<sitemapindex/i.test(xml) ? 'Índice de sitemaps: no se revisan los sitemaps hijos.' : inSitemap ? 'La URL aparece en el sitemap.' : 'La URL no aparece en el sitemap.', fix: 'Incluye todas las URLs indexables en el sitemap.', source: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap' });
    const assets = [...tags(html, 'script').map((s) => attr(s, 'src')), ...tags(html, 'link').filter((l) => /stylesheet/i.test(attr(l, 'rel') ?? '')).map((l) => attr(l, 'href'))]
      .filter((x): x is string => !!x).map((x) => { try { return new URL(x, p.finalUrl); } catch { return null; } }).filter((x): x is URL => !!x && x.hostname === u.hostname);
    const blocked = assets.filter((a) => !robotsAllows(p.robotsTxt, 'Googlebot', a.pathname));
    upsert('crawling', { id: 'robots_assets', label: 'robots.txt no bloquea CSS/JS', status: !assets.length ? 'na' : blocked.length ? 'fail' : 'pass', message: !assets.length ? 'Sin CSS/JS propios enlazados.' : blocked.length ? `${blocked.length} de ${assets.length} recursos CSS/JS bloqueados para Googlebot.` : `Los ${assets.length} recursos CSS/JS son accesibles para Googlebot.`, evidence: blocked[0]?.pathname, fix: 'Permite el rastreo de CSS y JS: Google los necesita para renderizar.', source: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics' });
  }

  // URL
  {
    const datesIds = /\/(19|20)\d{2}\/\d{1,2}\//.test(u.pathname) || /\d{6,}/.test(u.pathname);
    upsert('url_arch', { id: 'url_dates_ids', label: 'Sin fechas ni IDs en la URL', status: datesIds ? 'warning' : 'pass', message: datesIds ? 'La ruta incluye fechas o IDs numéricos largos.' : 'Sin fechas ni IDs numéricos largos.', evidence: datesIds ? u.pathname : undefined, fix: 'URLs descriptivas y estables, sin fechas ni IDs.', source: 'https://developers.google.com/search/docs/crawling-indexing/url-structure' });
  }

  // Contenido
  {
    const tabs = (html.match(/<details\b/gi) ?? []).length + (html.match(/role=["']tab(panel)?["']/gi) ?? []).length + (html.match(/class=["'][^"']*\b(accordion|tab-pane|tabs?__panel)\b/gi) ?? []).length;
    upsert('content', { id: 'tabs_accordions', label: 'Contenido en pestañas/acordeones', status: tabs >= 4 ? 'warning' : 'pass', message: tabs ? `${tabs} elemento(s) tipo acordeón/pestaña/details.${tabs >= 4 ? ' Evita que contenido esencial esté solo ahí.' : ''}` : 'El contenido principal está visible.', fix: 'Muestra lo esencial fuera de pestañas y acordeones.', source: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
    const imgs = tags(html, 'img').map((i) => attr(i, 'src') ?? '').filter(Boolean);
    const generic = imgs.filter((s) => /(^|\/)(img|dsc|dcim|image|screenshot|captura|foto|photo|untitled|wp-image)[-_ ]?\d*\.(jpe?g|png|webp|gif|avif)/i.test(s.split('?')[0])).length;
    upsert('content', { id: 'image_filenames', label: 'Nombres de archivo de imagen', status: !imgs.length ? 'na' : generic ? 'warning' : 'pass', message: !imgs.length ? 'Sin imágenes.' : `${generic} de ${imgs.length} imágenes con nombre genérico (IMG_1234.jpg…).`, fix: 'Nombra las imágenes con palabras que describan su contenido.', source: 'https://developers.google.com/search/docs/appearance/google-images' });
    upsert('content', { id: 'text_vs_images', label: 'Texto no depende de imágenes', status: imgs.length >= 5 && words / imgs.length < 30 ? 'warning' : 'pass', message: imgs.length >= 5 && words / imgs.length < 30 ? `Poco texto (${words} palabras) para ${imgs.length} imágenes.` : 'Hay texto suficiente respecto a las imágenes.', source: 'https://developers.google.com/search/docs/appearance/google-images' });
    // Legibilidad (Fernández Huerta, adaptación de Flesch al español): 206,84 − 0,60·P − 1,02·F
    const sentences = Math.max(1, (text.match(/[.!?¡¿]+(\s|$)/g) ?? []).length);
    const wordList = text.split(/\s+/).filter((w) => /\p{L}/u.test(w));
    const syllables = wordList.reduce((s, w) => s + Math.max(1, (w.toLowerCase().match(/[aeiouáéíóúü]+/g) ?? []).length), 0);
    const n = wordList.length;
    const fh = n >= 100 ? Math.round((206.84 - 0.6 * (syllables / n) * 100 - 1.02 * (sentences / n) * 100) * 10) / 10 : null;
    upsert('content', { id: 'readability', label: 'Legibilidad del texto', status: fh === null ? 'na' : fh >= 60 ? 'pass' : fh >= 40 ? 'warning' : 'fail', message: fh === null ? 'Texto insuficiente para estimarla.' : `Índice Fernández Huerta estimado: ${fh}/100 (${fh >= 70 ? 'fácil' : fh >= 60 ? 'normal' : fh >= 40 ? 'algo difícil' : 'difícil'}).`, evidence: fh === null ? undefined : `palabras/frase: ${(n / sentences).toFixed(1)} · sílabas/100 palabras: ${((syllables / n) * 100).toFixed(1)}`, fix: 'Frases más cortas y palabras más sencillas.', source: 'https://es.wikipedia.org/wiki/Legibilidad' });
    const author = !!meta(head, 'author') || /"author"/.test(ldFlat) || /rel=["']author["']/i.test(html);
    upsert('content', { id: 'author', label: 'Autor identificado', status: !isArticle ? 'na' : author ? 'pass' : 'warning', message: !isArticle ? 'No es un artículo: la autoría individual no suele aplicar.' : author ? 'Autor identificado.' : 'Artículo sin autor identificado.', fix: 'Muestra el autor con enlace a su perfil y márcalo en Schema.', source: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
    const f = out.content.find((k) => k.id === 'freshness');
    if (f && !isArticle && f.status !== 'pass') { f.status = 'na'; f.message = 'No es un artículo: la fecha de publicación no suele ser necesaria.'; }
  }

  // Datos estructurados
  {
    const contentTypes = [...ldTypes].filter((x) => !['WebSite', 'WebPage', 'Organization', 'Person', 'BreadcrumbList', 'ImageObject', 'ListItem', 'SearchAction', 'EntryPoint', 'PostalAddress', 'ContactPoint', 'Thing', 'Question', 'Answer', 'Offer', 'Place'].includes(x));
    upsert('structured_data', { id: 'schema_types', label: 'Tipos de contenido marcados', status: contentTypes.length ? 'pass' : jsonLd.length ? 'warning' : 'fail', message: contentTypes.length ? `${contentTypes.length} tipo(s) de contenido detectado(s).` : 'Solo hay marcado de identidad, no del contenido de la página.', items: contentTypes.slice(0, 8).map((x) => ({ label: x, ok: true })), fix: 'Marca el tipo de contenido: Service, Product, Article, FAQPage, LocalBusiness…', source: 'https://schema.org/docs/full.html' });
    upsert('structured_data', { id: 'about_mentions', label: 'Entidades (about/mentions)', status: !jsonLd.length ? 'na' : /"(about|mentions)"/.test(ldFlat) ? 'pass' : 'warning', message: /"(about|mentions)"/.test(ldFlat) ? 'Usa about/mentions para aclarar de qué trata la página.' : 'No usa about/mentions: refuerzan el tema ante buscadores y motores de IA.', source: 'https://schema.org/about' });
    const hasVideo = /<video\b/i.test(html) || /<iframe[^>]+(youtube|vimeo|dailymotion)/i.test(html);
    upsert('structured_data', { id: 'video_schema', label: 'Vídeo marcado (VideoObject)', status: !hasVideo ? 'na' : hasType('VideoObject') ? 'pass' : 'warning', message: !hasVideo ? 'Sin vídeo embebido.' : hasType('VideoObject') ? 'Vídeo con VideoObject.' : 'Hay vídeo sin VideoObject.', source: 'https://developers.google.com/search/docs/appearance/structured-data/video' });
    const reviewsVisible = /rese[ñn]as?|testimonios?|opiniones|valoraci[oó]n|reviews?|★/i.test(text);
    upsert('structured_data', { id: 'reviews_schema', label: 'Reseñas marcadas', status: hasType('Review', 'AggregateRating') ? 'pass' : reviewsVisible ? 'warning' : 'na', message: hasType('Review', 'AggregateRating') ? 'Reseñas marcadas con Review/AggregateRating.' : reviewsVisible ? 'Se mencionan reseñas o testimonios sin marcado.' : 'Sin reseñas en la página.', source: 'https://developers.google.com/search/docs/appearance/structured-data/review-snippet' });
    const a = out.structured_data.find((k) => k.id === 'schema_article');
    if (a && !isArticle) { a.status = 'na'; a.message = 'No es un artículo.'; }
  }

  // Rendimiento
  {
    const imgs = tags(html, 'img');
    const offscreen = imgs.slice(3);
    const noLazy = offscreen.filter((i) => !/loading=["']?lazy/i.test(i) && !/data-src|lazyload/i.test(i));
    upsert('performance', { id: 'lazy_images', label: 'Carga diferida fuera del viewport', status: !offscreen.length ? 'na' : noLazy.length ? 'warning' : 'pass', message: !offscreen.length ? 'Pocas imágenes: no aplica.' : noLazy.length ? `${noLazy.length} de ${offscreen.length} imágenes (a partir de la 4.ª) sin loading="lazy".` : 'Las imágenes inferiores usan carga diferida.', items: noLazy.slice(0, 4).map((i) => ({ label: (attr(i, 'src') ?? '').split('/').pop()?.split('?')[0] ?? 'imagen', ok: false })), fix: 'Añade loading="lazy" a las imágenes que no se ven al cargar.', source: 'https://web.dev/articles/browser-level-image-lazy-loading' });
    const origins = new Set([...tags(html, 'script').map((s) => attr(s, 'src')), ...tags(html, 'link').filter((l) => /stylesheet/i.test(attr(l, 'rel') ?? '')).map((l) => attr(l, 'href')), ...tags(html, 'iframe').map((s) => attr(s, 'src'))]
      .filter((x): x is string => !!x).map((x) => { try { return new URL(x, p.finalUrl).origin; } catch { return ''; } }).filter((o) => o && !o.includes(u.hostname)));
    const hints = tags(head, 'link').filter((l) => /preconnect|dns-prefetch/i.test(attr(l, 'rel') ?? '')).length;
    upsert('performance', { id: 'preconnect', label: 'Preconnect a terceros', status: !origins.size ? 'na' : hints ? 'pass' : 'warning', message: !origins.size ? 'No carga recursos de terceros.' : hints ? `${hints} preconnect/dns-prefetch para ${origins.size} origen(es) externos.` : `${origins.size} origen(es) externos sin preconnect.`, source: 'https://web.dev/articles/uses-rel-preconnect' });
    const iframes = tags(html, 'iframe');
    upsert('performance', { id: 'lazy_iframes', label: 'Carga diferida de vídeos/iframes', status: !iframes.length ? 'na' : iframes.every((i) => /loading=["']?lazy/i.test(i)) ? 'pass' : 'warning', message: !iframes.length ? 'Sin iframes.' : `${iframes.filter((i) => /loading=["']?lazy/i.test(i)).length} de ${iframes.length} iframes con loading="lazy".`, source: 'https://web.dev/articles/iframe-lazy-loading' });
  }

  // Móvil y accesibilidad
  {
    const skip = /<a\b[^>]+href=["']#[^"']+["'][^>]*>\s*(saltar|ir al contenido|skip)/i.test(html.slice(0, 20000));
    upsert('mobile_a11y', { id: 'skip_link', label: 'Enlace "saltar al contenido"', status: skip ? 'pass' : 'warning', message: skip ? 'Tiene enlace para saltar la navegación.' : 'Sin enlace "saltar al contenido" al inicio.', fix: 'Añade un enlace oculto visible al foco que lleve a <main>.', source: 'https://www.w3.org/WAI/WCAG21/Techniques/general/G1' });
    const tabPos = (html.match(/tabindex=["']?[1-9]/gi) ?? []).length;
    upsert('mobile_a11y', { id: 'tabindex', label: 'Sin tabindex positivo', status: tabPos ? 'warning' : 'pass', message: tabPos ? `${tabPos} elemento(s) con tabindex positivo.` : 'El orden de tabulación es el natural.', source: 'https://web.dev/articles/control-focus-with-tabindex' });
    const ifr = tags(html, 'iframe');
    upsert('mobile_a11y', { id: 'iframe_title', label: 'Iframes con título', status: !ifr.length ? 'na' : ifr.every((i) => attr(i, 'title')) ? 'pass' : 'warning', message: !ifr.length ? 'Sin iframes.' : `${ifr.filter((i) => attr(i, 'title')).length} de ${ifr.length} iframes con title.`, source: 'https://www.w3.org/WAI/WCAG21/Techniques/html/H64' });
    const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
    const dataTables = tables.filter((tb) => (tb.match(/<tr\b/gi) ?? []).length >= 2);
    upsert('mobile_a11y', { id: 'table_headers', label: 'Tablas con cabeceras', status: !dataTables.length ? 'na' : dataTables.every((tb) => /<th\b/i.test(tb)) ? 'pass' : 'warning', message: !dataTables.length ? 'Sin tablas de datos.' : `${dataTables.filter((tb) => /<th\b/i.test(tb)).length} de ${dataTables.length} tablas con <th>.`, source: 'https://webaim.org/techniques/tables/data' });
    const sem: CheckItem[] = ['main', 'nav', 'header', 'footer', 'article'].map((t) => ({ label: t, ok: new RegExp(`<${t}\\b`, 'i').test(html) }));
    const okSem = sem.slice(0, 4).filter((x) => x.ok).length;
    upsert('mobile_a11y', { id: 'landmarks', label: 'Etiquetas HTML semánticas', status: okSem === 4 ? 'pass' : okSem >= 2 ? 'warning' : 'fail', message: `${sem.filter((x) => x.ok).length} de 5 etiquetas semánticas presentes.`, items: sem, fix: 'Usa header, nav, main, article y footer.', source: 'https://developer.mozilla.org/es/docs/Glossary/Semantics' });
  }

  // Confianza: desgloses y SSL
  {
    const anchors = (html.match(/<a\b[\s\S]*?<\/a>/gi) ?? []).map((a) => ({ href: (attr(a, 'href') ?? '').toLowerCase(), text: stripTags(a).toLowerCase() }));
    const findLink = (hrefRe: RegExp, textRe: RegExp) => anchors.find((a) => hrefRe.test(a.href) || textRe.test(a.text));
    const linkDefs: [string, RegExp, RegExp][] = [
      ['Contacto', /contact|^mailto:|^tel:/, /^(contacto|contacta|cont[aá]ctanos|contact( us)?)$/],
      ['Sobre nosotros', /about|nosotros|quienes-somos|qui%c3%a9nes|sobre-|equipo|team/, /^(sobre nosotros|qui[eé]nes somos|nuestro equipo|equipo|about( us)?|la empresa)$/],
      ['Aviso legal', /aviso-legal|legal|terminos|t%c3%a9rminos|terms|condiciones/, /aviso legal|t[eé]rminos|condiciones de uso|terms/],
      ['Privacidad', /privac/, /privacidad|privacy/],
    ];
    const links: CheckItem[] = linkDefs.map(([label, hrefRe, textRe]) => {
      const hit = findLink(hrefRe, textRe);
      return { label, ok: !!hit, value: hit ? (hit.href.startsWith('#') ? `Sección en la página (${hit.href})` : 'Enlazado') : 'No encontrado' };
    });
    const okLinks = links.filter((x) => x.ok).length;
    drop('trust_eeat', 'contact', 'legal', 'about', 'hsts');
    upsert('trust_eeat', { id: 'trust_links', label: 'Contacto, sobre nosotros, aviso legal y privacidad', status: okLinks === 4 ? 'pass' : links[2].ok && links[3].ok ? 'warning' : 'fail', message: okLinks === 4 ? 'Los cuatro enlaces de confianza están presentes.' : `Sin encontrar: ${links.filter((x) => !x.ok).map((x) => x.label).join(', ')}. Comprobado solo en esta página: pueden estar enlazados desde otra sección.`, items: links, fix: 'Enlaza contacto y "sobre nosotros"; aviso legal y privacidad son obligatorios en la UE.', source: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
    const csp = p.headers['content-security-policy'];
    const sec: CheckItem[] = [
      { label: 'Strict-Transport-Security', ok: !!p.headers['strict-transport-security'], value: p.headers['strict-transport-security'] },
      { label: 'X-Content-Type-Options', ok: !!p.headers['x-content-type-options'], value: p.headers['x-content-type-options'] },
      { label: 'X-Frame-Options', ok: !!p.headers['x-frame-options'] || /frame-ancestors/i.test(csp ?? ''), value: p.headers['x-frame-options'] ?? (/frame-ancestors/i.test(csp ?? '') ? 'vía CSP frame-ancestors' : undefined) },
      { label: 'Content-Security-Policy', ok: !!csp, value: csp ? cut(csp, 60) : undefined },
    ];
    const okSec = sec.filter((x) => x.ok).length;
    upsert('trust_eeat', { id: 'security_headers', label: 'Cabeceras de seguridad HTTP', status: okSec >= 3 ? 'pass' : okSec === 2 ? 'warning' : 'fail', message: `${okSec} de 4 cabeceras de seguridad presentes.${okSec < 4 ? ` Faltan: ${sec.filter((x) => !x.ok).map((x) => x.label).join(', ')}.` : ''}`, items: sec, fix: 'Configura HSTS, X-Content-Type-Options, X-Frame-Options y CSP en el servidor.', source: 'https://web.dev/articles/security-headers' });
    const phone = /tel:|"telephone"|(\+34|0034)?\s?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/.test(html);
    const address = /<address\b|"streetAddress"|"address"|\b(calle|c\/|avda\.?|avenida|plaza|paseo)\s+[A-ZÁÉÍÓÚ]/i.test(html);
    const nif = /\b([A-HJ-NP-SUVW]-?\d{7}-?[0-9A-J]|\d{8}-?[A-Z]|ES[A-Z0-9]\d{7}[A-Z0-9])\b/.test(text);
    const nap: CheckItem[] = [{ label: 'Teléfono', ok: phone, value: phone ? 'Detectado' : 'No detectado' }, { label: 'Dirección', ok: address, value: address ? 'Detectada' : 'No detectada' }, { label: 'NIF / CIF / VAT', ok: nif, value: nif ? 'Detectado' : 'No detectado' }];
    const okNap = nap.filter((x) => x.ok).length;
    upsert('trust_eeat', { id: 'nap', label: 'Datos de empresa verificables', status: okNap >= 2 ? 'pass' : okNap === 1 ? 'warning' : 'warning', message: `${okNap} de 3 datos de empresa detectados en el texto o en Schema (detección aproximada).`, items: nap, fix: 'Muestra teléfono, dirección y NIF/CIF (obligatorio por la LSSI en España).', source: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
    const ssl = p.ssl;
    upsert('trust_eeat', { id: 'ssl_expiry', label: 'Caducidad del certificado SSL', status: u.protocol !== 'https:' || !ssl ? 'na' : ssl.daysLeft > 30 ? 'pass' : ssl.daysLeft > 7 ? 'warning' : 'fail', message: u.protocol !== 'https:' ? 'La página no usa HTTPS.' : !ssl ? 'No se pudo leer el certificado.' : `Válido ${ssl.daysLeft} día(s) más (emisor: ${ssl.issuer || 'desconocido'}).`, fix: 'Renueva el certificado o activa la renovación automática.', source: 'https://developers.google.com/search/docs/crawling-indexing/https' });
  }

  // Internacional
  {
    const ogLocale = meta(head, 'og:locale');
    const lang = (attr(tags(html, 'html')[0] ?? '', 'lang') ?? '').toLowerCase();
    upsert('international', { id: 'og_locale', label: 'og:locale coherente con lang', status: !ogLocale || !lang ? 'na' : ogLocale.toLowerCase().slice(0, 2) === lang.slice(0, 2) ? 'pass' : 'warning', message: !ogLocale ? 'No declara og:locale.' : !lang ? 'Sin atributo lang.' : `og:locale="${ogLocale}" · lang="${lang}".` });
  }

  // AI SEO: bloqueo por firewall/WAF
  {
    const br = p.botResponses ?? [];
    const blockedBots = br.filter((b) => b.status !== null && [401, 403, 406, 429, 503].includes(b.status) && p.status < 400);
    upsert('ai_geo', { id: 'ai_waf', label: 'Sin bloqueo de bots de IA por firewall', status: !br.length ? 'na' : blockedBots.length ? 'warning' : 'pass', message: !br.length ? 'No se pudo comprobar.' : blockedBots.length ? `El servidor rechaza a ${blockedBots.map((b) => b.bot).join(', ')} aunque robots.txt lo permita.` : 'El servidor responde igual a los bots de IA probados.', items: br.map((b) => ({ label: b.bot, ok: b.status !== null && b.status < 400, value: b.status === null ? 'sin respuesta' : `HTTP ${b.status}` })), fix: 'Revisa reglas de Cloudflare/WAF que bloqueen GPTBot, ClaudeBot o PerplexityBot.' });
  }
  void lower;

  return (Object.keys(out) as CategoryId[]).map((id) => ({ id, name: CATEGORY_NAMES[id], score: null, checks: out[id] }));
}
