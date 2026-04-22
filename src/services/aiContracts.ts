import { AiTask, AppLanguage, AtsReport, Experience, InterviewCategory, JobAnalysis, OptimizedCvDraft } from "../types";
import { parseLooseJson } from "../utils/json";
import { clamp, preserveUtf8, splitCsv, splitLines } from "../utils/text";
import { useAppStore } from "../store/useAppStore";

export const CLIENT_PROMPT_VERSION = "cvopt-ai-v1";

export type NormalizedAI = {
  output: string;
  status: "success" | "fallback";
  message: string;
};

const fallbackByTask: Record<AppLanguage, Record<AiTask, string>> = {
  tr: {
      "profileSummary": "Sonuç odaklı, role uygun ve gerçekçi bir profesyonel özet. Deneyimi, güçlü yönleri ve başvuru hedefini net şekilde anlatır.",
      "rewriteBullets": "- Sorumlulukları daha net ve sonuç odaklı ifade ettim.\n- Yapılan işi kapsam, aksiyon ve etki ilişkisiyle güçlendirdim.\n- Abartı eklemeden pratik çıktıları öne çıkardım.",
      "organizeSkills": "Temel Yetkinlikler: İletişim, Analiz, Proje Takibi\nAraçlar: Excel, SQL, CRM\nGüçlü Yönler: Paydaş Yönetimi, Süreç İyileştirme",
      "analyzeJob": "{\"title\":\"Hedef Rol\",\"company\":\"\",\"mustHave\":[\"İlgili deneyim\",\"Açık iletişim\",\"Sorumluluk alma\"],\"niceToHave\":[\"Sektör bilgisi\"],\"keywords\":[\"sonuç\",\"iş birliği\",\"analiz\"],\"risks\":[\"Özgeçmişte role uygun kanıtlar güçlendirilmeli\"]}",
      "optimizeCv": "{\"summary\":\"Role uygun deneyim, güçlü yönler ve pratik etki üzerine kurulu net bir özet.\",\"skills\":[\"İletişim\",\"Analiz\",\"Süreç İyileştirme\"],\"experience\":[{\"id\":\"exp_optimized\",\"company\":\"\",\"role\":\"\",\"period\":\"\",\"bullets\":[\"Sorumlulukları pratik iş sonuçlarıyla ilişkilendirerek anlatımı güçlendirdi.\",\"Düzenli iletişim ve takip ile ekipler arası yürütmeyi destekledi.\"]}],\"notes\":[\"AI servisi kullanılamadığı için güvenli yerel taslak kullanıldı.\"]}",
      "atsCheck": "{\"score\":72,\"strengths\":[\"Okunabilir yapı\",\"İlgili yetenekler mevcut\"],\"fixes\":[\"Eksik rol anahtar kelimelerini ekleyin\",\"Deneyim maddelerini daha ölçülebilir hale getirin\"],\"missingKeywords\":[\"liderlik\",\"raporlama\",\"süreç iyileştirme\"]}",
      "interviewQuestions": "{\"categories\":[{\"title\":\"Behavioral\",\"items\":[\"Paydaşları ikna etmeniz gereken bir projeyi anlatır mısınız?\",\"Zaman baskısı altında bir süreci iyileştirdiğiniz bir örnek paylaşır mısınız?\"]},{\"title\":\"Technical\",\"items\":[\"Bu roldeki ana problemi çözmek için hangi araç veya yöntemleri kullanırsınız?\",\"Çalışmanızın ölçülebilir değer ürettiğini nasıl doğrularsınız?\"]},{\"title\":\"Role Fit\",\"items\":[\"Bu rol deneyiminiz için neden doğru bir sonraki adım?\",\"İş ilanının hangi bölümü son deneyiminizle en çok örtüşüyor?\"]}]}",
      "interviewAnswers": "Kısa bir STAR yapısı kullanın: durum, görev, aksiyon, sonuç. Cevabı net, dürüst ve iş ilanıyla bağlantılı tutun."
  },
  en: {
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
  }
};

export function normalizeAIOutput(task: AiTask, raw: string): NormalizedAI {
  const clean = preserveUtf8(raw).trim();
  const fallback = getFallbackOutput(task);
  if (!clean) return fallbackResult(task);

  const normalized = normalizeByTask(task, clean);
  if (!normalized) return fallbackResult(task);
  return { output: normalized, status: "success", message: "AI response validated." };
}

export function fallbackResult(task: AiTask): NormalizedAI {
  return { output: getFallbackOutput(task), status: "fallback", message: getAIErrorMessage(task) };
}

export function getAIErrorMessage(task: AiTask) {
  const language = useAppStore.getState().settings.language;
  const trMessages: Record<AiTask, string> = {
      "profileSummary": "Özet üretimi şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "rewriteBullets": "Madde yeniden yazımı şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "organizeSkills": "Yetenek düzenleme şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "analyzeJob": "İş ilanı analizi şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "optimizeCv": "Özgeçmiş optimizasyonu şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "atsCheck": "ATS kontrolü şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "interviewQuestions": "Mülakat sorusu üretimi şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı.",
      "interviewAnswers": "Mülakat cevabı üretimi şu anda kullanılamıyor. Güvenli bir yerel taslak kullanıldı."
  };
  const enMessages: Record<AiTask, string> = {
    profileSummary: "Summary generation is unavailable. A safe local fallback was used.",
    rewriteBullets: "Bullet rewriting is unavailable. A safe local fallback was used.",
    organizeSkills: "Skills organization is unavailable. A safe local fallback was used.",
    analyzeJob: "Job analysis is unavailable. A safe local fallback was used.",
    optimizeCv: "CV optimization is unavailable. A safe local fallback was used.",
    atsCheck: "ATS check is unavailable. A safe local fallback was used.",
    interviewQuestions: "Interview question generation is unavailable. A safe local fallback was used.",
    interviewAnswers: "Interview answer generation is unavailable. A safe local fallback was used."
  };
  return language === "tr" ? trMessages[task] : enMessages[task];
}

function getFallbackOutput(task: AiTask) {
  const language = useAppStore.getState().settings.language;
  return fallbackByTask[language]?.[task] ?? fallbackByTask.en[task];
}

function normalizeByTask(task: AiTask, value: string) {
  if (task === "profileSummary" || task === "rewriteBullets" || task === "organizeSkills" || task === "interviewAnswers") {
    const normalizedText = task === "profileSummary" ? sanitizeProfileSummary(value) : value;
    return splitLines(normalizedText).length ? normalizedText : "";
  }
  if (task === "analyzeJob") return normalizeJobAnalysis(value);
  if (task === "optimizeCv") return normalizeOptimizedCv(value);
  if (task === "atsCheck") return normalizeAtsReport(value);
  if (task === "interviewQuestions") return normalizeInterviewQuestions(value);
  return "";
}

function normalizeJobAnalysis(value: string) {
  const language = useAppStore.getState().settings.language;
  const parsed = parseLooseJson<JobAnalysis>(value, {
    title: language === "tr" ? "\u0048\u0065\u0064\u0065\u0066 \u0052\u006f\u006c" : "Target Role",
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
  const language = useAppStore.getState().settings.language;
  const parsed = parseLooseJson<AtsReport>(value, {
    score: 68,
    strengths: [language === "tr" ? "\u004f\u006b\u0075\u006e\u0061\u0062\u0069\u006c\u0069\u0072 \u0069\u00e7\u0065\u0072\u0069\u006b" : "Readable content"],
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
  const language = useAppStore.getState().settings.language;
  const parsed = parseLooseJson<OptimizedCvDraft>(value, {
    summary: value,
    skills: [],
    experience: [],
    notes: [language === "tr" ? "\u0041\u0049 \u0079\u0061\u0070\u0131\u006c\u0061\u006e\u0064\u0131\u0072\u0131\u006c\u006d\u0131\u015f \u0076\u0065\u0072\u0069 \u0079\u0065\u0072\u0069\u006e\u0065 \u006d\u0065\u0074\u0069\u006e \u0064\u00f6\u006e\u0064\u00fc\u0072\u0064\u00fc." : "AI returned text instead of structured JSON."]
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

function sanitizeProfileSummary(value: string) {
  return preserveUtf8(value)
    .replace(/\s[-\u2013\u2014]\s+[^\n]{1,80}$/u, "")
    .replace(/^(summary|profil \u00f6zeti|profile summary)\s*:\s*/iu, "")
    .trim();
}
