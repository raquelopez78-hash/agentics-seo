'use client';

import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_NAMES, finalizeReport, reportToMarkdown, type AuditCheck, type AuditReport, type CheckStatus } from '@/lib/seo-audit/scoring';
import { LEAD_PRIVACY_NOTICE } from '@/lib/seo-audit/lead';
import s from './audit.module.css';
import ReportPrint from './report-print';

const UNLOCK_KEY = 'agentics-seo-unlocked';
const readUnlocked = () => { try { return sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch { return false; } };

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
  const [lead, setLead] = useState({ name: '', email: '', company: '', privacy: false, marketing: false });
  const [leadState, setLeadState] = useState<{ sending: boolean; error: string }>({ sending: false, error: '' });

  async function submitLead(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!report) return;
    setLeadState({ sending: true, error: '' });
    try {
      const res = await fetch('/api/audit/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...lead, report }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar.');
      try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch { /* sin almacenamiento */ }
      setUnlocked(true);
      setLeadState({ sending: false, error: '' });
    } catch (err) {
      setLeadState({ sending: false, error: err instanceof Error ? err.message : 'No se pudo enviar.' });
    }
  }

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, [loading]);

  async function run(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(''); setReport(null); setStep(0);
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error en la auditoría.');
      const r = data as AuditReport;
      setReport(r);
      setUnlocked(readUnlocked());
      setOpen(Object.fromEntries(r.categories.map((c) => [c.id, c.checks.some((k) => k.status === 'fail')])));
      void loadPerformance(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la auditoría.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPerformance(base: AuditReport) {
    let checks: AuditCheck[];
    try {
      const res = await fetch('/api/audit/performance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: base.finalUrl }) });
      const data = await res.json();
      checks = res.ok ? data.checks : [{ id: 'cwv', label: 'Core Web Vitals (PageSpeed)', status: 'na', message: data.error ?? 'No disponible.' }];
    } catch {
      checks = [{ id: 'cwv', label: 'Core Web Vitals (PageSpeed)', status: 'na', message: 'No disponible.' }];
    }
    setReport((cur) => {
      if (!cur || cur.finalUrl !== base.finalUrl) return cur;
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
    document.title = `Informe-SEO-${new URL(r.finalUrl).hostname}`;
    const restore = () => { document.title = previous; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  const toggleAll = (value: boolean) => report && setOpen(Object.fromEntries(report.categories.map((c) => [c.id, value])));

  return (
    <>
    <div className={s.page}>
      <header className={s.hero}>
        <div className={s.brand}><span className={s.brandMark}>◆</span>AGENTICS <span>SEO AUDIT</span></div>
        <h1>Auditor <em>SEO</em> con <em>IA</em></h1>
        <p className={s.lead}>Introduce la URL de cualquier web y obtén en segundos un análisis de más de 90 aspectos SEO: errores, oportunidades de mejora y recomendaciones para ganar visibilidad en Google y en buscadores con IA como ChatGPT, Perplexity o Gemini. Descarga el informe profesional en PDF.</p>
        <form className={s.form} onSubmit={run}>
          <label htmlFor="audit-url" className={s.sr}>URL a auditar</label>
          <input id="audit-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tuweb.com/pagina" required disabled={loading} />
          <button type="submit" disabled={loading}>{loading ? 'Analizando…' : 'Analizar mi web'}</button>
        </form>
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
          {!report.ai.enabled && <div className={s.notice}>Análisis con IA desactivado{report.ai.warning ? `: ${report.ai.warning}` : '. Configura ANTHROPIC_API_KEY para evaluar intención, E-E-A-T y citabilidad.'}</div>}

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
                <i><em style={{ width: `${c.score ?? 0}%`, background: color(c.score) }} /></i>
              </a>
            ))}
          </nav>

          {[{ title: 'Problemas principales', list: issues.fails, cls: s.fail }, { title: 'Aspectos a mejorar', list: issues.warns, cls: s.warn }].map((b) => b.list.length > 0 && (
            <div key={b.title} className={`${s.issues} ${b.cls}`}>
              <h2>{b.title} <span>{b.list.length}</span></h2>
              {b.list.slice(0, unlocked ? 12 : 3).map((k) => <p key={`${k.cat}-${k.id}`}><b>{k.label}</b> — {k.message} <small>{k.cat}</small></p>)}
              {!unlocked && b.list.length > 3 && <p className={s.more}>+{b.list.length - 3} más en el informe completo</p>}
            </div>
          ))}

          {!unlocked && (
            <form className={s.gate} onSubmit={submitLead}>
              <h2>Desbloquea el informe completo</h2>
              <p>Detalle de los {report.categories.reduce((n, c) => n + c.checks.length, 0)} aspectos analizados, cómo solucionar cada punto e informe profesional en PDF listo para compartir.</p>
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
                      {k.fix && (k.status === 'fail' || k.status === 'warning') && <p className={s.fix}>→ {k.fix}</p>}
                      {k.source && <a href={k.source} target="_blank" rel="noopener noreferrer">Fuente oficial ↗</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </>}
          <p className={s.footer}>Informe generado por AGENTICS · Auditoría SEO + AI SEO</p>
        </section>
      )}
    </div>
    {report && unlocked && <ReportPrint report={report} preparedFor={lead.company || lead.name || undefined} />}
    </>
  );
}
