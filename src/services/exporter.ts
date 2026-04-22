import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { Cv, LocalData, Profile } from "../types";
import { preserveUtf8, slugifyPreservingTurkish } from "../utils/text";
import { cvToPlainText } from "./cvParser";
import { createCvPdfBytes } from "./pdfGenerator";
import { useAppStore } from "../store/useAppStore";

const downloadWebFile = (filename: string, mime: string, content: string, bom = false) => {
  const blob = new Blob([bom ? "\uFEFF" : "", preserveUtf8(content)], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const shareNativeFile = async (filename: string, content: string) => {
  const uri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, preserveUtf8(content), { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  return uri;
};

const downloadWebBytes = (filename: string, mime: string, content: Uint8Array) => {
  const buffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const shareNativeBytes = async (filename: string, content: Uint8Array) => {
  const uri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, uint8ArrayToBase64(content), { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: filename });
  return uri;
};

export async function exportText(profile: Profile, cv: Cv) {
  const language = useAppStore.getState().settings.language;
  const text = cvToPlainText(profile, cv, language);
  const filename = buildExportFilename(profile, cv, "txt");
  if (Platform.OS === "web") {
    downloadWebFile(filename, "text/plain", text, true);
    return language === "tr" ? "Metin dışa aktarımı indirildi." : "Downloaded text export.";
  }
  await shareNativeFile(filename, text);
  return language === "tr" ? "Metin dışa aktarımı hazır." : "Text export ready.";
}

export async function exportJson(data: LocalData) {
  const language = useAppStore.getState().settings.language;
  const json = JSON.stringify(data, null, 2);
  const filename = `hirvia-backup-${dateStamp()}.json`;
  if (Platform.OS === "web") {
    downloadWebFile(filename, "application/json", json);
    return language === "tr" ? "JSON yedeği indirildi." : "Downloaded JSON backup.";
  }
  await shareNativeFile(filename, json);
  return language === "tr" ? "JSON yedeği hazır." : "JSON backup ready.";
}

export async function exportPdf(profile: Profile, cv: Cv) {
  const language = useAppStore.getState().settings.language;
  const filename = buildExportFilename(profile, cv, "pdf");
  const pdfBytes = await createCvPdfBytes(profile, cv, language);
  if (Platform.OS === "web") {
    downloadWebBytes(filename, "application/pdf", pdfBytes);
    return language === "tr" ? "PDF indirildi." : "Downloaded PDF export.";
  }

  await shareNativeBytes(filename, pdfBytes);
  return language === "tr" ? "PDF dışa aktarımı hazır." : "PDF export ready.";
}

export async function copyTextExport(profile: Profile, cv: Cv) {
  const language = useAppStore.getState().settings.language;
  await Clipboard.setStringAsync(cvToPlainText(profile, cv, language));
  return language === "tr" ? "Metin dışa aktarımı kopyalandı." : "Text export copied.";
}

export function previewTextExport(profile: Profile, cv: Cv) {
  const language = useAppStore.getState().settings.language;
  return cvToPlainText(profile, cv, language);
}

function buildExportFilename(profile: Profile, cv: Cv, extension: "txt" | "pdf") {
  const name = slugifyPreservingTurkish(profile.fullName || cv.name || "cv");
  const role = slugifyPreservingTurkish(profile.title || cv.name || "role");
  return `${name}_${role}_${dateStamp()}.${extension}`;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return globalThis.btoa(binary);
}
