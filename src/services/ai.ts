import { AiProvider, AiTask } from "../types";
import { preserveUtf8 } from "../utils/text";
import { CLIENT_PROMPT_VERSION, fallbackResult, normalizeAIOutput, NormalizedAI } from "./aiContracts";
import { normalizeNetworkError } from "../utils/userMessages";

type AiRequest = {
  task: AiTask;
  input: Record<string, unknown>;
  provider?: AiProvider;
  apiBaseUrl: string;
};

export type AiResult = NormalizedAI & {
  provider: AiProvider;
  model?: string;
  promptVersion: string;
  cacheKey: string;
};

const memoryCache = new Map<string, AiResult>();
const MAX_CACHE_ITEMS = 40;

export async function generateAIResult({ task, input, provider = "groq", apiBaseUrl }: AiRequest): Promise<AiResult> {
  const cacheKey = createCacheKey({ task, input, provider, promptVersion: CLIENT_PROMPT_VERSION });
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${apiBaseUrl}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ task, input, provider, promptVersion: CLIENT_PROMPT_VERSION }),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || `AI request failed: ${response.status}`);
    }
    const data = (await response.json()) as { output?: string; provider?: AiProvider; model?: string; promptVersion?: string };
    const raw = preserveUtf8((data.output ?? "").trim());
    const normalized = normalizeAIOutput(task, raw);
    const result: AiResult = {
      ...normalized,
      provider: data.provider ?? provider,
      model: data.model,
      promptVersion: data.promptVersion ?? CLIENT_PROMPT_VERSION,
      cacheKey
    };
    cacheSet(cacheKey, result);
    return result;
  } catch (error) {
    const fallback = fallbackResult(task);
    const result: AiResult = {
      ...fallback,
      message: normalizeNetworkError(error, fallback.message),
      provider,
      promptVersion: CLIENT_PROMPT_VERSION,
      cacheKey
    };
    cacheSet(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateAIResponse(request: AiRequest) {
  const result = await generateAIResult(request);
  return result.output;
}

function cacheSet(key: string, value: AiResult) {
  if (memoryCache.size >= MAX_CACHE_ITEMS) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, value);
}

function createCacheKey(value: unknown) {
  return `ai_${hashString(stableStringify(value))}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
