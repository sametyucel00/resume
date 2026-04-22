export type Tone = "direct" | "executive" | "technical";
export type AiProvider = "groq" | "openai";
export type AppLanguage = "tr" | "en";
export type CvMode = "ats" | "human";
export type CvSectionId = "summary" | "skills" | "experience" | "education";
export type TemplateId = "ats-compact" | "ats-balanced" | "ats-spacious" | "human-focus";
export type SpacingId = "compact" | "balanced" | "spacious";

export type Profile = {
  fullName: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  links: string;
  summary: string;
  skills: string[];
};

export type Experience = {
  id: string;
  company: string;
  role: string;
  period: string;
  bullets: string[];
};

export type Education = {
  id: string;
  school: string;
  degree: string;
  period: string;
};

export type Cv = {
  id: string;
  name: string;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  rawText: string;
  templateId: TemplateId;
  spacingId: SpacingId;
  mode: CvMode;
  sectionOrder: CvSectionId[];
  updatedAt: string;
};

export type JobAnalysis = {
  title: string;
  company: string;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
  risks: string[];
};

export type AtsReport = {
  score: number;
  strengths: string[];
  fixes: string[];
  missingKeywords: string[];
  formattingIssues?: string[];
  riskyPhrases?: string[];
  actionItems?: string[];
};

export type OptimizedCvDraft = {
  summary: string;
  skills: string[];
  experience: Experience[];
  notes: string[];
};

export type InterviewCategory = {
  title: "Behavioral" | "Technical" | "Role Fit";
  items: string[];
};

export type InterviewPack = {
  categories: InterviewCategory[];
  answers: string[];
  qaPairs?: { category: InterviewCategory["title"]; question: string; answer: string }[];
};

export type HistoryItem = {
  id: string;
  type: "summary" | "rewrite" | "job" | "optimize" | "ats" | "interview" | "export" | "import";
  title: string;
  createdAt: string;
  detail: string;
  task?: AiTask;
  provider?: AiProvider;
  promptVersion?: string;
  inputSummary?: string;
  outputSummary?: string;
  status?: "success" | "fallback" | "error";
};

export type Settings = {
  apiBaseUrl: string;
  aiProvider: AiProvider;
  language: AppLanguage;
  tone: Tone;
  credits: number;
  lastJobDescription: string;
  onboardingSeen: boolean;
  aiDataConsent: boolean | null;
};

export type CreditAction =
  | "profileSummary"
  | "organizeSkills"
  | "rewriteBullets"
  | "analyzeJob"
  | "optimizeCv"
  | "atsCheck"
  | "interviewQuestions"
  | "interviewAnswers"
  | "purchase"
  | "restore";

export type CreditTransaction = {
  id: string;
  action: CreditAction;
  amount: number;
  createdAt: string;
  note: string;
};

export type LocalData = {
  localDataVersion: number;
  profile: Profile;
  cvs: Cv[];
  history: HistoryItem[];
  creditTransactions: CreditTransaction[];
  settings: Settings;
};

export type AiTask =
  | "profileSummary"
  | "rewriteBullets"
  | "organizeSkills"
  | "analyzeJob"
  | "optimizeCv"
  | "atsCheck"
  | "interviewQuestions"
  | "interviewAnswers";
