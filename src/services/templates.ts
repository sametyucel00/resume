import { Cv, Profile, TemplateId } from "../types";
import { cvToPlainText } from "./cvParser";

export const templates: Record<TemplateId, { label: string; mode: "ats" | "human"; spacing: number; serif: boolean }> = {
  "ats-compact": { label: "ATS Compact", mode: "ats", spacing: 6, serif: false },
  "ats-balanced": { label: "ATS Balanced", mode: "ats", spacing: 10, serif: false },
  "ats-spacious": { label: "ATS Spacious", mode: "ats", spacing: 14, serif: false },
  "human-focus": { label: "Human Focus", mode: "human", spacing: 12, serif: false },
  "human-elegant": { label: "Human Elegant", mode: "human", spacing: 12, serif: true }
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function cvToHtml(profile: Profile, cv: Cv) {
  const template = templates[cv.templateId];
  const text = cvToPlainText(profile, cv);
  const font = template.serif ? "Georgia, 'Times New Roman', serif" : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  const human = template.mode === "human";
  const contact = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).map(escapeHtml).join(" | ");
  const sections = cv.sectionOrder.map((section) => {
    if (section === "summary") return `<h2>Summary</h2><p>${escapeHtml(cv.summary || profile.summary)}</p>`;
    if (section === "skills") return `<h2>Skills</h2><p class="skills">${cv.skills.map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`).join(" ")}</p>`;
    if (section === "education") return `<h2>Education</h2>${cv.education.map((item) => `<p><strong>${escapeHtml(item.degree)}</strong>, ${escapeHtml(item.school)} ${escapeHtml(item.period)}</p>`).join("")}`;
    return `<h2>Experience</h2>${cv.experience
      .map(
        (item) => `
      <section>
        <h3>${escapeHtml(item.role || "Experience")}${item.company ? ` | ${escapeHtml(item.company)}` : ""}</h3>
        <p class="muted">${escapeHtml(item.period)}</p>
        <ul>${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
      </section>`
      )
      .join("")}`;
  }).join("");

  if (!cv.summary && !cv.skills.length && !cv.experience.length) {
    return `<html><head><meta charset="UTF-8"></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
  }

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        @page { margin: 24mm 20mm; }
        body { color: #111827; font-family: ${font}; line-height: 1.42; }
        header { border-bottom: ${human ? "2px solid #6366F1" : "1px solid #111827"}; padding-bottom: 12px; margin-bottom: 18px; }
        h1 { font-size: ${human ? 30 : 24}px; margin: 0 0 4px; letter-spacing: 0; }
        h2 { font-size: 13px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0; color: ${human ? "#4F46E5" : "#111827"}; }
        h3 { font-size: 14px; margin: ${template.spacing}px 0 2px; }
        p { margin: 0 0 ${template.spacing}px; }
        ul { margin: 6px 0 0 18px; padding: 0; }
        li { margin-bottom: 5px; }
        .muted { color: #475569; font-size: 12px; }
        .skills { display: ${human ? "flex" : "block"}; gap: 6px; flex-wrap: wrap; }
        .skill { ${human ? "border: 1px solid #CBD5E1; padding: 4px 8px; border-radius: 999px;" : ""} }
      </style>
    </head>
    <body>
      <header>
        <h1>${escapeHtml(profile.fullName || "Your Name")}</h1>
        <p>${escapeHtml(profile.title)}</p>
        <p class="muted">${contact}</p>
      </header>
      ${sections}
    </body>
  </html>`;
}
