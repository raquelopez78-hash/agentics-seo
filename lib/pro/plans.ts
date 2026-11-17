// Precios del Plan Pro (en euros, IVA según configuración de Stripe). Ajustables por variables de entorno.
export const PRO_PRICES = {
  monthly: Math.max(1, Number(process.env.PRO_PRICE_MONTHLY_EUR || 39)),
  yearly: Math.max(1, Number(process.env.PRO_PRICE_YEARLY_EUR || 390)),
};
export type ProPlan = keyof typeof PRO_PRICES;
export const isProPlan = (v: unknown): v is ProPlan => v === 'monthly' || v === 'yearly';
export const PRO_FEATURES = ['Auditorías ilimitadas con el informe completo', 'Informe PDF con tu logo y tu marca', 'Historial de todas tus auditorías', 'Sin formularios: resultado completo al instante'];
