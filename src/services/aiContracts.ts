import { AiTask, AtsReport, Experience, InterviewCategory, JobAnalysis, OptimizedCvDraft } from "../types";
import { parseLooseJson } from "../utils/json";
import { clamp, preserveUtf8, splitCsv, splitLines } from "../utils/text";

export const CLIENT_PROMPT_VERSION = "cvopt-ai-v1";

export type NormalizedAI = {
  output: string;
  status: "success" | "fallback";
  message: string;
};

const fallbackByTask: Record<AiTask, string> = {
  profileSummary: "Clear, practical professional summary focused on measurable outcomes, relevant strengths, and role fit.",
  rewriteBullets:
    "- Improved ownership, clarity, and delivery impact.\n- Reduced ambiguity by connecting action, scope, and result.\n- Highlighted practical outcomes without exaggeration.",
  organizeSkills: "Core: Communication, Analysis, Project Delivery\nTools: Excel, SQL, CRM\nStrengths: Stakeholder Management, Process Improvement",
  analyzeJob: JSON.stringify({
    title: "Target Role",
    company: "",
    mustHave: ["Relevant experience", "Clear communication", "Ownership"],
    niceToHave: ["Industry knowledge"],
    keywords: ["results", "collaboration", "analysis"],
    risks: ["CV needs stronger evidence for the role"]
  }),
  optimizeCv: JSON.stringify({
    summary: "Clear, role-aligned summary focused on relevant experience, strengths, and practical impact.",
    skills: ["Communication", "Analysis", "Process Improvement"],
    experience: [
      {
        id: "exp_optimized",
        company: "",
        role: "",
        period: "",
        bullets: [
          "Improved clarity of work by connecting responsibilities to practical business outcomes.",
          "Supported cross-functional execution through organized communication and follow-up."
        ]
      }
    ],
    notes: ["Fallback draft used because the AI service was unavailable."]
  }),
  atsCheck: JSON.stringify({
    score: 72,
    strengths: ["Readable structure", "Relevant skills present"],
    fixes: ["Add missing role keywords", "Use more measurable bullets"],
    missingKeywords: ["leadership", "reporting", "process improvement"]
  }),
  interviewQuestions: JSON.stringify({
    categories: [
      { title: "Behavioral", items: ["Tell me about a project where you had to influence stakeholders.", "Describe a time you improved a process under time pressure."] },
      { title: "Technical", items: ["Which tools or methods would you use to solve the main problem in this role?", "How do you validate that your work is producing measurable value?"] },
      { title: "Role Fit", items: ["Why is this role a strong next step for your experience?", "Which part of the job description best matches your recent work?"] }
    ]
  }),
  interviewAnswers: "Use a concise STAR structure: situation, task, action, result. Keep the answer specific, honest, and connected to the job description."
};

const errorMessageByTask: Record<AiTask, string> = {
  profileSummary: "Summary generation is unavailable. A safe local fallback was used.",
  rewriteBullets: "Bullet rewriting is unavailable. A safe local fallback was used.",
  organizeSkills: "Skills organization is unavailable. A safe local fallback was used.",
  analyzeJob: "Job analysis is unavailable. A safe local fallback was used.",
  optimizeCv: "CV optimization is unavailable. A safe local fallback was used.",
  atsCheck: "ATS check is unavailable. A safe local fallback was used.",
  interviewQuestions: "Interview question generation is unavailable. A safe local fallback was used.",
  interviewAnswers: "Interview answer generation is unavailable. A safe local fallback was used."
};

export function normalizeAIOutput(task: AiTask, raw: string): NormalizedAI {
  const clean = preserveUtf8(raw).trim();
  const fallback = fallbackByTask[task];
  if (!clean) return fallbackResult(task);

  const normalized = normalizeByTask(task, clean);
  if (!normalized) return fallbackResult(task);
  return { output: normalized, status: "success", message: "AI response validated." };
}

export function fallbackResult(task: AiTask): NormalizedAI {
  return { output: fallbackByTask[task], status: "fallback", message: errorMessageByTask[task] };
}

export function getAIErrorMessage(task: AiTask) {
  return errorMessageByTask[task];
}

function normalizeByTask(task: AiTask, value: string) {
  if (task === "profileSummary" || task === "rewriteBullets" || task === "organizeSkills" || task === "interviewAnswers") {
    return splitLines(value).length ? value : "";
  }
  if (task === "analyzeJob") return normalizeJobAnalysis(value);
  if (task === "optimizeCv") return normalizeOptimizedCv(value);
  if (task === "atsCheck") return normalizeAtsReport(value);
  if (task === "interviewQuestions") return normalizeInterviewQuestions(value);
  return "";
}

function normalizeJobAnalysis(value: string) {
  const parsed = parseLooseJson<JobAnalysis>(value, {
    title: "Target Role",
    company: "",
    mustHave: splitLines(value).slice(0, 4),
    niceToHave: [],
    keywords: [],
    risks: []
  });
  if (!Array.isArray(parsed.mustHave) || !Array.isArray(parsed.keywords)) return "";
  return JSON.stringify({
    title: stringOrEmpty(parsed.title),
    company: stringOrEmpty(parsed.company),
    mustHave: stringArray(parsed.mustHave),
    niceToHave: stringArray(parsed.niceToHave),
    keywords: stringArray(parsed.keywords),
    risks: stringArray(parsed.risks)
  });
}

function normalizeAtsReport(value: string) {
  const parsed = parseLooseJson<AtsReport>(value, {
    score: 68,
    strengths: ["Readable content"],
    fixes: splitLines(value).slice(0, 4),
    missingKeywords: []
  });
  return JSON.stringify({
    score: clamp(Number(parsed.score) || 0, 0, 100),
    strengths: stringArray(parsed.strengths),
    fixes: stringArray(parsed.fixes),
    missingKeywords: stringArray(parsed.missingKeywords),
    formattingIssues: stringArray(parsed.formattingIssues),
    riskyPhrases: stringArray(parsed.riskyPhrases),
    actionItems: stringArray(parsed.actionItems)
  });
}

function normalizeOptimizedCv(value: string) {
  const parsed = parseLooseJson<OptimizedCvDraft>(value, {
    summary: value,
    skills: [],
    experience: [],
    notes: ["AI returned text instead of structured JSON."]
  });
  const experience = Array.isArray(parsed.experience) ? parsed.experience.map(normalizeExperience).filter(Boolean) as Experience[] : [];
  return JSON.stringify({
    summary: stringOrEmpty(parsed.summary),
    skills: Array.isArray(parsed.skills) ? stringArray(parsed.skills) : splitCsv(String(parsed.skills ?? "")),
    experience,
    notes: stringArray(parsed.notes)
  });
}

function normalizeInterviewQuestions(value: string) {
  const parsed = parseLooseJson<{ categories: InterviewCategory[] }>(value, {
    categories: [
      { title: "Behavioral", items: splitLines(value).slice(0, 2) },
      { title: "Technical", items: splitLines(value).slice(2, 4) },
      { title: "Role Fit", items: splitLines(value).slice(4, 6) }
    ]
  });
  const categories = (parsed.categories ?? []).map((category) => ({
    title: category.title,
    items: stringArray(category.items).slice(0, 3)
  })).filter((category) => ["Behavioral", "Technical", "Role Fit"].includes(category.title) && category.items.length);
  return categories.length ? JSON.stringify({ categories }) : "";
}

function normalizeExperience(value: Experience) {
  if (!value || typeof value !== "object") return null;
  return {
    id: stringOrEmpty(value.id),
    company: stringOrEmpty(value.company),
    role: stringOrEmpty(value.role),
    period: stringOrEmpty(value.period),
    bullets: stringArray(value.bullets)
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => preserveUtf8(String(item)).trim()).filter(Boolean) : [];
}

function stringOrEmpty(value: unknown) {
  return preserveUtf8(String(value ?? "")).trim();
}
