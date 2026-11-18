// Precios del Plan Pro (en euros, IVA según configuración de Stripe). Ajustables por variables de entorno.
export const PRO_PRICES = {
  monthly: Math.max(1, Number(process.env.PRO_PRICE_MONTHLY_EUR || 39)),
  yearly: Math.max(1, Number(process.env.PRO_PRICE_YEARLY_EUR || 390)),
};
export type ProPlan = keyof typeof PRO_PRICES;
export const isProPlan = (v: unknown): v is ProPlan => v === 'monthly' || v === 'yearly';
export const PRO_FEATURES = ['Auditorías ilimitadas con el informe completo', 'Informe PDF con tu logo, tu marca y tus datos de contacto', 'Historial de todas tus auditorías', 'Sin formularios: resultado completo al instante'];

/** Bloques del informe (resumen comercial de las comprobaciones de lib/seo-audit/checks.ts y ai.ts). */
export const REPORT_BLOCKS = [
  { title: 'SEO técnico', text: 'Rastreo e indexación, robots.txt, sitemap, canonical, redirecciones, HTTPS y estructura de URLs.' },
  { title: 'On-page y contenido', text: 'Title, meta description, encabezados, imágenes, enlaces y, con IA: intención de búsqueda, profundidad y redacción.' },
  { title: 'Rendimiento real', text: 'Core Web Vitals (LCP, CLS, INP) con datos de Google PageSpeed, para móvil.' },
  { title: 'Confianza y datos estructurados', text: 'Señales E-E-A-T, autoría, cabeceras de seguridad, Schema.org y accesibilidad básica.' },
  { title: 'Visibilidad en buscadores con IA (GEO)', text: 'Acceso de ChatGPT, Claude, Perplexity o Gemini, llms.txt y, con IA, citabilidad y claridad del mensaje.' },
];

export const PRO_FAQ = [
  { q: '¿Qué puedo personalizar del informe?', a: 'Tu logo y el nombre de tu marca en la cabecera, tus datos de contacto en el pie, y el archivo PDF se descarga con el nombre de tu marca. Los colores del informe no se pueden cambiar por ahora.' },
  { q: '¿Cómo subo mi logo?', a: 'Al entrar en tu cuenta Pro, en "Tu marca en el PDF": PNG, JPG o WebP. Se ajusta solo al tamaño de la cabecera.' },
  { q: '¿Puedo cancelar cuando quiera?', a: 'Sí, sin permanencia. Cancelas desde tu cuenta en dos clics y mantienes el acceso hasta el final del periodo pagado.' },
  { q: '¿Dónde descargo mis facturas?', a: 'Desde tu cuenta Pro, en "Facturas, tarjeta o cancelar". Al pagar puedes indicar que compras como empresa e introducir tu NIF.' },
  { q: '¿Cuántas webs puedo auditar?', a: 'Sin límite mensual: las tuyas y las de tus clientes. Cada auditoría queda guardada en tu historial con su enlace.' },
  { q: '¿Necesito instalar algo?', a: 'No. Solo introduces la URL y en menos de un minuto tienes el informe en pantalla y en PDF.' },
];
