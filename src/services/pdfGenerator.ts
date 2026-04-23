import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { AppLanguage, Cv, CvSectionId, Profile } from "../types";
import { preserveUtf8 } from "../utils/text";
import { getTemplatePreset } from "./templates";

const notoSansRegular = require("../../assets/fonts/NotoSans-Regular.ttf");
const notoSansBold = require("../../assets/fonts/NotoSans-Bold.ttf");

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = A4.width - MARGIN * 2;
const colors = {
  ink: rgb(0.07, 0.09, 0.16),
  text: rgb(0.12, 0.16, 0.24),
  muted: rgb(0.35, 0.41, 0.5),
  line: rgb(0.82, 0.86, 0.92),
  accent: rgb(0.31, 0.27, 0.9)
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type PdfCursor = {
  doc: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  y: number;
};

const sectionCopy: Record<AppLanguage, Record<CvSectionId, string>> = {
  tr: {
    summary: "\u00d6zet",
    skills: "Yetenekler",
    experience: "Deneyim",
    education: "E\u011fitim"
  },
  en: {
    summary: "Summary",
    skills: "Skills",
    experience: "Experience",
    education: "Education"
  }
};

export async function createCvPdfBytes(profile: Profile, cv: Cv, language: AppLanguage) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedNotoSans(doc);
  const page = doc.addPage([A4.width, A4.height]);
  const cursor: PdfCursor = { doc, page, fonts, y: A4.height - MARGIN };

  drawHeader(cursor, profile, cv, language);

  const orderedSections = cv.sectionOrder.length ? cv.sectionOrder : ["summary", "skills", "experience", "education"];
  for (const section of orderedSections) {
    if (section === "summary") drawSummary(cursor, profile, cv, language);
    if (section === "skills") drawSkills(cursor, cv, language);
    if (section === "experience") drawExperience(cursor, cv, language);
    if (section === "education") drawEducation(cursor, cv, language);
  }

  doc.setTitle(preserveUtf8(`${profile.fullName || cv.name || (language === "tr" ? "Özgeçmiş" : "CV")} - Hirvia`));
  doc.setAuthor("Hirvia");
  doc.setSubject(language === "tr" ? "Özgeçmiş dışa aktarımı" : "CV export");
  doc.setProducer("Hirvia PDF Export");
  doc.setCreator("Hirvia");
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  return doc.save({ useObjectStreams: false });
}

async function embedNotoSans(doc: PDFDocument): Promise<PdfFonts> {
  const [regularBytes, boldBytes] = await Promise.all([
    loadFontBytes(notoSansRegular),
    loadFontBytes(notoSansBold)
  ]);

  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  return { regular, bold };
}

async function loadFontBytes(moduleId: number) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return base64ToUint8Array(base64);
}

function drawHeader(cursor: PdfCursor, profile: Profile, cv: Cv, language: AppLanguage) {
  const name = preserveUtf8(profile.fullName || (language === "tr" ? "Ad\u0131n\u0131z" : "Your Name"));
  const title = preserveUtf8(profile.title);
  const contact = [profile.email, profile.phone, profile.location, profile.links].map(preserveUtf8).filter(Boolean).join(" | ");
  const human = cv.mode === "human";
  const preset = getTemplatePreset(cv);

  drawText(cursor, name, {
    font: cursor.fonts.bold,
    size: human ? 28 : 25,
    color: colors.ink,
    lineHeight: human ? 34 : 31,
    marginAfter: 4
  });

  if (title) {
    drawText(cursor, title, {
      font: cursor.fonts.regular,
      size: human ? 13 : 12,
      color: colors.text,
      lineHeight: human ? 18 : 17,
      marginAfter: human ? 6 : 4
    });
  }

  if (contact) {
    drawText(cursor, contact, {
      font: cursor.fonts.regular,
      size: human ? 10.2 : 9.5,
      color: colors.muted,
      lineHeight: human ? 15 : 14,
      marginAfter: human ? preset.headerGap : preset.headerGap
    });
  } else {
    cursor.y -= 10;
  }

  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: A4.width - MARGIN, y: cursor.y },
    thickness: human ? 1.5 : preset.borderThickness,
    color: human ? colors.accent : colors.line
  });
  cursor.y -= preset.sectionGap;
}

function drawSummary(cursor: PdfCursor, profile: Profile, cv: Cv, language: AppLanguage) {
  const text = preserveUtf8(cv.summary || profile.summary);
  if (!text) return;
  const preset = getTemplatePreset(cv);
  drawSectionTitle(cursor, cv, sectionCopy[language].summary, language);
  drawText(cursor, text, { font: cursor.fonts.regular, size: preset.bodySize - 0.3, lineHeight: preset.bodyLine, color: colors.text, marginAfter: preset.spacing });
}

function drawSkills(cursor: PdfCursor, cv: Cv, language: AppLanguage) {
  if (!cv.skills.length) return;
  const preset = getTemplatePreset(cv);
  drawSectionTitle(cursor, cv, sectionCopy[language].skills, language);
  drawText(cursor, cv.skills.map(preserveUtf8).join(", "), { font: cursor.fonts.regular, size: preset.bodySize - 0.6, lineHeight: preset.bodyLine, color: colors.text, marginAfter: preset.spacing });
}

function drawExperience(cursor: PdfCursor, cv: Cv, language: AppLanguage) {
  if (!cv.experience.length) return;
  drawSectionTitle(cursor, cv, sectionCopy[language].experience, language);
  const preset = getTemplatePreset(cv);

  for (const item of cv.experience) {
    const heading = [item.role, item.company].map(preserveUtf8).filter(Boolean).join(" | ");
    if (heading) {
      drawText(cursor, heading, { font: cursor.fonts.bold, size: preset.headingSize - 1, lineHeight: preset.bodyLine, color: colors.ink, marginAfter: 1 });
    }
    if (item.period) {
      drawText(cursor, preserveUtf8(item.period), { font: cursor.fonts.regular, size: 9.2, lineHeight: 13, color: colors.muted, marginAfter: Math.max(4, preset.spacing - 2) });
    }
    for (const bullet of item.bullets) {
      drawBullet(cursor, preserveUtf8(bullet), preset.bodySize - 0.6, preset.bodyLine);
    }
    cursor.y -= Math.max(5, preset.spacing - 1);
  }
  cursor.y -= 2;
}

function drawEducation(cursor: PdfCursor, cv: Cv, language: AppLanguage) {
  if (!cv.education.length) return;
  const preset = getTemplatePreset(cv);
  drawSectionTitle(cursor, cv, sectionCopy[language].education, language);

  for (const item of cv.education) {
    const heading = [item.degree, item.school].map(preserveUtf8).filter(Boolean).join(", ");
    const period = preserveUtf8(item.period);
    drawText(cursor, [heading, period].filter(Boolean).join(" | "), {
      font: cursor.fonts.regular,
      size: preset.bodySize - 0.6,
      lineHeight: preset.bodyLine,
      color: colors.text,
      marginAfter: Math.max(5, preset.spacing - 1)
    });
  }
  cursor.y -= Math.max(4, preset.spacing - 2);
}

function drawSectionTitle(cursor: PdfCursor, cv: Cv, title: string, language: AppLanguage) {
  const preset = getTemplatePreset(cv);
  ensureSpace(cursor, 32);
  drawText(cursor, preserveUtf8(title).toLocaleUpperCase(language === "tr" ? "tr-TR" : "en-US"), {
    font: cursor.fonts.bold,
    size: 10.2,
    color: preset.headingColor === "#4F46E5" ? colors.accent : colors.ink,
    lineHeight: 13,
    marginAfter: 7
  });
}

function drawBullet(cursor: PdfCursor, text: string, size = 10.2, lineHeight = 14.5) {
  const bulletX = MARGIN;
  const textX = MARGIN + 12;
  const lines = wrapText(text, cursor.fonts.regular, size, CONTENT_WIDTH - 12);
  ensureSpace(cursor, lines.length * lineHeight + 2);
  cursor.page.drawText("-", { x: bulletX, y: cursor.y - size, size, font: cursor.fonts.regular, color: colors.text });
  for (let index = 0; index < lines.length; index += 1) {
    cursor.page.drawText(lines[index], { x: textX, y: cursor.y - size - index * lineHeight, size, font: cursor.fonts.regular, color: colors.text });
  }
  cursor.y -= lines.length * lineHeight + 2;
}

function drawText(
  cursor: PdfCursor,
  value: string,
  options: { font: PDFFont; size: number; lineHeight: number; color: ReturnType<typeof rgb>; marginAfter?: number }
) {
  const lines = wrapText(preserveUtf8(value), options.font, options.size, CONTENT_WIDTH);
  ensureSpace(cursor, lines.length * options.lineHeight + (options.marginAfter ?? 0));
  for (let index = 0; index < lines.length; index += 1) {
    cursor.page.drawText(lines[index], {
      x: MARGIN,
      y: cursor.y - options.size - index * options.lineHeight,
      size: options.size,
      font: options.font,
      color: options.color
    });
  }
  cursor.y -= lines.length * options.lineHeight + (options.marginAfter ?? 0);
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = preserveUtf8(value).split(/\r?\n/).map((line) => line.trim());
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }
      if (current) lines.push(current);
      current = word;
      while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
        const splitAt = findSplitIndex(current, font, size, maxWidth);
        lines.push(current.slice(0, splitAt));
        current = current.slice(splitAt);
      }
    }
    if (current) lines.push(current);
  }

  return lines.length ? lines : [""];
}

function findSplitIndex(value: string, font: PDFFont, size: number, maxWidth: number) {
  for (let index = value.length; index > 1; index -= 1) {
    if (font.widthOfTextAtSize(value.slice(0, index), size) <= maxWidth) return index;
  }
  return 1;
}

function ensureSpace(cursor: PdfCursor, needed: number) {
  if (cursor.y - needed >= MARGIN) return;
  cursor.page = cursor.doc.addPage([A4.width, A4.height]);
  cursor.y = A4.height - MARGIN;
}

function base64ToUint8Array(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
