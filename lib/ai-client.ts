const env = process.env as Record<string, string | undefined>;

// Cliente de IA común: Claude como motor principal y GPT (OpenAI) como respaldo automático.
// Ambos devuelven datos estructurados según un JSON Schema (herramienta forzada en Claude,
// json_schema strict en OpenAI). Si ninguno está configurado o fallan los dos, lanza AiUnavailableError.

export type AiEngine = 'claude' | 'openai' | 'basic';

type AiEnv = { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string; ANTHROPIC_BASE_URL?: string; OPENAI_API_KEY?: string; OPENAI_MODEL?: string; OPENAI_BASE_URL?: string };

function aiConfig() {
  const values = env as unknown as AiEnv;
  const read = (key: keyof AiEnv) => values[key] ?? process.env[key] ?? '';
  return {
    claude: { apiKey: read('ANTHROPIC_API_KEY'), model: read('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', baseUrl: read('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com' },
    openai: { apiKey: read('OPENAI_API_KEY'), model: read('OPENAI_MODEL') || 'gpt-4o-mini', baseUrl: read('OPENAI_BASE_URL') || 'https://api.openai.com' },
  };
}

export function aiStatus() {
  const config = aiConfig();
  const providers = [
    config.claude.apiKey && { engine: 'claude' as const, model: config.claude.model },
    config.openai.apiKey && { engine: 'openai' as const, model: config.openai.model },
  ].filter(Boolean) as { engine: 'claude' | 'openai'; model: string }[];
  return {
    engine: (providers[0]?.engine ?? 'basic') as AiEngine,
    model: providers[0]?.model ?? null,
    fallback: providers[1] ?? null,
  };
}

export class AiUnavailableError extends Error {
  readonly status = 503;
  constructor(readonly failures: string[]) {
    super(failures.length ? `La IA no respondió (${failures.join(' · ')}).` : 'IA no configurada: añade ANTHROPIC_API_KEY u OPENAI_API_KEY en el hosting.');
  }
}

export type StructuredRequest = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  name: string;
  maxTokens?: number;
  timeoutMs?: number;
};

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !payload) {
      const error = payload?.error as { message?: string } | undefined;
      throw new Error(error?.message || `HTTP ${response.status}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('tiempo de espera agotado');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callClaude(request: StructuredRequest, config: ReturnType<typeof aiConfig>['claude']) {
  const payload = await postJson(
    `${config.baseUrl}/v1/messages`,
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model: config.model,
      max_tokens: request.maxTokens ?? 2000,
      system: request.system,
      tools: [{ name: request.name, description: 'Registra el resultado estructurado.', input_schema: request.schema }],
      tool_choice: { type: 'tool', name: request.name },
      messages: [{ role: 'user', content: request.user }],
    },
    request.timeoutMs ?? 30_000,
  );
  const content = payload.content as { type: string; input?: unknown }[] | undefined;
  const block = content?.find((item) => item.type === 'tool_use');
  if (!block?.input) throw new Error('respuesta sin datos estructurados');
  return block.input;
}

async function callOpenAI(request: StructuredRequest, config: ReturnType<typeof aiConfig>['openai']) {
  const payload = await postJson(
    `${config.baseUrl}/v1/chat/completions`,
    { authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      max_completion_tokens: request.maxTokens ?? 2000,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: request.name, strict: true, schema: request.schema } },
    },
    request.timeoutMs ?? 30_000,
  );
  const choices = payload.choices as { message?: { content?: string | null; refusal?: string | null } }[] | undefined;
  const message = choices?.[0]?.message;
  if (message?.refusal) throw new Error('el modelo rechazó la petición');
  if (!message?.content) throw new Error('respuesta vacía');
  return JSON.parse(message.content) as unknown;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : 'error').slice(0, 120);

/** Ejecuta la petición con Claude y, si falla, con GPT. Lanza AiUnavailableError si no hay ninguna disponible. */
export async function runStructured(request: StructuredRequest): Promise<{ data: unknown; engine: 'claude' | 'openai'; model: string; warning?: string }> {
  const { claude, openai } = aiConfig();
  const failures: string[] = [];
  if (claude.apiKey) {
    try {
      return { data: await callClaude(request, claude), engine: 'claude', model: claude.model };
    } catch (error) {
      failures.push(`Claude: ${describe(error)}`);
    }
  }
  if (openai.apiKey) {
    try {
      const data = await callOpenAI(request, openai);
      return {
        data,
        engine: 'openai',
        model: openai.model,
        warning: failures.length ? `Claude no respondió (${failures[0].slice(8)}). Se usó GPT como respaldo.` : undefined,
      };
    } catch (error) {
      failures.push(`GPT: ${describe(error)}`);
    }
  }
  throw new AiUnavailableError(failures);
}

/** Convierte un JSON Schema con todas las propiedades obligatorias y sin propiedades extra (requisito de OpenAI strict). */
export function strictObject(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
