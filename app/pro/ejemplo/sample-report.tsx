'use client';

import Link from 'next/link';
import type { AuditReport } from '@/lib/seo-audit/scoring';
import { AGENCY_URL } from '@/lib/site';
import a from '../../audit.module.css';
import ReportPrint, { type Brand } from '../../report-print';
import s from '../pro.module.css';

// Logo genérico de ejemplo (SVG en línea): en el informe real va el logo que sube la agencia.
const SAMPLE_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect width="40" height="40" rx="9" fill="#0f766e"/><path d="M12 28 20 12l8 16" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="48" y="26" font-family="Arial" font-weight="700" font-size="15" fill="#0f172a">LOGO</text></svg>')}`;
const SAMPLE_BRAND: Brand = { name: 'Tu Agencia', logo: SAMPLE_LOGO, contact: 'hola@tuagencia.com · tuagencia.com' };

export default function SampleReport({ report }: { report: AuditReport | null }) {
  function printPdf() {
    const previous = document.title;
    document.title = 'Tu-Agencia-Informe-SEO-ejemplo';
    const restore = () => { document.title = previous; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  return (
    <>
      <div className={a.page} style={{ minHeight: 0, paddingBottom: 32 }}>
        <header className={a.hero}>
          <div className={a.topBar}>
            <a className={a.brand} href={AGENCY_URL}><span className={a.brandMark}>◆</span>AGENTICS <span>SEO AUDIT</span></a>
            <Link className={a.proLink} href="/pro">Ver el Plan Pro</Link>
          </div>
          <h1>Así verá tu <em>cliente</em> el informe</h1>
          <p className={a.lead}>Ejemplo real generado con la herramienta, con la marca de una agencia ficticia (&quot;Tu Agencia&quot;): logo en la cabecera, nombre y datos de contacto en el pie, y el archivo PDF con tu nombre.</p>
          {report && <div className={s.row} style={{ justifyContent: 'center' }}>
            <button type="button" className={s.primary} onClick={printPdf}>Descargar este ejemplo en PDF</button>
            <Link className={s.ghost} href="/pro">Empezar con el Plan Pro</Link>
          </div>}
        </header>
        {!report && <p className={a.notice}>El ejemplo no está disponible ahora mismo. Puedes auditar cualquier web gratis desde la <Link href="/">página principal</Link>.</p>}
      </div>
      {report && <div className={s.sampleWrap}><ReportPrint report={report} brand={SAMPLE_BRAND} screen /></div>}
    </>
  );
}
