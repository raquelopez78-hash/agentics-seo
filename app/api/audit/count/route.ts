import { auditCounts } from '@/lib/seo-audit/counter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET → { total, today } o { total: null } si no hay base de datos.
export async function GET() {
  const counts = await auditCounts();
  return Response.json(counts ?? { total: null, today: null }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
