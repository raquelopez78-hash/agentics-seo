import type { Metadata } from 'next';
import { mailerEnabled } from '@/lib/pro/mailer';
import { PRO_FEATURES, PRO_PRICES } from '@/lib/pro/plans';
import { stripeEnabled } from '@/lib/pro/stripe';
import ProClient from './pro-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Plan Pro para agencias · Auditor SEO con IA · AGENTICS',
  description: `Auditorías SEO y AI SEO ilimitadas, informe PDF con tu marca e historial de cada web. Desde ${PRO_PRICES.monthly} €/mes.`,
  alternates: { canonical: '/pro' },
};

export default function ProPage() {
  return <ProClient prices={PRO_PRICES} features={PRO_FEATURES} payments={stripeEnabled()} login={mailerEnabled() && !!process.env.SESSION_SECRET} />;
}
