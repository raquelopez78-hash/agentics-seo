// Envío del enlace de acceso por SMTP (Gmail con contraseña de aplicación). SMTP_USER, SMTP_PASS y, opcional, SMTP_HOST/SMTP_PORT.
import nodemailer from 'nodemailer';
import { SITE_URL } from '@/lib/site';

export const mailerEnabled = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendLoginLink(to: string, token: string) {
  const link = `${SITE_URL}/api/pro/verify?token=${encodeURIComponent(token)}`;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: `"Agentics · Auditor SEO" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Tu enlace de acceso al Plan Pro',
    text: `Entra en tu cuenta Pro con este enlace (válido 20 minutos, un solo uso):\n${link}\n\nSi no lo has pedido, ignora este correo.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#0f172a;line-height:1.6"><p>Hola:</p><p>Pulsa el botón para entrar en tu cuenta del <b>Plan Pro</b> del Auditor SEO con IA.</p>
<p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold">Entrar en mi cuenta Pro</a></p>
<p style="font-size:13px;color:#64748b">El enlace caduca en 20 minutos y solo funciona una vez. Si no lo has pedido, ignora este correo.</p></div>`,
  });
}
