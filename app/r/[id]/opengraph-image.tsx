import { ImageResponse } from 'next/og';
import { loadReport } from '@/lib/seo-audit/reports';

export const runtime = 'nodejs';
export const alt = 'Informe de auditoría SEO · AGENTICS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const tone = (s: number) => (s >= 90 ? '#2fd28b' : s >= 75 ? '#7bd84a' : s >= 55 ? '#f5b740' : s >= 35 ? '#ff8a3d' : '#ff4d6d');

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id, { unlockedOnly: true });
  const host = report ? new URL(report.finalUrl).hostname : 'Informe no disponible';
  const score = report ? Math.round(report.score) : 0;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px 72px', background: 'linear-gradient(135deg, #060712 0%, #140b33 55%, #0b1f4a 100%)', color: '#f7f7ff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, fontWeight: 800, letterSpacing: 4 }}>
          <div style={{ display: 'flex', width: 26, height: 26, background: '#9b5cff', transform: 'rotate(45deg)', borderRadius: 4, marginRight: 8 }} /> AGENTICS <span style={{ color: '#45d5ff' }}>INFORME SEO</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
          <div style={{ width: 260, height: 260, borderRadius: 999, border: `22px solid ${report ? tone(score) : '#3a3f6a'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{report ? score : '—'}</div>
            <div style={{ display: 'flex', fontSize: 28, color: '#aeb3cf' }}>/100</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 680 }}>
            <div style={{ display: 'flex', fontSize: 30, color: '#aeb3cf' }}>Auditoría SEO + AI SEO de</div>
            <div style={{ display: 'flex', fontSize: host.length > 30 ? 40 : host.length > 20 ? 50 : 66, wordBreak: 'break-all', fontWeight: 800, lineHeight: 1.05 }}>{host}</div>
            {report && <div style={{ display: 'flex', fontSize: 32, color: tone(score), fontWeight: 700 }}>{report.grade}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#c9cde8' }}>¿Y tu web? Audítala gratis en auditoria.agenticsprojects.com</div>
      </div>
    ),
    size,
  );
}
