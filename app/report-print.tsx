import type { AuditReport, CheckStatus } from '@/lib/seo-audit/scoring';
import r from './report.module.css';

// Informe imprimible (A4, tema claro). Solo visible al imprimir / "Guardar como PDF".
const ICON: Record<CheckStatus, string> = { pass: '✓', warning: '!', fail: '✕', na: '–', no_api: '·', pending: '…' };
const tone = (s: number | null) => (s === null ? '#9aa1b8' : s >= 75 ? '#16a34a' : s >= 55 ? '#d97706' : '#dc2626');

function Donut({ pass, warn, fail }: { pass: number; warn: number; fail: number }) {
  const total = pass + warn + fail || 1;
  const R = 42;
  const C = 2 * Math.PI * R;
  const parts = [{ value: pass, color: '#2563eb' }, { value: warn, color: '#60a5fa' }, { value: fail, color: '#bfdbfe' }];
  const segments = parts.map((p, i) => {
    const start = parts.slice(0, i).reduce((s, x) => s + (x.value / total) * C, 0);
    const len = (p.value / total) * C;
    return <circle key={p.color} cx="60" cy="60" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-start} />;
  });
  return (
    <svg viewBox="0 0 120 120" className={r.donut} aria-hidden="true">
      <g transform="rotate(-90 60 60)">{segments}</g>
    </svg>
  );
}

export default function ReportPrint({ report, preparedFor }: { report: AuditReport; preparedFor?: string }) {
  const all = report.categories.flatMap((c) => c.checks.map((k) => ({ ...k, cat: c.name })));
  const pass = all.filter((k) => k.status === 'pass').length;
  const warn = all.filter((k) => k.status === 'warning').length;
  const fail = all.filter((k) => k.status === 'fail').length;
  const evaluated = pass + warn + fail || 1;
  const pct = (n: number) => Math.round((n / evaluated) * 100);
  const host = new URL(report.finalUrl).hostname;
  const date = report.generatedAt ? new Date(report.generatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const findings = [...all.filter((k) => k.status === 'fail'), ...all.filter((k) => k.status === 'warning')].slice(0, 8);
  const strengths = all.filter((k) => k.status === 'pass').slice(0, 6);
  const RING = 2 * Math.PI * 52;

  return (
    <div className={r.report} aria-hidden="true">
      <section className={r.sheet}>
        <header className={r.top}>
          <span className={r.brand}><b>◆</b> AGENTICS</span>
          <span>{date}</span>
        </header>

        <div className={r.hero}>
          <div>
            <h1>Informe SEO <span>con IA</span></h1>
            <p className={r.domain}>{host}</p>
            {preparedFor && <p className={r.prepared}>Preparado para: <b>{preparedFor}</b></p>}
          </div>
          <div className={r.ring}>
            <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className={r.ringBg} /><circle cx="60" cy="60" r="52" className={r.ringFg} style={{ stroke: tone(report.score), strokeDasharray: RING, strokeDashoffset: RING - (RING * report.score) / 100 }} /></svg>
            <div><strong>{all.length}</strong><small>aspectos analizados</small></div>
          </div>
        </div>

        <h2>Resumen general</h2>
        <p className={r.lead}>Nota global <b>{Math.round(report.score)}/100 ({report.grade.toLowerCase()})</b>. Hemos analizado {all.length} aspectos técnicos, de contenido, autoridad, experiencia de usuario y visibilidad en buscadores con IA. {report.summary}</p>

        <div className={r.kpis}>
          <div><strong>{pass}</strong><span>Puntos fuertes</span><i style={{ background: '#16a34a' }} /></div>
          <div><strong>{warn}</strong><span>Aspectos a mejorar</span><i style={{ background: '#f59e0b' }} /></div>
          <div><strong>{fail}</strong><span>Problemas críticos</span><i style={{ background: '#dc2626' }} /></div>
          <div><strong>{Math.round(report.score)}<small>/100</small></strong><span>Puntuación SEO</span><i style={{ background: '#2563eb', width: `${report.score}%` }} /></div>
        </div>

        <div className={r.cols}>
          <div>
            <h3>Puntuación por área</h3>
            {report.categories.map((c) => (
              <div key={c.id} className={r.bar}>
                <span>{c.name}</span>
                <em><i style={{ width: `${c.score ?? 0}%`, background: tone(c.score) }} /></em>
                <b style={{ color: tone(c.score) }}>{c.score === null ? 'N/A' : Math.round(c.score)}</b>
              </div>
            ))}
          </div>
          <div>
            <h3>Distribución de hallazgos</h3>
            <div className={r.dist}>
              <Donut pass={pass} warn={warn} fail={fail} />
              <ul>
                <li><i style={{ background: '#2563eb' }} />Correctos <b>{pct(pass)}%</b></li>
                <li><i style={{ background: '#60a5fa' }} />A mejorar <b>{pct(warn)}%</b></li>
                <li><i style={{ background: '#bfdbfe' }} />Críticos <b>{pct(fail)}%</b></li>
              </ul>
            </div>
          </div>
        </div>

        <h3>Principales hallazgos</h3>
        <ul className={r.findings}>
          {findings.map((k) => (
            <li key={`${k.cat}-${k.id}`} data-status={k.status}>
              <span>{ICON[k.status]}</span>
              <div><b>{k.label}</b><p>{k.fix ?? k.message}</p></div>
            </li>
          ))}
          {strengths.slice(0, Math.max(0, 8 - findings.length)).map((k) => (
            <li key={`ok-${k.cat}-${k.id}`} data-status="pass"><span>✓</span><div><b>{k.label}</b><p>{k.message}</p></div></li>
          ))}
        </ul>
      </section>

      {report.categories.map((c, i) => (
        <section key={c.id} className={r.detail}>
          <h2>{i + 1}. {c.name} <b style={{ color: tone(c.score) }}>{c.score === null ? 'No aplica' : `${Math.round(c.score)}/100`}</b></h2>
          <table>
            <thead><tr><th>Estado</th><th>Aspecto</th><th>Resultado</th><th>Recomendación</th></tr></thead>
            <tbody>
              {c.checks.map((k) => (
                <tr key={k.id} data-status={k.status}>
                  <td><span>{ICON[k.status]}</span></td>
                  <td><b>{k.label}</b></td>
                  <td>{k.message}{k.evidence && <code>{k.evidence}</code>}</td>
                  <td>{k.status === 'fail' || k.status === 'warning' ? k.fix ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <footer className={r.foot}>Informe generado por AGENTICS · Auditor SEO con IA · {report.finalUrl} · {date}. Revisión técnica automatizada; no sustituye una estrategia SEO profesional.</footer>
    </div>
  );
}
