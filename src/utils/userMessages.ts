export function normalizeNetworkError(error: unknown, fallback: string) {
  const message = String((error as { message?: string })?.message ?? "");

  if (message.toLowerCase().includes("abort")) {
    return "The AI response took too long. We used a local draft so you can keep moving.";
  }
  if (message.includes("429")) {
    return "The AI service is busy right now. We used a local draft for now.";
  }
  if (message.includes("401")) {
    return "The AI service is not available right now. We used a local draft instead.";
  }
  if (message.toLowerCase().includes("network")) {
    return "We could not reach the AI service right now. We used a local draft instead.";
  }
  return fallback;
}
