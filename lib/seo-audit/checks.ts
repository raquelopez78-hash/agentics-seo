// Comprobaciones deterministas de SEO clásico y AI SEO a partir de la página ya descargada. Módulo puro.
import type { AuditCategory, AuditCheck, CategoryId, CheckStatus } from './scoring.ts';
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
    c('title', 'Title', !title ? 'fail' : title.length >= 30 && title.length <= 65 ? 'pass' : 'warning', !title ? 'Falta la etiqueta <title>.' : `${title.length} caracteres (ideal 30–65).`, { evidence: title ? cut(title) : undefined, fix: 'Título único con la keyword principal al inicio.', source: 'https://developers.google.com/search/docs/appearance/title-link' });
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

  return (Object.keys(out) as CategoryId[]).map((id) => ({ id, name: CATEGORY_NAMES[id], score: null, checks: out[id] }));
}
