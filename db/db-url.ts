// Normaliza DATABASE_URL tolerando errores habituales al pegarla (módulo puro, probado con node --test):
// espacios, comillas, prefijo "DATABASE_URL=", corchetes y contraseñas con símbolos sin codificar (@ # / ? % : …).
export type DbUrlResult = { url: string | null; issues: string[] };

export function normalizeDbUrl(raw: string | undefined): DbUrlResult {
  const issues: string[] = [];
  if (!raw) return { url: null, issues: ['vacía'] };
  let v = raw.trim();
  if (v !== raw) issues.push('espacios al inicio o final');
  if (/^DATABASE_URL\s*=/i.test(v)) { v = v.replace(/^DATABASE_URL\s*=\s*/i, ''); issues.push('incluye "DATABASE_URL="'); }
  if (/^["'].*["']$/.test(v)) { v = v.slice(1, -1).trim(); issues.push('entre comillas'); }
  if (/\[YOUR-PASSWORD\]/i.test(v)) return { url: null, issues: [...issues, 'contiene [YOUR-PASSWORD] sin sustituir'] };
  if (!/^postgres(ql)?:\/\//i.test(v)) return { url: null, issues: [...issues, 'no empieza por postgresql://'] };
  // usuario hasta el primer ":", contraseña hasta la ÚLTIMA "@", luego host[:puerto] y /base de datos.
  const m = v.match(/^(postgres(?:ql)?:\/\/)([^:/@]+):(.*)@([A-Za-z0-9.-]+(?::\d+)?)(\/[^\s]*)?$/i);
  if (!m) return { url: null, issues: [...issues, 'formato irreconocible (esperado postgresql://usuario:contraseña@host:puerto/base)'] };
  let password = m[3];
  if (/^\[.*\]$/.test(password)) { password = password.slice(1, -1); issues.push('contraseña entre corchetes'); }
  let decoded = password;
  try { decoded = decodeURIComponent(password); } catch { /* contiene "%" suelto: se usa tal cual */ }
  const encoded = encodeURIComponent(decoded);
  if (encoded !== password) issues.push('contraseña con símbolos (codificada automáticamente)');
  return { url: `${m[1]}${m[2]}:${encoded}@${m[4]}${m[5] ?? '/postgres'}`, issues };
}
