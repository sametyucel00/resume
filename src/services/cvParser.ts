import { Cv, Profile } from "../types";
import { splitCsv, splitLines } from "../utils/text";

export function mergeProfileIntoCv(profile: Profile, cv: Cv): Cv {
  return {
    ...cv,
    summary: cv.summary || profile.summary,
    skills: cv.skills.length > 0 ? cv.skills : profile.skills
  };
}

export function parseRawCvText(cv: Cv): Cv {
  const lines = splitLines(cv.rawText);
  const skillLine = lines.find((line) => skillHeaderPattern.test(line));
  const educationIndex = lines.findIndex((line) => educationHeaderPattern.test(line));
  const experienceIndex = lines.findIndex((line) => experienceHeaderPattern.test(line));
  const summary = cv.summary || findSummary(lines);
  const parsedExperience = inferExperience(lines, experienceIndex);
  const parsedEducation = inferEducation(lines, educationIndex);

  return {
    ...cv,
    summary: summary.slice(0, 520),
    skills: cv.skills.length ? cv.skills : skillLine ? splitCsv(skillLine.replace(/skills|yetenekler|tools/gi, "")) : [],
    experience: cv.experience.length ? cv.experience : parsedExperience,
    education: cv.education.length ? cv.education : parsedEducation
  };
}

export function estimateCvParseConfidence(cv: Cv) {
  let score = 0;
  if (cv.summary) score += 20;
  if (cv.skills.length) score += 20;
  if (cv.experience.length && cv.experience.some((item) => item.role || item.company || item.bullets.length)) score += 35;
  if (cv.education.length) score += 15;
  if (cv.rawText.length > 400) score += 10;
  return Math.min(100, score);
}

const summaryHeaderPattern = /summary|profile|about|objective|ozet|\u00f6zet|hakkimda|hakk\u0131mda/i;
const experienceHeaderPattern = /experience|deneyim|is deneyimi|i\u015f deneyimi|work history|employment|career|positions|projects|projeler/i;
const educationHeaderPattern = /education|egitim|e\u011fitim|university|universite|\u00fcniversite|degree|bachelor|master|lisans|yuksek lisans|y\u00fcksek lisans/i;
const skillHeaderPattern = /skills|yetenek|yetkinlik|teknoloji|tools|competencies|uzmanlik|uzmanl\u0131k|languages|diller/i;

function findSummary(lines: string[]) {
  const summaryIndex = lines.findIndex((line) => summaryHeaderPattern.test(line));
  if (summaryIndex >= 0) return lines.slice(summaryIndex + 1, summaryIndex + 4).join(" ");
  return lines.filter((line) => !isSectionHeader(line) && !isBullet(line)).slice(0, 3).join(" ");
}

function inferExperience(lines: string[], experienceIndex: number) {
  const section = sliceSection(lines, experienceIndex, /education|egitim|e\u011fitim|skills|yetenek|certifications|sertifika|licenses|lisanslar/i);
  const bullets = section.filter(isBullet).map(cleanBullet).slice(0, 6);
  const header = section.find((line) => !isBullet(line) && !isSectionHeader(line)) ?? "";
  const period = header.match(/\b(19|20)\d{2}\b.*?(\b(19|20)\d{2}\b|present|current|devam)/i)?.[0] ?? "";
  const [role = "", company = ""] = header
    .replace(period, "")
    .split(/\s+[-|@]\s+|,\s+|\sat\s|\s-\s/)
    .map((part) => part.trim())
    .filter(Boolean);

  return [
    {
      id: "exp_imported",
      company,
      role,
      period,
      bullets
    }
  ];
}

function inferEducation(lines: string[], educationIndex: number) {
  const section = sliceSection(lines, educationIndex, /experience|deneyim|skills|yetenek|projects|projeler|certifications|sertifika/i);
  const line = section.find((item) => !isSectionHeader(item) && !isBullet(item)) ?? "";
  if (!line) return [];
  const period = line.match(/\b(19|20)\d{2}\b.*?(\b(19|20)\d{2}\b|present|current|devam)?/i)?.[0] ?? "";
  const clean = line.replace(period, "").trim();
  const [degree = clean, school = ""] = clean.split(/\s+[-|@]\s+|,\s+|\sat\s/).map((part) => part.trim());
  return [{ id: "edu_imported", school, degree, period }];
}

function sliceSection(lines: string[], index: number, stopPattern: RegExp) {
  const start = index >= 0 ? index + 1 : 0;
  const result: string[] = [];
  for (const line of lines.slice(start)) {
    if (result.length > 0 && stopPattern.test(line)) break;
    result.push(line);
  }
  return result.length ? result : lines;
}

function isBullet(line: string) {
  return /^[-*]\s+/.test(line) || line.startsWith("\u2022");
}

function cleanBullet(line: string) {
  return line.replace(/^[-*\s]+/, "").replace(/^\u2022\s*/, "").trim();
}

function isSectionHeader(line: string) {
  return new RegExp(`^(${[
    "summary",
    "profile",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "deneyim",
    "is deneyimi",
    "i\u015f deneyimi",
    "yetenekler",
    "yetkinlikler",
    "egitim",
    "e\u011fitim",
    "projeler",
    "sertifikalar"
  ].join("|")})$`, "i").test(line.trim());
}

export function cvToPlainText(profile: Profile, cv: Cv) {
  const contact = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).join(" | ");
  const experience = cv.experience
    .map((item) =>
      [
        `${item.role}${item.company ? `, ${item.company}` : ""}${item.period ? ` (${item.period})` : ""}`,
        ...item.bullets.map((bullet) => `- ${bullet}`)
      ].join("\n")
    )
    .join("\n\n");
  const education = cv.education.map((item) => `${item.degree}, ${item.school} ${item.period}`).join("\n");

  return [
    profile.fullName,
    profile.title,
    contact,
    "",
    "SUMMARY",
    cv.summary || profile.summary,
    "",
    "SKILLS",
    cv.skills.join(", "),
    "",
    "EXPERIENCE",
    experience,
    "",
    "EDUCATION",
    education
  ]
    .filter((part) => part !== undefined)
    .join("\n");
}
