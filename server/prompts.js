const PROMPT_VERSION = "cvopt-ai-v1";

const system = [
  "You are a precise CV optimization assistant.",
  "Write short, clear, realistic, professional output.",
  "Never exaggerate. Avoid generic phrases.",
  "Focus on impact, results, clarity, and job relevance.",
  "Use only evidence that is present in the provided CV, profile, STAR draft, or job description.",
  "Do not invent employers, tools, metrics, achievements, years, or responsibilities.",
  "Prefer specific wording over motivational language.",
  "Preserve UTF-8 text exactly, including Turkish characters: \u00e7 \u00c7 \u011f \u011e \u0131 I \u0130 i \u00f6 \u00d6 \u015f \u015e \u00fc \u00dc.",
  "Do not uppercase Turkish text unless the user explicitly asks."
].join(" ");

function languageRule(input) {
  if (input && input.language === "tr") {
    return "Write every user-facing word in Turkish. Use natural Turkish labels and preserve Turkish characters exactly: \\u00e7 \\u00c7 \\u011f \\u011e \\u0131 I \\u0130 i \\u00f6 \\u00d6 \\u015f \\u015e \\u00fc \\u00dc. Do not return English section names except fixed technical terms such as ATS or STAR.";
  }
  return "Write every user-facing word in English.";
}

function systemFor(input) {
  return `${system} ${languageRule(input)}`;
}

function toneRule(input) {
  if (input?.tone === "executive") {
    return "Use a strategic, senior, concise tone. Prioritize business impact, decision-making, ownership, and stakeholder alignment.";
  }
  if (input?.tone === "technical") {
    return "Use a practical technical tone. Prioritize tools, methods, systems, implementation detail, and measurable execution.";
  }
  return "Use a direct, concise, plainspoken tone. Prioritize clarity, action, and realistic outcomes.";
}

const prompts = {
  profileSummary: (input) => ({
    system: systemFor(input),
    user: `Create a concise profile summary from this profile. ${toneRule(input)} Return one short paragraph only. Do not use bullet points, labels, greetings, or signatures. Do not repeat the person's name unless it is necessary for clarity.\n\n${JSON.stringify(input.profile, null, 2)}`
  }),
  rewriteBullets: (input) => ({
    system: systemFor(input),
    user: `Rewrite only the experience bullets from input.bullets. ${toneRule(input)} Keep them truthful, specific, and concise. Return only rewritten bullet lines, one per line. Do not return JSON, labels, explanations, jobDescription, tone, or language.\n\n${JSON.stringify(input, null, 2)}`
  }),
  organizeSkills: (input) => ({
    system: systemFor(input),
    user: `Organize skills into compact categories. ${toneRule(input)} Return only category lines.\n\n${JSON.stringify(input, null, 2)}`
  }),
  analyzeJob: (input) => ({
    system: `${systemFor(input)} Return valid JSON only. Use Turkish JSON string values when language is tr; keep the JSON keys unchanged.`,
    user: `Analyze this job description. ${toneRule(input)}
Return JSON with title, company, mustHave, niceToHave, keywords, risks.
Rules:
- Extract only requirements and terms that are actually present in the job text.
- Do not add generic technology, leadership, cloud, security, or process terms unless the job explicitly mentions them.
- Keep keywords to 6-10 concrete role terms.

JOB SIGNALS:
${JSON.stringify(input.jobSignals || {}, null, 2)}

JOB:
${input.jobDescription || ""}`
  }),
  optimizeCv: (input) => ({
    system: `${systemFor(input)} Return valid JSON only. Use Turkish JSON string values when language is tr; keep the JSON keys unchanged.`,
    user: `Optimize this CV for the job. ${toneRule(input)}
Return JSON with summary, skills, experience, notes. Experience must contain role, company, period, bullets.
Strict rules:
- Use JOB SIGNALS as the main target context.
- Optimize only for requirements explicitly present in JOB or JOB SIGNALS.
- Do not add skills, tools, industries, metrics, seniority, or achievements that are not supported by the CV.
- If the CV does not prove a job requirement, mention it only as a note, not as a claim in the CV.
- Notes must briefly explain which job requirement influenced the change.
- Keep output realistic, direct, and application-ready.

JOB SIGNALS:
${JSON.stringify(input.jobSignals || {}, null, 2)}

CV:
${JSON.stringify(input.cv, null, 2)}

JOB:
${input.jobDescription || ""}`
  }),
  atsCheck: (input) => ({
    system: `${systemFor(input)} Return valid raw JSON only. Do not wrap JSON in markdown or code fences. Use Turkish JSON string values when language is tr; keep the JSON keys unchanged.`,
    user: `Run an ATS compatibility check. ${toneRule(input)}
Return JSON with score number 0-100, strengths, fixes, missingKeywords, formattingIssues, riskyPhrases, actionItems.
Strict rules:
- Base the report only on the supplied CV, JOB, and JOB SIGNALS.
- missingKeywords must contain only terms that are explicitly present in JOB or JOB SIGNALS.
- Do not suggest unrelated technologies, cloud/security terms, methods, or certifications.
- Explain what is strong, what is missing, and what can be improved in practical language.
- If job context is weak, say that the full job description is needed instead of inventing terms.

JOB SIGNALS:
${JSON.stringify(input.jobSignals || {}, null, 2)}

CV:
${JSON.stringify(input.cv, null, 2)}

JOB:
${input.jobDescription || ""}`
  }),
  interviewQuestions: (input) => ({
    system: `${systemFor(input)} Return valid JSON only. Use Turkish JSON string values when language is tr; keep category title values as Behavioral, Technical, or Role Fit for app mapping.`,
    user: `Generate 6 realistic interview questions for this job and CV. ${toneRule(input)}
Return JSON with categories: Behavioral, Technical, Role Fit. Each category must have exactly 2 items.
Question style:
- Realistic first or second interview questions a recruiter or hiring manager would ask.
- No extreme case studies, trick questions, abstract strategy prompts, or overdramatic scenarios.
- Questions should sound natural and short.
- Tie questions to JOB SIGNALS and visible CV experience only.
- For Turkish output, use natural Turkish interview wording.

JOB SIGNALS:
${JSON.stringify(input.jobSignals || {}, null, 2)}

INPUT:
${JSON.stringify(input, null, 2)}`
  }),
  interviewAnswers: (input) => ({
    system: systemFor(input),
    user: `Create concise answer starters or improve the current answer for these questions. ${toneRule(input)}
Use natural interview language, not a stiff script.
Keep each answer to 3-5 sentences, stay faithful to the provided experience, and avoid invented details.
If a currentAnswer is provided, improve that answer directly.

${JSON.stringify(input, null, 2)}`
  })
};

function buildPrompt(task, input) {
  const builder = prompts[task];
  if (!builder) throw new Error(`Unsupported AI task: ${task}`);
  return builder(input || {});
}

module.exports = { PROMPT_VERSION, buildPrompt };
