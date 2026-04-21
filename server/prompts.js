const PROMPT_VERSION = "cvopt-ai-v1";

const system = [
  "You are a precise CV optimization assistant.",
  "Write short, clear, realistic, professional output.",
  "Never exaggerate. Avoid generic phrases.",
  "Focus on impact, results, clarity, and job relevance.",
  "Preserve UTF-8 text exactly, including Turkish characters: \u00e7 \u00c7 \u011f \u011e \u0131 I \u0130 i \u00f6 \u00d6 \u015f \u015e \u00fc \u00dc.",
  "Do not uppercase Turkish text unless the user explicitly asks."
].join(" ");

const prompts = {
  profileSummary: (input) => ({
    system,
    user: `Create a concise profile summary from this profile. Tone: ${input.tone || "direct"}.\n\n${JSON.stringify(input.profile, null, 2)}`
  }),
  rewriteBullets: (input) => ({
    system,
    user: `Rewrite these experience bullets. Keep them truthful, specific, and concise.\n\n${JSON.stringify(input, null, 2)}`
  }),
  organizeSkills: (input) => ({
    system,
    user: `Organize skills into compact categories. Return only category lines.\n\n${JSON.stringify(input, null, 2)}`
  }),
  analyzeJob: (input) => ({
    system: `${system} Return valid JSON only.`,
    user: `Analyze this job description. Return JSON with title, company, mustHave, niceToHave, keywords, risks.\n\n${input.jobDescription || ""}`
  }),
  optimizeCv: (input) => ({
    system: `${system} Return valid JSON only.`,
    user: `Optimize this CV for the job. Return JSON with summary, skills, experience, notes. Experience must contain role, company, period, bullets. Keep claims realistic and do not invent metrics.\n\nCV:\n${JSON.stringify(input.cv, null, 2)}\n\nJOB:\n${input.jobDescription || ""}\n\nTone: ${input.tone || "direct"}`
  }),
  atsCheck: (input) => ({
    system: `${system} Return valid JSON only.`,
    user: `Run an ATS compatibility check. Return JSON with score number 0-100, strengths, fixes, missingKeywords, formattingIssues, riskyPhrases, actionItems.\n\nCV:\n${JSON.stringify(input.cv, null, 2)}\n\nJOB:\n${input.jobDescription || ""}`
  }),
  interviewQuestions: (input) => ({
    system: `${system} Return valid JSON only.`,
    user: `Generate 6 realistic interview questions for this job and CV. Return JSON with categories: Behavioral, Technical, Role Fit. Each category must have an items array with 2 questions. Keep questions specific.\n\n${JSON.stringify(input, null, 2)}`
  }),
  interviewAnswers: (input) => ({
    system,
    user: `Create concise answer starters for these questions. Use grounded STAR-style notes, not scripts.\n\n${JSON.stringify(input, null, 2)}`
  })
};

function buildPrompt(task, input) {
  const builder = prompts[task];
  if (!builder) throw new Error(`Unsupported AI task: ${task}`);
  return builder(input || {});
}

module.exports = { PROMPT_VERSION, buildPrompt };
