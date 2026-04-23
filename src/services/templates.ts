import { AppLanguage, Cv, Profile, SpacingId, TemplateId } from "../types";
import { preserveUtf8 } from "../utils/text";
import { cvToPlainText } from "./cvParser";

export const templates: Record<TemplateId, { label: string; mode: "ats" | "human"; serif: boolean }> = {
  "ats-compact": { label: "ATS Compact", mode: "ats", serif: false },
  "ats-balanced": { label: "ATS Balanced", mode: "ats", serif: false },
  "ats-spacious": { label: "ATS Spacious", mode: "ats", serif: false },
  "human-focus": { label: "Human Focus", mode: "human", serif: false }
};

export const spacingScale: Record<SpacingId, number> = {
  compact: 6,
  balanced: 10,
  spacious: 14
};

export type TemplatePreset = {
  spacing: number;
  headerGap: number;
  sectionGap: number;
  bodySize: number;
  bodyLine: number;
  headingSize: number;
  headingColor: string;
  borderThickness: number;
  skillChip: boolean;
};

export function getTemplatePreset(cv: Cv): TemplatePreset {
  const template = templates[cv.templateId];
  const spacing = spacingScale[cv.spacingId] ?? spacingScale.balanced;
  const human = template.mode === "human";

  if (human) {
    return {
      spacing,
      headerGap: spacing + 8,
      sectionGap: spacing + 10,
      bodySize: 15,
      bodyLine: spacing + 11,
      headingSize: 15,
      headingColor: "#4F46E5",
      borderThickness: 2,
      skillChip: true
    };
  }

  if (cv.templateId === "ats-compact") {
    return {
      spacing,
      headerGap: Math.max(12, spacing + 2),
      sectionGap: Math.max(14, spacing + 6),
      bodySize: 13.2,
      bodyLine: spacing + 7,
      headingSize: 12.5,
      headingColor: "#0F172A",
      borderThickness: 1,
      skillChip: false
    };
  }

  if (cv.templateId === "ats-spacious") {
    return {
      spacing,
      headerGap: spacing + 6,
      sectionGap: spacing + 12,
      bodySize: 14.2,
      bodyLine: spacing + 9,
      headingSize: 13.2,
      headingColor: "#0F172A",
      borderThickness: 1,
      skillChip: false
    };
  }

  return {
    spacing,
    headerGap: spacing + 4,
    sectionGap: spacing + 8,
    bodySize: 13.8,
    bodyLine: spacing + 8,
    headingSize: 13,
    headingColor: "#0F172A",
    borderThickness: 1,
    skillChip: false
  };
}

const escapeHtml = (value: string) =>
  preserveUtf8(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const sectionCopy = {
  tr: {
    summary: "\u00d6ZET",
    skills: "YETENEKLER",
    education: "E\u011e\u0130T\u0130M",
    experience: "DENEY\u0130M",
    yourName: "Ad\u0131n\u0131z"
  },
  en: {
    summary: "SUMMARY",
    skills: "SKILLS",
    education: "EDUCATION",
    experience: "EXPERIENCE",
    yourName: "Your Name"
  }
} as const;

export function cvToHtml(profile: Profile, cv: Cv, language: AppLanguage = "en") {
  const template = templates[cv.templateId];
  const preset = getTemplatePreset(cv);
  const text = cvToPlainText(profile, cv, language);
  const copy = sectionCopy[language] ?? sectionCopy.en;
  const font = template.serif
    ? "'Noto Serif', Georgia, 'Times New Roman', serif"
    : "Inter, Roboto, 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  const human = template.mode === "human";
  const contact = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).map(escapeHtml).join(" | ");
  const sections = cv.sectionOrder.map((section) => {
    if (section === "summary") return `<h2>${copy.summary}</h2><p>${escapeHtml(cv.summary || profile.summary)}</p>`;
    if (section === "skills") return `<h2>${copy.skills}</h2><p class="skills">${cv.skills.map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`).join(" ")}</p>`;
    if (section === "education") return `<h2>${copy.education}</h2>${cv.education.map((item) => `<p><strong>${escapeHtml(item.degree)}</strong>, ${escapeHtml(item.school)} ${escapeHtml(item.period)}</p>`).join("")}`;
    return `<h2>${copy.experience}</h2>${cv.experience
      .map(
        (item) => `
      <section>
        ${[item.role, item.company].filter(Boolean).length ? `<h3>${[item.role, item.company].filter(Boolean).map(escapeHtml).join(" | ")}</h3>` : ""}
        <p class="muted">${escapeHtml(item.period)}</p>
        <ul>${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
      </section>`
      )
      .join("")}`;
  }).join("");

  if (!cv.summary && !cv.skills.length && !cv.experience.length) {
    return `<!doctype html><html lang="${language === "tr" ? "tr-TR" : "en"}"><head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
  }

  return `
  <!doctype html>
  <html lang="${language === "tr" ? "tr-TR" : "en"}">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <style>
        @page { margin: 24mm 20mm; }
        html, body { text-rendering: geometricPrecision; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { color: #111827; font-family: ${font}; line-height: 1.42; unicode-bidi: plaintext; }
        header { border-bottom: ${preset.borderThickness}px solid ${human ? "#6366F1" : "#111827"}; padding-bottom: ${preset.headerGap}px; margin-bottom: ${preset.sectionGap}px; }
        h1 { font-size: ${human ? 30 : 24}px; margin: 0 0 4px; letter-spacing: 0; }
        h2 { font-size: ${human ? 11.5 : preset.headingSize}px; margin: ${preset.sectionGap}px 0 ${Math.max(8, preset.spacing - 1)}px; letter-spacing: 0; color: ${preset.headingColor}; }
        h3 { font-size: ${preset.headingSize}px; margin: ${preset.spacing}px 0 2px; }
        p { margin: 0 0 ${preset.spacing}px; font-size: ${preset.bodySize}px; line-height: ${preset.bodyLine}px; }
        ul { margin: 6px 0 0 18px; padding: 0; }
        li { margin-bottom: ${Math.max(5, preset.spacing - 2)}px; font-size: ${preset.bodySize}px; line-height: ${preset.bodyLine}px; }
        .muted { color: #475569; font-size: ${human ? 12.5 : 12}px; line-height: ${human ? 20 : 18}px; }
        .skills { display: ${preset.skillChip ? "flex" : "block"}; gap: ${Math.max(6, preset.spacing - 2)}px; flex-wrap: wrap; }
        .skill { ${preset.skillChip ? `border: 1px solid #CBD5E1; padding: ${Math.max(5, preset.spacing - 1)}px ${preset.spacing}px; border-radius: 999px; font-size: 13.5px;` : ""} }
      </style>
    </head>
    <body>
      <header>
        <h1>${escapeHtml(profile.fullName || copy.yourName)}</h1>
        <p>${escapeHtml(profile.title)}</p>
        <p class="muted">${contact}</p>
      </header>
      ${sections}
    </body>
  </html>`;
}
