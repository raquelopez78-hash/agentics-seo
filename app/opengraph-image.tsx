import { ImageResponse } from 'next/og';

// Imagen para compartir en redes (1200×630), generada en build.
export const alt = 'Auditor SEO con IA · AGENTICS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: 'linear-gradient(135deg, #060712 0%, #140b33 55%, #0b1f4a 100%)', color: '#f7f7ff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 800, letterSpacing: 4 }}>
          <div style={{ width: 28, height: 28, background: '#9b5cff', transform: 'rotate(45deg)', borderRadius: 4, marginRight: 8 }} /> AGENTICS <span style={{ color: '#45d5ff' }}>SEO AUDIT</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, display: 'flex', flexWrap: 'wrap' }}>
            Auditor&nbsp;<span style={{ color: '#ad68ff' }}>SEO</span>&nbsp;con&nbsp;<span style={{ color: '#4bdcff' }}>IA</span>
          </div>
          <div style={{ fontSize: 34, color: '#c9cde8', maxWidth: 900 }}>Más de 100 aspectos SEO y de visibilidad en ChatGPT, Perplexity y Gemini. Informe PDF gratis.</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['Rastreo', 'On-page', 'Schema', 'Core Web Vitals', 'E-E-A-T', 'AI SEO'].map((t) => (
            <div key={t} style={{ display: 'flex', fontSize: 24, padding: '10px 20px', borderRadius: 999, border: '2px solid #3a3f6a', background: '#10132a' }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
