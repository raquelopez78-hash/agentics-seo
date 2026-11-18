'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AGENCY_CONTACT_URL, AGENCY_URL, LEGAL_LINKS } from '@/lib/site';
import a from '../audit.module.css';
import s from './pro.module.css';

type Me = {
  pro: boolean; email: string; status: string; plan: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; canManageBilling: boolean;
  brand: { name: string | null; logo: string | null };
  history?: { id: string; host: string; finalUrl: string; score: number; createdAt: string }[];
};
type Props = { prices: { monthly: number; yearly: number }; features: string[]; payments: boolean; login: boolean };

const STATUS: Record<string, string> = { active: 'Activa', trialing: 'En prueba', past_due: 'Pago pendiente', canceled: 'Cancelada', manual: 'Acceso manual', inactive: 'Inactiva' };
const tone = (n: number) => (n >= 75 ? '#2fd28b' : n >= 55 ? '#f5b740' : '#ff4d6d');

/** Redimensiona el logo en el navegador (máx. 480×160) y lo devuelve como data URL PNG. */
async function resizeLogo(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 480 / img.width, 160 / img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export default function ProClient({ prices, features, payments, login }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({ name: '', logo: null });
  const saving = (k: string) => busy === k;

  useEffect(() => {
    void fetch('/api/pro/me?history=1').then((r) => (r.ok ? (r.json() as Promise<Me>) : null)).catch(() => null).then((d) => {
      setMe(d);
      if (d) setBrand({ name: d.brand.name ?? '', logo: d.brand.logo });
      setLoaded(true);
      const q = new URLSearchParams(window.location.search);
      if (q.size) window.history.replaceState(null, '', '/pro');
      if (q.get('pago') === 'ok') setMsg({ ok: true, text: '¡Pago completado! Bienvenido al Plan Pro. Para entrar otro día, pide el enlace con el email que usaste al pagar.' });
      if (q.get('acceso') === 'caducado' && !d?.pro) setMsg({ ok: false, text: 'El enlace ha caducado o ya se usó. Pide uno nuevo.' });
    });
  }, []);

  async function post(path: string, body?: unknown) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; url?: string; message?: string };
    if (!r.ok) throw new Error(d.error ?? 'Ha ocurrido un error.');
    return d;
  }

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Ha ocurrido un error.' }); }
    setBusy('');
  }

  const checkout = (plan: 'monthly' | 'yearly') => act(plan, async () => { window.location.href = (await post('/api/pro/checkout', { plan })).url ?? '/pro'; });
  const sendLink = (e: React.SyntheticEvent<HTMLFormElement>) => { e.preventDefault(); void act('login', async () => { setMsg({ ok: true, text: (await post('/api/pro/login', { email })).message ?? '' }); }); };
  const portal = () => act('portal', async () => { window.location.href = (await post('/api/pro/portal')).url ?? '/pro'; });
  const logout = () => act('logout', async () => { await post('/api/pro/logout'); setMe(null); });
  const saveBrand = () => act('brand', async () => { await post('/api/pro/brand', { name: brand.name, logo: brand.logo }); setMsg({ ok: true, text: 'Marca guardada. Tus próximos PDF saldrán con ella.' }); });
  async function pickLogo(file?: File) {
    if (!file) return;
    try { setBrand((b) => ({ ...b, logo: null })); const logo = await resizeLogo(file); setBrand((b) => ({ ...b, logo })); }
    catch { setMsg({ ok: false, text: 'No se pudo leer la imagen. Usa PNG, JPG o WebP.' }); }
  }

  const saving12 = Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100);

  return (
    <>
      <div className={a.page}>
        <header className={a.hero}>
          <div className={a.topBar}>
            <a className={a.brand} href={AGENCY_URL}><span className={a.brandMark}>◆</span>AGENTICS <span>SEO AUDIT</span></a>
            <Link className={a.proLink} href="/">Auditar una web</Link>
          </div>
          <h1>Plan <em>Pro</em> para agencias</h1>
          <p className={a.lead}>Audita todas las webs que quieras —las tuyas o las de tus clientes— y entrega informes en PDF con tu propia marca.</p>
        </header>

        {msg && <output className={`${msg.ok ? s.ok : a.error} ${s.msg}`}>{msg.text}</output>}

        {loaded && me?.pro ? (
          <section className={s.account}>
            <div className={s.card}>
              <h2>Tu cuenta Pro</h2>
              <p><b>{me.email}</b> · Suscripción: <b>{STATUS[me.status] ?? me.status}</b>{me.plan ? ` · ${me.plan === 'yearly' ? 'anual' : 'mensual'}` : ''}{me.currentPeriodEnd && me.status !== 'canceled' ? ` · ${me.cancelAtPeriodEnd ? 'cancelada, acceso hasta el' : 'renueva el'} ${new Date(me.currentPeriodEnd).toLocaleDateString('es-ES')}` : ''}</p>
              <div className={s.row}>
                <Link className={s.primary} href="/">Nueva auditoría</Link>
                {me.canManageBilling && <button type="button" onClick={portal} disabled={saving('portal')}>Facturas, tarjeta o cancelar</button>}
                <button type="button" onClick={logout} disabled={saving('logout')}>Cerrar sesión</button>
              </div>
            </div>

            <div className={s.card}>
              <h2>Tu marca en el PDF</h2>
              <p>Sustituye la marca AGENTICS por la tuya en los informes que descargues.</p>
              <div className={s.brandRow}>
                <label>Nombre de tu marca<input value={brand.name} maxLength={80} onChange={(e) => setBrand({ ...brand, name: e.target.value })} placeholder="Tu agencia" /></label>
                <label>Logo (PNG, JPG o WebP)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickLogo(e.target.files?.[0])} /></label>
              </div>
              {/* oxlint-disable-next-line next/no-img-element -- data URL del logo */}
              {brand.logo && <div className={s.preview}><img src={brand.logo} alt="Vista previa del logo" /><button type="button" onClick={() => setBrand({ ...brand, logo: null })}>Quitar logo</button></div>}
              <button type="button" className={s.primary} onClick={saveBrand} disabled={saving('brand')}>{saving('brand') ? 'Guardando…' : 'Guardar marca'}</button>
            </div>

            <div className={s.card}>
              <h2>Historial <span className={s.count}>{me.history?.length ?? 0}</span></h2>
              {me.history && me.history.length > 0 ? (
                <table className={s.table}>
                  <thead><tr><th>Web</th><th>Nota</th><th>Fecha</th><th><span className={a.sr}>Enlace</span></th></tr></thead>
                  <tbody>{me.history.map((h) => (
                    <tr key={h.id}>
                      <td title={h.finalUrl}>{h.host}</td>
                      <td style={{ color: tone(h.score) }}><b>{Math.round(h.score)}</b></td>
                      <td>{new Date(h.createdAt).toLocaleDateString('es-ES')}</td>
                      <td><a href={`/r/${h.id}`} target="_blank" rel="noopener noreferrer">Ver informe</a></td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <p>Aún no has hecho auditorías con tu cuenta Pro.</p>}
            </div>
          </section>
        ) : (
          <>
            <section className={s.plans}>
              <div className={s.plan}>
                <h2>Mensual</h2>
                <p className={s.price}><b>{prices.monthly} €</b>/mes</p>
                <p className={s.small}>Sin permanencia. Cancela cuando quieras.</p>
                <button type="button" className={s.primary} disabled={!payments || !!busy} onClick={() => void checkout('monthly')}>{saving('monthly') ? 'Abriendo pago…' : 'Empezar ahora'}</button>
              </div>
              <div className={`${s.plan} ${s.best}`}>
                <span className={s.tag}>{saving12 > 0 ? `Ahorra ${saving12} %` : 'Anual'}</span>
                <h2>Anual</h2>
                <p className={s.price}><b>{prices.yearly} €</b>/año</p>
                <p className={s.small}>Equivale a {(prices.yearly / 12).toFixed(2).replace('.', ',')} €/mes.</p>
                <button type="button" className={s.primary} disabled={!payments || !!busy} onClick={() => void checkout('yearly')}>{saving('yearly') ? 'Abriendo pago…' : 'Empezar ahora'}</button>
              </div>
              <ul className={s.features}>{features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
              {!payments && <p className={s.small}>El pago online se activará en breve. Mientras tanto, <a href={AGENCY_CONTACT_URL}>escríbenos</a> y te damos acceso.</p>}
              <p className={s.small}>Pago seguro con Stripe. Recibirás la factura por email.</p>
            </section>

            <section className={s.card}>
              <h2>¿Ya tienes el Plan Pro?</h2>
              {me && !me.pro && <p>Tu sesión ({me.email}) no tiene una suscripción activa.</p>}
              <form className={s.login} onSubmit={sendLink}>
                <label htmlFor="pro-email" className={a.sr}>Email</label>
                <input id="pro-email" type="email" required maxLength={254} placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!login} />
                <button type="submit" className={s.primary} disabled={!login || saving('login')}>{saving('login') ? 'Enviando…' : 'Recibir enlace de acceso'}</button>
              </form>
              <p className={s.small}>Te enviamos un enlace de un solo uso a tu correo. Sin contraseñas.</p>
            </section>
          </>
        )}
      </div>
      <footer className={a.siteFooter}>
        <a href={AGENCY_URL}>◆ Agentics Projects</a>
        <span>Agentes de IA, automatización y marketing digital</span>
        <nav aria-label="Legal">{LEGAL_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</nav>
      </footer>
    </>
  );
}
