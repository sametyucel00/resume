export function parseLooseJson<T>(value: string, fallback: T): T {
  const trimmed = value.trim();
  const unfenced = stripMarkdownFence(trimmed);
  const candidates = [
    trimmed,
    unfenced,
    extractBetween(trimmed, "{", "}"),
    extractBetween(unfenced, "{", "}"),
    stripMarkdownFence(extractBetween(trimmed, "{", "}"))
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep trying smaller, common AI response shapes.
    }
  }

  return fallback;
}

function stripMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBetween(value: string, startChar: string, endChar: string) {
  const start = value.indexOf(startChar);
  const end = value.lastIndexOf(endChar);
  if (start === -1 || end === -1 || end <= start) return "";
  return value.slice(start, end + 1);
}
