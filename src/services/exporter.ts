import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { Cv, LocalData, Profile } from "../types";
import { preserveUtf8, slugifyPreservingTurkish } from "../utils/text";
import { cvToPlainText } from "./cvParser";
import { cvToHtml } from "./templates";

const downloadWebFile = (filename: string, mime: string, content: string) => {
  const blob = new Blob([preserveUtf8(content)], { type: `${mime};charset=utf-8` });
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

export async function exportText(profile: Profile, cv: Cv) {
  const text = cvToPlainText(profile, cv);
  const filename = buildExportFilename(profile, cv, "txt");
  if (Platform.OS === "web") {
    downloadWebFile(filename, "text/plain", text);
    return "Downloaded text export.";
  }
  await shareNativeFile(filename, text);
  return "Text export ready.";
}

export async function exportJson(data: LocalData) {
  const json = JSON.stringify(data, null, 2);
  const filename = `cv-optimizer-backup-${dateStamp()}.json`;
  if (Platform.OS === "web") {
    downloadWebFile(filename, "application/json", json);
    return "Downloaded JSON backup.";
  }
  await shareNativeFile(filename, json);
  return "JSON backup ready.";
}

export async function exportPdf(profile: Profile, cv: Cv) {
  const html = cvToHtml(profile, cv);
  const filename = buildExportFilename(profile, cv, "pdf");
  if (Platform.OS === "web") {
    const printable = window.open("", "_blank");
    if (!printable) {
      await Clipboard.setStringAsync(html);
      return "Popup blocked. Printable HTML copied.";
    }
    printable.document.write(html);
    printable.document.close();
    printable.focus();
    printable.print();
    return "PDF print dialog opened.";
  }

  const result = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", dialogTitle: filename });
  return "PDF export ready.";
}

export async function copyTextExport(profile: Profile, cv: Cv) {
  await Clipboard.setStringAsync(cvToPlainText(profile, cv));
  return "Text export copied.";
}

export function previewTextExport(profile: Profile, cv: Cv) {
  return cvToPlainText(profile, cv);
}

function buildExportFilename(profile: Profile, cv: Cv, extension: "txt" | "pdf") {
  const name = slugifyPreservingTurkish(profile.fullName || cv.name || "cv");
  const role = slugifyPreservingTurkish(profile.title || cv.name || "role");
  return `${name}_${role}_${dateStamp()}.${extension}`;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
