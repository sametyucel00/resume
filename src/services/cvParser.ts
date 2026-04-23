import { AppLanguage, Cv, Profile } from "../types";
import { includesTurkishInsensitive, splitCsv, splitLines, toTurkishLower } from "../utils/text";

export function mergeProfileIntoCv(profile: Profile, cv: Cv): Cv {
  return {
    ...cv,
    summary: cv.summary || profile.summary,
    skills: cv.skills.length > 0 ? cv.skills : profile.skills
  };
}

export function parseRawCvText(cv: Cv): Cv {
  const lines = splitLines(cv.rawText);
  const educationIndex = lines.findIndex((line) => matchesAnyHeader(line, educationHeaders));
  const experienceIndex = lines.findIndex((line) => matchesAnyHeader(line, experienceHeaders));
  const summary = cv.summary || findSummary(lines);
  const parsedExperience = inferExperience(lines, experienceIndex);
  const parsedEducation = inferEducation(lines, educationIndex);
  const parsedSkills = inferSkills(lines);

  return {
    ...cv,
    summary: summary.slice(0, 520),
    skills: cv.skills.length ? cv.skills : parsedSkills,
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

const summaryHeaders = ["summary", "profile", "about", "objective", "ozet", "\u00f6zet", "hakkimda", "hakk\u0131mda"];
const experienceHeaders = ["experience", "deneyim", "is deneyimi", "i\u015f deneyimi", "work history", "employment", "career", "positions", "projects", "projeler"];
const educationHeaders = ["education", "egitim", "e\u011fitim", "university", "universite", "\u00fcniversite", "degree", "bachelor", "master", "lisans", "yuksek lisans", "y\u00fcksek lisans"];
const skillHeaders = ["skills", "yetenek", "yetkinlik", "teknoloji", "tools", "competencies", "uzmanlik", "uzmanl\u0131k", "languages", "diller"];
const sectionHeaders = [...summaryHeaders, ...experienceHeaders, ...educationHeaders, ...skillHeaders, "certifications", "sertifika", "sertifikalar", "licenses", "lisanslar"];

function findSummary(lines: string[]) {
  const summaryIndex = lines.findIndex((line) => matchesAnyHeader(line, summaryHeaders));
  if (summaryIndex >= 0) {
    return lines
      .slice(summaryIndex + 1, summaryIndex + 5)
      .filter((line) => !looksLikeContactLine(line))
      .join(" ");
  }
  return lines
    .filter((line) => !isSectionHeader(line) && !isBullet(line) && !looksLikeContactLine(line))
    .slice(0, 3)
    .join(" ");
}

function inferExperience(lines: string[], experienceIndex: number) {
  const section = sliceSection(lines, experienceIndex, ["education", "egitim", "e\u011fitim", "skills", "yetenek", "certifications", "sertifika", "licenses", "lisanslar"]);
  if (!section.length) return [];
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
  const section = sliceSection(lines, educationIndex, ["experience", "deneyim", "skills", "yetenek", "projects", "projeler", "certifications", "sertifika"]);
  if (!section.length) return [];
  const line = section.find((item) => !isSectionHeader(item) && !isBullet(item)) ?? "";
  if (!line) return [];
  const period = line.match(/\b(19|20)\d{2}\b.*?(\b(19|20)\d{2}\b|present|current|devam)?/i)?.[0] ?? "";
  const clean = line.replace(period, "").trim();
  const [degree = clean, school = ""] = clean.split(/\s+[-|@]\s+|,\s+|\sat\s/).map((part) => part.trim());
  return [{ id: "edu_imported", school, degree, period }];
}

function sliceSection(lines: string[], index: number, stopHeaders: string[]) {
  if (index < 0) return [];
  const start = index >= 0 ? index + 1 : 0;
  const result: string[] = [];
  for (const line of lines.slice(start)) {
    if (result.length > 0 && matchesAnyHeader(line, stopHeaders)) break;
    result.push(line);
  }
  return result;
}

function isBullet(line: string) {
  return /^[-*]\s+/.test(line) || line.startsWith("\u2022");
}

function cleanBullet(line: string) {
  return line.replace(/^[-*\s]+/, "").replace(/^\u2022\s*/, "").trim();
}

function isSectionHeader(line: string) {
  return matchesAnyHeader(line, sectionHeaders);
}

function matchesAnyHeader(line: string, headers: string[]) {
  const normalized = toTurkishLower(line.trim());
  return headers.some((header) => normalized === toTurkishLower(header) || includesTurkishInsensitive(normalized, header));
}

function removeKnownSkillHeader(line: string) {
  let next = line;
  for (const header of ["skills", "yetenekler", "yetenek", "tools"]) {
    const lower = toTurkishLower(next);
    const index = lower.indexOf(toTurkishLower(header));
    if (index >= 0) next = `${next.slice(0, index)}${next.slice(index + header.length)}`;
  }
  return next;
}

function inferSkills(lines: string[]) {
  const skillIndex = lines.findIndex((line) => matchesAnyHeader(line, skillHeaders));
  if (skillIndex >= 0) {
    const section = sliceSection(lines, skillIndex, ["experience", "deneyim", "education", "egitim", "e\u011fitim", "projects", "projeler", "certifications", "sertifika"]);
    const joined = section
      .map(removeKnownSkillHeader)
      .filter((line) => !isSectionHeader(line))
      .join(", ");
    return splitCsv(joined);
  }

  const likelySkillsLine = lines.find((line) => !looksLikeContactLine(line) && (line.split(",").length >= 4 || line.split(" | ").length >= 4));
  if (!likelySkillsLine) return [];
  return splitCsv(likelySkillsLine.replace(/\s+\|\s+/g, ", "));
}

function looksLikeContactLine(line: string) {
  return /@|linkedin|github|https?:\/\/|\+?\d[\d\s()-]{6,}/i.test(line);
}

const exportCopy = {
  tr: {
    summary: "\u00d6ZET",
    skills: "YETENEKLER",
    experience: "DENEY\u0130M",
    education: "E\u011e\u0130T\u0130M"
  },
  en: {
    summary: "SUMMARY",
    skills: "SKILLS",
    experience: "EXPERIENCE",
    education: "EDUCATION"
  }
} as const;

export function cvToPlainText(profile: Profile, cv: Cv, language: AppLanguage = "en") {
  const labels = exportCopy[language] ?? exportCopy.en;
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
    labels.summary,
    cv.summary || profile.summary,
    "",
    labels.skills,
    cv.skills.join(", "),
    "",
    labels.experience,
    experience,
    "",
    labels.education,
    education
  ]
    .filter((part) => part !== undefined)
    .join("\n");
}
