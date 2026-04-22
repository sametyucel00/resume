import { useAppStore } from "../store/useAppStore";
import { toTurkishLower } from "./text";

export function normalizeNetworkError(error: unknown, fallback: string) {
  const language = useAppStore.getState().settings.language;
  const message = String((error as { message?: string })?.message ?? "");

  const normalized = toTurkishLower(message);

  if (normalized.includes("abort")) {
    return language === "tr" ? "AI yaniti cok uzun surdu. Devam edebilmeniz icin yerel bir taslak kullandik." : "The AI response took too long. We used a local draft so you can keep moving.";
  }
  if (message.includes("429")) {
    return language === "tr" ? "AI servisi su anda yogun. Simdilik yerel bir taslak kullandik." : "The AI service is busy right now. We used a local draft for now.";
  }
  if (message.includes("401")) {
    return language === "tr" ? "AI servisi su anda kullanilamiyor. Bunun yerine yerel bir taslak kullandik." : "The AI service is not available right now. We used a local draft instead.";
  }
  if (normalized.includes("network")) {
    return language === "tr" ? "AI servisine su anda ulasilamadi. Bunun yerine yerel bir taslak kullandik." : "We could not reach the AI service right now. We used a local draft instead.";
  }
  return fallback;
}
