// Plantillas de los correos a leads (puras: sin red ni base de datos, para poder probarlas).
export type LeadMailData = {
  name: string; email: string; company?: string; auditedUrl: string; score: number | null; grade?: string;
  fails?: number; warnings?: number; topIssues?: { label: string; message: string; category: string }[];
  reportUrl: string; marketing?: boolean; unsubscribeUrl?: string;
};
export type Built = { to: string; subject: string; html: string; text: string };

const SITE = 'https://auditoria.agenticsprojects.com';
const AGENCY = 'https://www.agenticsprojects.com';
const CONTACT = `${AGENCY}/#contacto`;

export const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const hostOf = (url: string) => String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
export const firstName = (name: string) => String(name || '').trim().split(/\s+/)[0] || 'hola';
const nota = (score: number | null) => (score === null || Number.isNaN(Number(score)) ? '' : String(Math.round(Number(score))));
const link = (url: string) => (url ? url : SITE);

const wrap = (body: string) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6">${body}</div>`;
const button = (href: string, label: string, bg = '#2563eb', color = '#fff') =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${bg};color:${color};text-decoration:none;font-weight:bold">${label}</a></p>`;
const signature = `<p>Un saludo,<br><b>Raquel López</b><br>Agentics Projects · Agentes de IA y automatización<br><a href="${AGENCY}" style="color:#2563eb">agenticsprojects.com</a></p>`;
const footer = (extra: string, unsubscribeUrl?: string) => `<p style="font-size:12px;color:#64748b;margin-top:28px">Te escribimos porque solicitaste una auditoría en auditoria.agenticsprojects.com. ${extra} ${unsubscribeUrl ? `Si no quieres recibir más correos, <a href="${esc(unsubscribeUrl)}" style="color:#64748b">date de baja aquí</a>.` : 'Si no quieres recibir más correos, responde con "BAJA".'}</p>`;

/** Al momento: el informe para el lead. */
export function reportMail(d: LeadMailData): Built {
  const host = hostOf(d.auditedUrl);
  const n = nota(d.score);
  return {
    to: d.email,
    subject: `Tu informe SEO de ${host}${n ? `: ${n}/100` : ''}`,
    text: `Hola ${firstName(d.name)}:\n\nAquí tienes el informe completo de ${host}${n ? ` (${n}/100)` : ''}: ${link(d.reportUrl)}\n\nDesde el enlace puedes verlo cuando quieras y descargarlo en PDF.\n\nRaquel López · Agentics Projects`,
    html: wrap(`<p>Hola ${esc(firstName(d.name))}:</p>
<p>Aquí tienes el informe completo de <b>${esc(host)}</b>${n ? `, con una nota de <b>${n}/100</b>` : ''}. Puedes abrirlo cuando quieras y descargarlo en PDF desde el enlace.</p>
${button(link(d.reportUrl), 'Ver mi informe')}
<p>Si tienes dudas sobre algún punto, responde a este correo y te ayudo.</p>${signature}${footer('Te enviaremos como mucho un par de correos más sobre ella.', d.unsubscribeUrl)}`),
  };
}

/** A los 2-3 días: seguimiento con propuesta de videollamada. */
export function followupMail(d: LeadMailData): Built {
  const host = hostOf(d.auditedUrl);
  const n = nota(d.score);
  const first = d.topIssues?.[0];
  const destacado = first
    ? `<p>Lo más importante que vimos: <b>${esc(first.label)}</b> (${esc(first.category)}). ${esc(first.message)}</p>`
    : `<p>No vimos errores graves, pero sí <b>${Number(d.warnings) || 0} aspectos a mejorar</b> que pueden darte más visibilidad en Google y en los buscadores con IA.</p>`;
  return {
    to: d.email,
    subject: `${firstName(d.name)}, ¿pudiste revisar la auditoría de ${host}?`,
    text: `Hola ${firstName(d.name)}:\n\nHace un par de días auditaste ${host}${n ? ` y obtuvo ${n}/100` : ''}. Si quieres, lo revisamos juntos en una videollamada de 20 minutos, gratis y sin compromiso: ${CONTACT}\n\nTu informe: ${link(d.reportUrl)}\n\nRaquel López · Agentics Projects`,
    html: wrap(`<p>Hola ${esc(firstName(d.name))}:</p>
<p>Hace un par de días auditaste <b>${esc(host)}</b> con nuestra herramienta${n ? ` y obtuvo <b>${n}/100</b>` : ''}.</p>
${destacado}
<p>Muchas de estas mejoras se resuelven rápido, pero cuesta saber por dónde empezar y qué impacto tiene cada una. Si quieres, lo revisamos juntos en una videollamada de 20 minutos, gratis y sin compromiso: te digo qué arreglar primero y por qué.</p>
${button(CONTACT, 'Reservar 20 minutos')}
<p>Si prefieres hacerlo por tu cuenta, aquí tienes de nuevo <a href="${esc(link(d.reportUrl))}" style="color:#2563eb">tu informe completo</a>.</p>${signature}${footer('Es el único seguimiento que te enviaremos sobre ella.', d.unsubscribeUrl)}`),
  };
}

/** Unos días después: petición de reseña en Google (sin incentivos, a todos por igual). */
export function reviewMail(d: LeadMailData, reviewUrl: string): Built {
  const host = hostOf(d.auditedUrl);
  return {
    to: d.email,
    subject: `${firstName(d.name)}, ¿qué te pareció la auditoría de ${host}?`,
    text: `Hola ${firstName(d.name)}:\n\nHace unos días auditaste ${host} con nuestro Auditor SEO con IA. ¿Nos dedicas 30 segundos? Tu opinión en Google, sea la que sea, nos ayuda a mejorar: ${reviewUrl}\n\n¡Gracias!\nRaquel López · Agentics Projects`,
    html: wrap(`<p>Hola ${esc(firstName(d.name))}:</p>
<p>Hace unos días auditaste <b>${esc(host)}</b> con nuestro Auditor SEO con IA. Esperamos que te haya servido para saber por dónde mejorar.</p>
<p>¿Nos dedicas 30 segundos? Tu opinión en Google, sea la que sea, nos ayuda a mejorar la herramienta y a seguir ofreciéndola gratis.</p>
${button(reviewUrl, 'Dejar mi opinión ★', '#f5b740', '#1a1300')}
<p>¡Gracias!</p>${signature}${footer('Es el único correo que te enviaremos sobre ello.', d.unsubscribeUrl)}`),
  };
}

/** Aviso interno de lead nuevo. */
export function newLeadNotice(d: LeadMailData, to: string): Built {
  const host = hostOf(d.auditedUrl);
  const n = nota(d.score);
  const issues = (d.topIssues ?? []).slice(0, 5).map((i) => `<li><b>${esc(i.label)}</b>: ${esc(i.message)}</li>`).join('');
  return {
    to,
    subject: `Nuevo lead: ${d.name} · ${host}${n ? ` (${n}/100)` : ''}`,
    text: `Nuevo lead de la auditoría SEO\n\nNombre: ${d.name}\nEmail: ${d.email}\nEmpresa: ${d.company || '-'}\nWeb: ${d.auditedUrl}\nNota: ${n || '-'} ${d.grade ?? ''}\nComunicaciones comerciales: ${d.marketing ? 'sí' : 'no'}\nInforme: ${link(d.reportUrl)}`,
    html: wrap(`<h2 style="margin:0 0 12px">Nuevo lead de la auditoría SEO</h2>
<table style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Nombre</td><td><b>${esc(d.name)}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Empresa</td><td>${esc(d.company || '-')}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Web</td><td>${esc(d.auditedUrl)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Nota</td><td>${n ? `${n}/100` : '-'} ${esc(d.grade ?? '')} · ${Number(d.fails) || 0} errores · ${Number(d.warnings) || 0} a mejorar</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Comunicaciones</td><td>${d.marketing ? 'Sí acepta comunicaciones comerciales' : 'No acepta comunicaciones comerciales'}</td></tr>
</table>
${issues ? `<p style="margin-top:14px"><b>Principales problemas</b></p><ul>${issues}</ul>` : ''}
${button(link(d.reportUrl), 'Ver su informe')}
<p style="font-size:12px;color:#64748b">Recibirá el seguimiento a los 2-3 días y la petición de reseña unos días después, automáticamente.</p>`),
  };
}
