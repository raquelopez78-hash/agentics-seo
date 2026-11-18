import type { Metadata } from 'next';
import { loadSampleReport } from '@/lib/seo-audit/reports';
import SampleReport from './sample-report';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ejemplo de informe SEO con tu marca · Plan Pro · AGENTICS',
  description: 'Así es el informe PDF que entregarás a tus clientes con el Plan Pro: tu logo, tus datos de contacto, más de 100 comprobaciones SEO y de visibilidad en IA.',
  alternates: { canonical: '/pro/ejemplo' },
};

export default async function SamplePage() {
  return <SampleReport report={await loadSampleReport()} />;
}
