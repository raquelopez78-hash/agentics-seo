// Enlace de acceso al Plan Pro.
import { sendMail } from '@/lib/mail';
import { SITE_URL } from '@/lib/site';

export { mailerEnabled } from '@/lib/mail';

export async function sendLoginLink(to: string, token: string) {
  const link = `${SITE_URL}/api/pro/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: 'Tu enlace de acceso al Plan Pro',
    text: `Entra en tu cuenta Pro con este enlace (válido 20 minutos, un solo uso):\n${link}\n\nSi no lo has pedido, ignora este correo.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#0f172a;line-height:1.6"><p>Hola:</p><p>Pulsa el botón para entrar en tu cuenta del <b>Plan Pro</b> del Auditor SEO con IA.</p>
<p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold">Entrar en mi cuenta Pro</a></p>
<p style="font-size:13px;color:#64748b">El enlace caduca en 20 minutos y solo funciona una vez. Si no lo has pedido, ignora este correo.</p></div>`,
  });
}
