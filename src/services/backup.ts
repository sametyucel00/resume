import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { LocalData } from "../types";
import { preserveUtf8 } from "../utils/text";

export async function pickJsonBackup(): Promise<Partial<LocalData> | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/json", "text/plain"],
    copyToCacheDirectory: true
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const text = Platform.OS === "web"
    ? await asset.file?.text()
    : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });

  if (!text) throw new Error("Backup file is empty");
  const parsed = JSON.parse(preserveUtf8(text)) as Partial<LocalData>;
  if (!isBackupShape(parsed)) throw new Error("Backup file is not a CV Optimizer backup");
  return parsed;
}

function isBackupShape(value: Partial<LocalData>) {
  if (!value || typeof value !== "object") return false;
  if (value.profile && typeof value.profile !== "object") return false;
  if (value.settings && typeof value.settings !== "object") return false;
  if (value.cvs && (!Array.isArray(value.cvs) || value.cvs.some((cv) => !cv || typeof cv !== "object" || typeof cv.id !== "string"))) return false;
  if (value.history && (!Array.isArray(value.history) || value.history.some((item) => !item || typeof item !== "object" || typeof item.title !== "string"))) return false;
  return Boolean(value.profile || value.cvs || value.history || value.settings);
}
