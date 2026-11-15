import postgres from 'postgres';

// Cliente Postgres compartido (Supabase vía pooler en modo transacción).
// prepare:false es obligatorio con el pooler en modo transacción.
const globalForPg = globalThis as unknown as { __agenticsSeoPg?: postgres.Sql };

export function pg(): postgres.Sql {
  if (globalForPg.__agenticsSeoPg) return globalForPg.__agenticsSeoPg;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL: configura la conexión a Supabase Postgres.');
  const sql = postgres(url, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
    // bigint (int8) como number: los valores son epoch en ms, muy por debajo de 2^53.
    types: { bigint: { to: 20, from: [20], serialize: (value: number) => String(value), parse: (value: string) => Number(value) } },
    connection: { application_name: 'agentics-seo' },
  });
  globalForPg.__agenticsSeoPg = sql;
  return sql;
}
