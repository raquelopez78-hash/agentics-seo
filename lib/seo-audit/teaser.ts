// Adelanto del informe: nota, recuento por área y resumen, sin ningún problema concreto.
// El informe completo solo sale del servidor después de captar el lead.
import type { AuditReport, CheckCounts } from './scoring.ts';

export function countChecks(checks: { status: string }[]): CheckCounts {
  return {
    fail: checks.filter((k) => k.status === 'fail').length,
    warning: checks.filter((k) => k.status === 'warning').length,
    pass: checks.filter((k) => k.status === 'pass').length,
    total: checks.length,
  };
}

export function toTeaser(report: AuditReport): AuditReport {
  return {
    ...report,
    locked: true,
    categories: report.categories.map((c) => ({ id: c.id, name: c.name, score: c.score, checks: [], counts: countChecks(c.checks) })),
  };
}
