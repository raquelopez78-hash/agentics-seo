// Dominio público de la auditoría y web de la agencia (subdominio auditoria.agenticsprojects.com por defecto).
export const SITE_URL = (process.env.SITE_URL || 'https://auditoria.agenticsprojects.com').replace(/\/$/, '');
export const AGENCY_URL = 'https://www.agenticsprojects.com';
export const AGENCY_CONTACT_URL = `${AGENCY_URL}/#contacto`;
export const LEGAL_LINKS = [
  { label: 'Aviso legal', href: `${AGENCY_URL}/legal.html#aviso-legal` },
  { label: 'Privacidad', href: `${AGENCY_URL}/legal.html#privacidad` },
  { label: 'Cookies', href: `${AGENCY_URL}/legal.html#cookies` },
];
// Enlace para dejar reseña en Google (Perfil de Empresa → "Pedir reseñas"). Vacío = no se muestra.
export const REVIEW_URL = process.env.NEXT_PUBLIC_REVIEW_URL || '';
