import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { preserveUtf8 } from "../utils/text";
import { useAppStore } from "../store/useAppStore";

type ImportResult = {
  name: string;
  text: string;
};

export async function pickCvDocument(apiBaseUrl: string): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ],
    copyToCacheDirectory: true
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  if (Platform.OS === "web") {
    const file = asset.file;
    if (!file) return { name: asset.name, text: "" };
    if (file.type === "text/plain") return { name: asset.name, text: preserveUtf8(await file.text()) };
    return uploadForParsing(apiBaseUrl, file, asset.name);
  }

  if (asset.mimeType === "text/plain") {
    const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    return { name: asset.name, text: preserveUtf8(text) };
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return uploadForParsing(apiBaseUrl, base64ToBlob(base64, asset.mimeType || "application/octet-stream"), asset.name);
}

async function uploadForParsing(apiBaseUrl: string, file: Blob, name: string): Promise<ImportResult> {
  const language = useAppStore.getState().settings.language;
  const form = new FormData();
  form.append("file", file, name);
  const response = await fetch(`${apiBaseUrl}/api/import`, { method: "POST", body: form });
  if (!response.ok) {
    let message = language === "tr" ? "Belge ayrıştırılamadı." : "Could not parse document";
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error || message;
    } catch {
      // Keep the safe default if the server response is not JSON.
    }
    throw new Error(message);
  }
  const data = (await response.json()) as { text: string };
  return { name, text: preserveUtf8(data.text || "") };
}

function base64ToBlob(base64: string, mimeType: string) {
  const chars = globalThis.atob(base64);
  const bytes = new Uint8Array(chars.length);
  for (let index = 0; index < chars.length; index += 1) bytes[index] = chars.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}
