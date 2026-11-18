import { runScheduledMails } from '@/lib/seo-audit/lead-mails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Tarea diaria de Vercel (vercel.json → crons). Vercel envía "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('No autorizado', { status: 401 });
  try {
    const result = await runScheduledMails();
    console.log('seo-audit cron emails', JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error('seo-audit cron emails', error);
    return Response.json({ error: 'fallo' }, { status: 500 });
  }
}
