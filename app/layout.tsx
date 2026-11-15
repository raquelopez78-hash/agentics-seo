import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: 'Auditoría SEO + AI SEO gratis · AGENTICS',
  description: 'Audita gratis el SEO técnico y la visibilidad en asistentes de IA de cualquier URL: rastreo, on-page, Schema.org, Core Web Vitals, E-E-A-T y bots de IA.',
  alternates: { canonical: '/' },
  icons: { icon: '/agentics-logo.png' },
  openGraph: { title: 'Auditoría SEO + AI SEO gratis · AGENTICS', description: 'SEO técnico y visibilidad en asistentes de IA de cualquier URL, con puntuación 0-100.', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
