import { pg } from '@/db/pg';
import { verifyUnsubscribe } from '@/lib/pro/crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const page = (title: string, text: string, status = 200) => new Response(
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Arial,sans-serif;background:#060712;color:#f7f7ff;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><main style="max-width:480px;text-align:center"><h1 style="font-size:24px">${title}</h1><p style="color:#aeb3cf">${text}</p><p><a style="color:#7fb2ff" href="https://www.agenticsprojects.com">agenticsprojects.com</a></p></main></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
);

// GET ?id=&t= (enlace del pie de los correos) → baja de los correos automáticos.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const id = q.get('id') ?? '';
  const t = q.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !verifyUnsubscribe(id, t, process.env.SESSION_SECRET || '')) return page('Enlace no válido', 'Si quieres darte de baja, responde a cualquiera de nuestros correos con la palabra BAJA.', 400);
  try {
    await pg()`update seo_audit.leads set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = ${id}`;
  } catch (error) {
    console.error('seo-audit unsubscribe', (error as { code?: string })?.code ?? error);
    return page('No se pudo completar', 'Inténtalo de nuevo en unos minutos o responde a nuestro correo con la palabra BAJA.', 500);
  }
  return page('Baja completada', 'No volverás a recibir correos automáticos sobre tu auditoría.');
}
