'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AuditReport, CheckStatus } from '@/lib/seo-audit/scoring';
import { AGENCY_CONTACT_URL, AGENCY_URL, LEGAL_LINKS } from '@/lib/site';
import s from '../../audit.module.css';
import ReportPrint from '../../report-print';

const STATUS_LABEL: Record<CheckStatus, string> = { pass: 'Correcto', warning: 'Mejorable', fail: 'Error', na: 'No aplica', no_api: 'Requiere IA', pending: 'Pendiente' };
const RING = 2 * Math.PI * 84;
const color = (score: number | null) => (score === null ? '#6b7194' : score >= 90 ? '#2fd28b' : score >= 75 ? '#7bd84a' : score >= 55 ? '#f5b740' : score >= 35 ? '#ff8a3d' : '#ff4d6d');

// Vista pública de solo lectura de un informe guardado (/r/<id>).
export default function SharedReport({ report }: { report: AuditReport }) {
  const host = new URL(report.finalUrl).hostname;
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(report.categories.map((c) => [c.id, c.checks.some((k) => k.status === 'fail')])));
  const flat = report.categories.flatMap((c) => c.checks.map((k) => ({ ...k, cat: c.name })));
  const blocks = [{ title: 'Problemas principales', list: flat.filter((k) => k.status === 'fail'), cls: s.fail }, { title: 'Aspectos a mejorar', list: flat.filter((k) => k.status === 'warning'), cls: s.warn }];

  function printPdf() {
    const previous = document.title;
    document.title = `Informe-SEO-${host}`;
    setOpen(Object.fromEntries(report.categories.map((c) => [c.id, true])));
    const restore = () => { document.title = previous; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  return (
    <>
      <div className={s.page}>
        <header className={s.hero}>
          <Link className={s.brand} href="/"><span className={s.brandMark}>◆</span>AGENTICS <span>SEO AUDIT</span></Link>
          <h1>Informe SEO de <em>{host}</em></h1>
        </header>
        <section className={s.report}>
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
              <p className={s.small}>Auditado el {new Date(report.generatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className={s.actions}>
              <button type="button" onClick={printPdf}>Descargar informe PDF</button>
              <Link href="/" className={s.actionLink}>Auditar otra web</Link>
            </div>
          </div>

          <nav className={s.cats}>
            {report.categories.map((c, i) => {
              const f = c.checks.filter((k) => k.status === 'fail').length;
              const w = c.checks.filter((k) => k.status === 'warning').length;
              return (
                <a key={c.id} href={`#cat-${c.id}`} onClick={() => setOpen((o) => ({ ...o, [c.id]: true }))}>
                  <span>{i + 1}. {c.name}</span>
                  <b style={{ color: color(c.score) }}>{c.score === null ? '—' : Math.round(c.score)}</b>
                  <i><em style={{ width: `${c.score ?? 0}%`, background: color(c.score) }} /></i>
                  {(f > 0 || w > 0) && <span className={s.badges}>{f > 0 && <em className={s.bFail}>{f}</em>}{w > 0 && <em className={s.bWarn}>{w}</em>}</span>}
                </a>
              );
            })}
          </nav>

          {blocks.map((b) => b.list.length > 0 && (
            <div key={b.title} className={`${s.issues} ${b.cls}`}>
              <h2>{b.title} <span>{b.list.length}</span></h2>
              {b.list.slice(0, 12).map((k) => <p key={`${k.cat}-${k.id}`}><b>{k.label}</b> — {k.message} <small>{k.cat}</small></p>)}
            </div>
          ))}

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

          <div className={s.cta}>
            <div>
              <h2>¿Y tu web? Audítala gratis</h2>
              <p>Más de 100 aspectos de SEO técnico y visibilidad en buscadores con IA, con informe en PDF. ¿Prefieres que lo hagamos nosotros? Hablamos.</p>
            </div>
            <div className={s.ctaButtons}>
              <Link href="/">Auditar mi web</Link>
              <a href={AGENCY_CONTACT_URL} className={s.ctaGhost}>Hablar con Agentics</a>
            </div>
          </div>
        </section>
      </div>
      <footer className={s.siteFooter}>
        <a href={AGENCY_URL}>◆ Agentics Projects</a>
        <span>Agentes de IA, automatización y marketing digital</span>
        <nav aria-label="Legal">{LEGAL_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</nav>
      </footer>
      <ReportPrint report={report} />
    </>
  );
}
