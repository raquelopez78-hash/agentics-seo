import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadReport } from '@/lib/seo-audit/reports';
import SharedReport from './shared-report';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const report = await loadReport(id, { unlockedOnly: true });
  if (!report) return { title: 'Informe no encontrado · AGENTICS', robots: { index: false } };
  const host = new URL(report.finalUrl).hostname;
  const title = `Auditoría SEO de ${host}: ${Math.round(report.score)}/100 · AGENTICS`;
  const description = `${report.grade}. ${report.summary} Informe SEO + AI SEO generado con el Auditor SEO con IA de Agentics Projects.`;
  return { title, description, robots: { index: false, follow: true }, alternates: { canonical: `/r/${id}` }, openGraph: { title, description, type: 'article' }, twitter: { card: 'summary_large_image', title, description } };
}

export default async function SharedReportPage({ params }: Props) {
  const { id } = await params;
  const report = await loadReport(id, { unlockedOnly: true });
  if (!report) notFound();
  return <SharedReport report={report} />;
}
