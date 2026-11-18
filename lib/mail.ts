// Envío de correo por SMTP (Gmail con contraseña de aplicación): SMTP_USER, SMTP_PASS y, opcional, SMTP_HOST/SMTP_PORT.
import nodemailer, { type Transporter } from 'nodemailer';

export const mailerEnabled = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

/** Destinatario de los avisos internos (lead nuevo). Por defecto, la propia cuenta remitente. */
export const notifyEmail = () => process.env.LEADS_NOTIFY_EMAIL || process.env.SMTP_USER || '';

let transport: Transporter | null = null;
function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

export type Mail = { to: string; subject: string; html: string; text: string; fromName?: string; replyTo?: string };

export async function sendMail(m: Mail) {
  await getTransport().sendMail({
    from: `"${m.fromName ?? 'Agentics · Auditor SEO'}" <${process.env.SMTP_USER}>`,
    to: m.to,
    replyTo: m.replyTo,
    subject: m.subject,
    text: m.text,
    html: m.html,
  });
}
