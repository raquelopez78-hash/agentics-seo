'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_NAMES, finalizeReport, reportToMarkdown, type AuditCheck, type AuditReport, type CheckStatus } from '@/lib/seo-audit/scoring';
import { LEAD_PRIVACY_NOTICE } from '@/lib/seo-audit/lead';
import s from './audit.module.css';
import ReportPrint, { type Brand } from './report-print';
import { AGENCY_CONTACT_URL, AGENCY_URL, LEGAL_LINKS, REVIEW_URL, SECURITY_URL } from '@/lib/site';

const LEAD_KEY = 'agentics-seo-lead';
type LeadData = { name: string; email: string; company: string; privacy: boolean; marketing: boolean };
const HISTORY_KEY = 'agentics-seo-history';
type HistoryEntry = { score: number; date: string };
function compareWithHistory(r: AuditReport): { previous: HistoryEntry | null } {
  try {
    const key = r.finalUrl.replace(/[#?].*$/, '');
    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}') as Record<string, HistoryEntry>;
    const previous = all[key] ?? null;
    all[key] = { score: r.score, date: r.generatedAt };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    return { previous };
  } catch {
    return { previous: null };
  }
}
const readSavedLead = (): LeadData | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(LEAD_KEY) ?? 'null') as LeadData | null;
    return v && v.email && v.name && v.privacy ? v : null;
  } catch { return null; }
};

const STEPS = ['Descargando la página', 'Leyendo robots.txt, sitemap y llms.txt', 'Analizando on-page y datos estructurados', 'Evaluando contenido y E-E-A-T', 'Calculando puntuación'];
const STATUS_LABEL: Record<CheckStatus, string> = { pass: 'Correcto', warning: 'Mejorable', fail: 'Error', na: 'No aplica', no_api: 'Requiere IA', pending: 'Midiendo…' };
const RING = 2 * Math.PI * 84;

const color = (score: number | null) => (score === null ? '#6b7194' : score >= 90 ? '#2fd28b' : score >= 75 ? '#7bd84a' : score >= 55 ? '#f5b740' : score >= 35 ? '#ff8a3d' : '#ff4d6d');

function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AuditClient() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [unlocked, setUnlocked] = useState(false);
  const [previous, setPrevious] = useState<HistoryEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ total: number; today: number } | null>(null);

  useEffect(() => {
    fetch('/api/audit/count').then((r) => r.json()).then((d: { total: number | null; today: number | null }) => {
      if (typeof d.total === 'number' && d.total > 0) setCounts({ total: d.total, today: d.today ?? 0 });
    }).catch(() => {});
  }, [report]);
  const [lead, setLead] = useState({ name: '', email: '', company: '', privacy: false, marketing: false });
  const [leadState, setLeadState] = useState<{ sending: boolean; error: string }>({ sending: false, error: '' });
  const [proWall, setProWall] = useState<{ limit: number } | null>(null);
  const [pro, setPro] = useState<{ email: string; brand: Brand } | null>(null);

  useEffect(() => {
    fetch('/api/pro/me').then((r) => (r.ok ? r.json() : null)).then((d: { pro?: boolean; email: string; brand: Brand } | null) => {
      if (d?.pro) setPro({ email: d.email, brand: d.brand });
    }).catch(() => {});
  }, []);

  // Envía el lead y recibe el informe completo (el servidor no lo entrega antes).
  async function unlockWith(data: LeadData, rep: AuditReport) {
    setLeadState({ sending: true, error: '' });
    try {
      const res = await fetch('/api/audit/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, reportId: rep.id, report: rep.locked ? undefined : rep }) });
      const out = await res.json().catch(() => ({}));
      if (res.status === 402 && out.code === 'FREE_LIMIT') {
        setProWall({ limit: Number(out.limit) || 2 });
        setLeadState({ sending: false, error: '' });
        return;
      }
      if (!res.ok) throw new Error(out.error ?? 'No se pudo enviar.');
      try { sessionStorage.setItem(LEAD_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
      if (out.report && typeof out.report === 'object') {
        const full = { ...(out.report as AuditReport), locked: false };
        setReport(full);
        setOpen(Object.fromEntries(full.categories.map((c) => [c.id, c.checks.some((k) => k.status === 'fail')])));
      }
      setUnlocked(true);
      if (typeof out.shareUrl === 'string') setShareUrl(out.shareUrl);
      setLeadState({ sending: false, error: '' });
    } catch (err) {
      setLeadState({ sending: false, error: err instanceof Error ? err.message : 'No se pudo enviar.' });
    }
  }

  async function submitLead(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (report) await unlockWith(lead, report);
  }

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, [loading]);

  async function run(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(''); setReport(null); setStep(0); setShareUrl(null); setProWall(null);
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error en la auditoría.');
      const r = data as AuditReport & { pro?: boolean; shareUrl?: string | null };
      setReport(r);
      setPrevious(compareWithHistory(r).previous);
      setOpen(Object.fromEntries(r.categories.map((c) => [c.id, c.checks.some((k) => k.status === 'fail')])));
      const saved = readSavedLead();
      setUnlocked(!!r.pro);
      if (r.pro && r.shareUrl) setShareUrl(r.shareUrl);
      void loadPerformance(r);
      if (r.pro) return;
      // Misma visita: se reutilizan los datos ya dados y la nueva web queda registrada como lead.
      if (saved) { setLead(saved); void unlockWith(saved, r); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la auditoría.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPerformance(base: AuditReport) {
    let checks: AuditCheck[];
    try {
      const res = await fetch('/api/audit/performance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: base.finalUrl, reportId: base.id }) });
      const data = await res.json();
      checks = res.ok ? data.checks : [{ id: 'cwv', label: 'Core Web Vitals (PageSpeed)', status: 'na', message: data.error ?? 'No disponible.' }];
    } catch {
      checks = [{ id: 'cwv', label: 'Core Web Vitals (PageSpeed)', status: 'na', message: 'No disponible.' }];
    }
    setReport((cur) => {
      // El adelanto no tiene detalle: PageSpeed ya se guarda en el servidor y llega al desbloquear.
      if (!cur || cur.finalUrl !== base.finalUrl || cur.locked) return cur;
      const categories = cur.categories.map((c) => (c.id === 'performance' ? { ...c, checks: [...c.checks.filter((k) => k.status !== 'pending'), ...checks] } : c));
      return finalizeReport({ ...cur, categories });
    });
  }

  const issues = useMemo(() => {
    if (!report) return { fails: [], warns: [] };
    const flat = report.categories.flatMap((c) => c.checks.map((k) => ({ ...k, cat: c.name })));
    return { fails: flat.filter((k) => k.status === 'fail'), warns: flat.filter((k) => k.status === 'warning') };
  }, [report]);

  function printPdf(r: AuditReport) {
    const previous = document.title;
    document.title = `${pro?.brand.name ? `${pro.brand.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-` : ''}Informe-SEO-${new URL(r.finalUrl).hostname}`;
    const restore = () => { document.title = previous; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  const toggleAll = (value: boolean) => report && setOpen(Object.fromEntries(report.categories.map((c) => [c.id, value])));

  return (
    <>
    <div className={s.page}>
      <header className={s.hero}>
        <div className={s.topBar}>
          <a className={s.brand} href={AGENCY_URL}><span className={s.brandMark}>◆</span>AGENTICS <span>SEO AUDIT</span></a>
          <Link className={s.proLink} href="/pro">{pro ? 'Mi cuenta Pro' : 'Plan Pro'}</Link>
        </div>
        <h1>Auditor <em>SEO</em> con <em>IA</em></h1>
        <p className={s.lead}>Introduce la URL de cualquier web y obtén en segundos un análisis de más de 90 aspectos SEO: errores, oportunidades de mejora y recomendaciones para ganar visibilidad en Google y en buscadores con IA como ChatGPT, Perplexity o Gemini. Descarga el informe profesional en PDF.</p>
        <form className={s.form} onSubmit={run}>
          <label htmlFor="audit-url" className={s.sr}>URL a auditar</label>
          <input id="audit-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tuweb.com/pagina" required disabled={loading} />
          <button type="submit" disabled={loading}>{loading ? 'Analizando…' : 'Analizar mi web'}</button>
        </form>
        {counts && <p className={s.counter}>Ya se han realizado <b>{counts.total.toLocaleString('es-ES')}</b> auditorías{counts.today > 0 ? <> · hoy, <b>{counts.today.toLocaleString('es-ES')}</b></> : null}.</p>}
        <p className={s.disclaimer}>Revisión técnica automatizada. No sustituye una estrategia SEO profesional.</p>
      </header>

      {!report && !loading && (
        <section className={s.features} aria-label="Qué incluye">
          <div className={s.featureGrid}>
            <div><b>90+</b><h3>Aspectos analizados</h3><p>Rastreo, on-page, contenido, Schema.org, Core Web Vitals, accesibilidad, E-E-A-T y seguridad.</p></div>
            <div><b>IA</b><h3>Google y buscadores con IA</h3><p>Comprueba si ChatGPT, Claude, Perplexity, Gemini o Copilot pueden leerte y citarte.</p></div>
            <div><b>PDF</b><h3>Informe profesional</h3><p>Resumen, puntuación por área, hallazgos y recomendaciones, listo para compartir con tu equipo o clientes.</p></div>
          </div>
          <ul className={s.areas}>
            {Object.values(CATEGORY_NAMES).map((n, i) => <li key={n}><span>{i + 1}</span>{n}</li>)}
          </ul>
        </section>
      )}

      {loading && (
        <output className={s.status} aria-live="polite">
          <div className={s.spinner} />
          <ul>{STEPS.map((t, i) => <li key={t} className={i < step ? s.done : i === step ? s.active : ''}>{i < step ? '✓' : i === step ? '›' : '·'} {t}</li>)}</ul>
        </output>
      )}

      {error && <p className={s.error} role="alert">{error}</p>}

      {report && (
        <section className={s.report}>
          {!report.ai.enabled && (() => {
            const n = report.categories.flatMap((c) => c.checks).filter((k) => k.status === 'no_api').length;
            return <div className={s.notice}><b>Auditoría sin IA{n > 0 ? `: ${n} comprobaciones de contenido no evaluadas` : ''}.</b> La parte técnica está completa; faltan intención de búsqueda, profundidad, E-E-A-T y citabilidad. La puntuación solo incluye lo evaluado.{report.ai.warning ? ` (${report.ai.warning})` : ''}</div>;
          })()}

          <div className={s.scoreHead}>
            <div className={s.ring}>
              <svg viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="84" className={s.ringBg} />
                <circle cx="100" cy="100" r="84" className={s.ringFg} style={{ stroke: color(report.score), strokeDasharray: RING, strokeDashoffset: RING - (RING * report.score) / 100 }} />
              </svg>
              <div><strong>{Math.round(report.score)}</strong><small>/100</small><span style={{ color: color(report.score) }}>{report.grade}</span></div>
            </div>
            <div className={s.meta}>
              <p className={s.url}>{report.finalUrl}</p>
              <p>{report.summary}</p>
              {previous && (() => {
                const diff = Math.round((report.score - previous.score) * 10) / 10;
                const when = new Date(previous.date).toLocaleDateString('es-ES');
                return <p className={`${s.history} ${diff > 0 ? s.up : diff < 0 ? s.down : ''}`}>{diff > 0 ? `↑ +${diff} puntos` : diff < 0 ? `↓ ${diff} puntos` : '= Mismo resultado'} respecto a tu última auditoría ({Math.round(previous.score)}/100, {when})</p>;
              })()}
              {shareUrl && <p className={s.shareLink}>Enlace a este informe: <a href={shareUrl} target="_blank" rel="noopener noreferrer">{shareUrl.replace(/^https?:\/\//, '')}</a></p>}
              <div className={s.share}>
                <span>Compartir:</span>
                {(() => {
                  const msg = shareUrl ? `Informe SEO + AI SEO de ${new URL(report.finalUrl).hostname}: ${Math.round(report.score)}/100.` : `Mi web ${new URL(report.finalUrl).hostname} ha sacado ${Math.round(report.score)}/100 en el Auditor SEO con IA de AGENTICS. Audita la tuya gratis:`;
                  const link = shareUrl ?? (typeof window === 'undefined' ? '' : window.location.origin);
                  return <>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`${msg} ${link}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    <a href={`https://x.com/intent/post?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer">X</a>
                    <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${msg} ${link}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? '¡Copiado!' : 'Copiar'}</button>
                  </>;
                })()}
              </div>
              <p className={s.small}>{report.generatedAt ? new Date(report.generatedAt).toLocaleString('es-ES') : ''}{report.ai.engine ? ` · IA: ${report.ai.engine}` : ''}</p>
            </div>
            {unlocked && <div className={s.actions}>
              <button type="button" onClick={() => printPdf(report)}>Descargar informe PDF</button>
              <button type="button" onClick={() => download(`auditoria-seo-${new URL(report.finalUrl).hostname}.md`, reportToMarkdown(report), 'text/markdown')}>Descargar .md</button>
            </div>}
          </div>

          <nav className={s.cats}>
            {report.categories.map((c, i) => (
              <a key={c.id} href={`#cat-${c.id}`} onClick={() => setOpen((o) => ({ ...o, [c.id]: true }))}>
                <span>{i + 1}. {c.name}</span>
                <b style={{ color: color(c.score) }}>{c.score === null ? '—' : Math.round(c.score)}</b>
                {(() => {
                  const f = c.counts?.fail ?? c.checks.filter((k) => k.status === 'fail').length;
                  const w = c.counts?.warning ?? c.checks.filter((k) => k.status === 'warning').length;
                  return (f > 0 || w > 0) && <span className={s.badges}>{f > 0 && <em className={s.bFail} title={`${f} error(es)`}>{f}</em>}{w > 0 && <em className={s.bWarn} title={`${w} a mejorar`}>{w}</em>}</span>;
                })()}
                <i><em style={{ width: `${c.score ?? 0}%`, background: color(c.score) }} /></i>
              </a>
            ))}
          </nav>

          {report.locked && (() => {
            const totals = report.categories.reduce((acc, c) => ({ fail: acc.fail + (c.counts?.fail ?? 0), warning: acc.warning + (c.counts?.warning ?? 0) }), { fail: 0, warning: 0 });
            return [{ title: 'Problemas principales', n: totals.fail, cls: s.fail }, { title: 'Aspectos a mejorar', n: totals.warning, cls: s.warn }].map((b) => b.n > 0 && (
              <div key={b.title} className={`${s.issues} ${b.cls} ${s.lockedBlock}`}>
                <h2>{b.title} <span>{b.n}</span></h2>
                <div className={s.blurred} aria-hidden="true">{Array.from({ length: Math.min(b.n, 3) }).map((_, i) => <p key={i}><b>████████████ ███████</b> — ████ ██████████ ███ ████████ ██████ █████████.</p>)}</div>
                <p className={s.lockNote}>{proWall ? '🔒 Disponible con el Plan Pro.' : '🔒 Deja tus datos abajo para ver cuáles son y cómo solucionarlos.'}</p>
              </div>
            ));
          })()}

          {!report.locked && [{ title: 'Problemas principales', list: issues.fails, cls: s.fail }, { title: 'Aspectos a mejorar', list: issues.warns, cls: s.warn }].map((b) => b.list.length > 0 && (
            <div key={b.title} className={`${s.issues} ${b.cls}`}>
              <h2>{b.title} <span>{b.list.length}</span></h2>
              {b.list.slice(0, unlocked ? 12 : 3).map((k) => <p key={`${k.cat}-${k.id}`}><b>{k.label}</b> — {k.message} <small>{k.cat}</small></p>)}
              {!unlocked && b.list.length > 3 && <p className={s.more}>+{b.list.length - 3} más en el informe completo</p>}
            </div>
          ))}

          {!unlocked && proWall && (
            <div className={s.proWall}>
              <span className={s.proBadge}>PLAN PRO</span>
              <h2>Has usado tus {proWall.limit} auditorías gratuitas</h2>
              <p>Para seguir auditando webs (las tuyas o las de tus clientes), pásate al Plan Pro para agencias y profesionales:</p>
              <ul>
                <li>Auditorías ilimitadas con el informe completo</li>
                <li>Informe PDF con tu marca, listo para entregar a tus clientes</li>
                <li>Historial y evolución de cada web</li>
              </ul>
              <Link href="/pro">Ver el Plan Pro</Link>
              <p className={s.small}>¿Ya eres Pro? <Link href="/pro">Entra con tu email</Link>. ¿Prefieres que mejoremos tu web nosotros? <a href={AGENCY_CONTACT_URL}>Reserva un diagnóstico gratuito</a>.</p>
            </div>
          )}

          {!unlocked && !proWall && (
            <form className={s.gate} onSubmit={submitLead}>
              <h2>Desbloquea el informe completo</h2>
              <p className={s.freeNote}>Gratis: hasta 2 auditorías completas por persona. ¿Auditas webs de clientes? <Link href="/pro">Plan Pro ilimitado</Link>.</p>
              <p>Ve qué falla exactamente, cómo solucionarlo paso a paso y descarga el informe profesional en PDF ({report.categories.reduce((n, c) => n + (c.counts?.total ?? c.checks.length), 0)} aspectos analizados).</p>
              <div className={s.gateRow}>
                <label>Nombre<input required minLength={2} maxLength={120} autoComplete="name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} /></label>
                <label>Email<input required type="email" maxLength={254} autoComplete="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} /></label>
                <label>Empresa (opcional)<input maxLength={160} autoComplete="organization" value={lead.company} onChange={(e) => setLead({ ...lead, company: e.target.value })} /></label>
              </div>
              <label className={s.consent}><input type="checkbox" required checked={lead.privacy} onChange={(e) => setLead({ ...lead, privacy: e.target.checked })} /> <span>He leído y acepto la información de privacidad.</span></label>
              <label className={s.consent}><input type="checkbox" checked={lead.marketing} onChange={(e) => setLead({ ...lead, marketing: e.target.checked })} /> <span>Quiero recibir contenidos y ofertas sobre SEO, IA y automatización (opcional).</span></label>
              <details className={s.privacy}><summary>Información de privacidad</summary><p>{LEAD_PRIVACY_NOTICE}</p></details>
              {leadState.error && <p className={s.error} role="alert">{leadState.error}</p>}
              <button type="submit" disabled={leadState.sending}>{leadState.sending ? 'Enviando…' : 'Ver informe completo'}</button>
            </form>
          )}

          {unlocked && <>
          <div className={s.toolbar}>
            <button type="button" onClick={() => toggleAll(true)}>Expandir todo</button>
            <button type="button" onClick={() => toggleAll(false)}>Colapsar todo</button>
          </div>

          {report.categories.map((c, i) => (
            <div key={c.id} id={`cat-${c.id}`} className={`${s.block} ${open[c.id] ? s.open : ''}`}>
              <button type="button" className={s.blockHead} onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} aria-expanded={!!open[c.id]}>
                <span>{i + 1}. {c.name}</span>
                <b style={{ color: color(c.score) }}>{c.score === null ? 'No aplica' : `${Math.round(c.score)}/100`}</b>
              </button>
              <div className={s.blockBody}>
                {c.checks.map((k) => (
                  <div key={k.id} className={s.check} data-status={k.status}>
                    <span className={s.badge}>{STATUS_LABEL[k.status]}</span>
                    <div>
                      <p><b>{k.label}</b> — {k.message}</p>
                      {k.evidence && <code>{k.evidence}</code>}
                      {k.items && k.items.length > 0 && (
                        <ul className={s.items}>
                          {k.items.map((it) => <li key={it.label} data-ok={String(it.ok)}><i>{it.ok === true ? '✓' : it.ok === false ? '✕' : '•'}</i><span><b>{it.label}</b>{it.value && <small>{it.value}</small>}</span></li>)}
                        </ul>
                      )}
                      {k.fix && (k.status === 'fail' || k.status === 'warning') && <p className={s.fix}>→ {k.fix}</p>}
                      {k.source && <a href={k.source} target="_blank" rel="noopener noreferrer">Fuente oficial ↗</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </>}
          {unlocked && REVIEW_URL && (
            <div className={s.review}>
              <p><b>¿Te ha resultado útil la auditoría?</b> Una reseña en Google nos ayuda mucho a seguir ofreciéndola gratis.</p>
              <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer">Dejar una reseña ★</a>
            </div>
          )}
          <div className={s.cta}>
            <div>
              <h2>¿Lo arreglamos por ti?</h2>
              <p>En Agentics Projects corregimos estos puntos, optimizamos tu web para Google y buscadores con IA y automatizamos tu captación.</p>
            </div>
            <a href={AGENCY_CONTACT_URL}>Reservar diagnóstico gratuito</a>
          </div>
          <div className={s.crossSell}>
            <div>
              <h2>🛡️ Comprueba también tu seguridad</h2>
              <p>Un buen SEO no sirve de nada si tu web es vulnerable. Analiza gratis HTTPS, cabeceras, cookies, archivos expuestos y protección contra la suplantación de tu email.</p>
            </div>
            <a href={`${SECURITY_URL}/?url=${encodeURIComponent(new URL(report.finalUrl).hostname)}`} target="_blank" rel="noopener">Analizar seguridad gratis</a>
          </div>
        </section>
      )}
    </div>
    <footer className={s.siteFooter}>
      <a href={AGENCY_URL}>◆ Agentics Projects</a>
      <span>Agentes de IA, automatización y marketing digital</span>
      <a className={s.footerTool} href={SECURITY_URL}>Auditoría de seguridad gratis</a>
      <nav aria-label="Legal">{LEGAL_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</nav>
    </footer>
    {report && unlocked && <ReportPrint report={report} preparedFor={pro ? undefined : lead.company || lead.name || undefined} brand={pro?.brand} />}
    </>
  );
}
