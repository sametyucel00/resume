require("dotenv").config();

const cors = require("cors");
const express = require("express");
const mammoth = require("mammoth");
const multer = require("multer");
const pdf = require("pdf-parse");
const { generateAIResponse, getAIModel, getProviderConfigStatus, testAIProvider } = require("./aiProviders");
const { PROMPT_VERSION } = require("./prompts");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const rateMap = new Map();
const TURKISH_LOCALE = "tr-TR";
const allowedTasks = new Set(["profileSummary", "rewriteBullets", "organizeSkills", "analyzeJob", "optimizeCv", "atsCheck", "interviewQuestions", "interviewAnswers"]);
const allowedProviders = new Set(["groq", "openai"]);
const allowedImportTypes = new Set([
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/octet-stream"
]);

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use((request, response, next) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));

app.use((request, response, next) => {
  const ip = request.ip || "local";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const current = rateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count += 1;
  rateMap.set(ip, current);
  if (current.count > 80) return response.status(429).json({ error: "Too many requests. Try again shortly." });
  if (rateMap.size > 1000) cleanupRateMap(now);
  next();
});

app.get("/health", (_request, response) => {
  response.json({ ok: true, promptVersion: PROMPT_VERSION, providers: getProviderConfigStatus() });
});

app.post("/api/ai", async (request, response) => {
  const started = Date.now();
  try {
    const { task, input, provider = "groq" } = request.body || {};
    const validation = validateAiBody({ task, input, provider });
    if (!validation.ok) return response.status(400).json({ error: validation.error });
    const normalizedInput = { ...input, language: input.language === "en" ? "en" : "tr" };
    const output = await withTimeout(generateAIResponse({ task, input: normalizedInput }, provider), 22000);
    if (!output) return response.status(502).json({ error: "Empty AI output" });
    logEvent("ai.complete", { task, provider, ms: Date.now() - started, status: 200 });
    response.json({ output: preserveUtf8(output), provider, model: getAIModel(provider), promptVersion: PROMPT_VERSION });
  } catch (error) {
    logEvent("ai.error", { message: error.message, ms: Date.now() - started, status: 503 });
    response.status(503).json({ error: normalizeProviderError(error) });
  }
});

app.post("/api/provider-test", async (request, response) => {
  try {
    const { provider = "groq" } = request.body || {};
    if (!["groq", "openai"].includes(provider)) return response.status(400).json({ error: "Unsupported provider" });
    const result = await withTimeout(testAIProvider(provider), 18000);
    response.json({ ...result, promptVersion: PROMPT_VERSION });
  } catch (error) {
    response.status(503).json({ ok: false, error: normalizeProviderError(error) });
  }
});

app.post("/api/import", upload.single("file"), async (request, response) => {
  try {
    if (!request.file) return response.status(400).json({ error: "Missing file" });
    if (!allowedImportTypes.has(request.file.mimetype)) return response.status(415).json({ error: "Unsupported file type" });
    const name = preserveUtf8(request.file.originalname).toLocaleLowerCase(TURKISH_LOCALE);
    if (!/\.(pdf|docx|doc|txt)$/i.test(name)) return response.status(415).json({ error: "Unsupported file extension" });
    let text = "";

    if (name.endsWith(".pdf") || request.file.mimetype === "application/pdf") {
      const parsed = await pdf(request.file.buffer);
      text = parsed.text;
    } else if (name.endsWith(".docx") || request.file.mimetype.includes("wordprocessingml")) {
      const parsed = await mammoth.extractRawText({ buffer: request.file.buffer });
      text = parsed.value;
    } else {
      text = request.file.buffer.toString("utf8");
    }

    response.json({ text: preserveUtf8(text) });
  } catch (error) {
    logEvent("import.error", { message: error.message, status: 422 });
    response.status(422).json({ error: normalizeImportError(error) });
  }
});

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("AI timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function validateAiBody({ task, input, provider }) {
  if (!allowedTasks.has(task)) return { ok: false, error: "Unsupported AI task" };
  if (!allowedProviders.has(provider)) return { ok: false, error: "Unsupported AI provider" };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Input must be an object" };
  return { ok: true };
}

function cleanupRateMap(now) {
  for (const [ip, value] of rateMap.entries()) {
    if (now > value.resetAt) rateMap.delete(ip);
  }
}

function logEvent(event, fields) {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

function normalizeImportError(error) {
  const message = error?.message || "";
  const normalized = message.toLocaleLowerCase(TURKISH_LOCALE);
  if (normalized.includes("password")) return "Encrypted documents are not supported.";
  if (normalized.includes("pdf")) return "Could not read this PDF. Paste the CV text instead.";
  return "Could not parse this document. Paste the CV text instead.";
}

function preserveUtf8(value) {
  return repairCommonMojibake(String(value || "")).normalize("NFC");
}

function repairCommonMojibake(value) {
  const map = {
    "Ã§": "ç",
    "Ã‡": "Ç",
    "ÄŸ": "ğ",
    "Äž": "Ğ",
    "Ä±": "ı",
    "Ä°": "İ",
    "Ã¶": "ö",
    "Ã–": "Ö",
    "ÅŸ": "ş",
    "Åž": "Ş",
    "Ã¼": "ü",
    "Ãœ": "Ü",
    "â€“": "-",
    "â€”": "-",
    "â€˜": "'",
    "â€™": "'",
    "â€œ": "\"",
    "â€": "\""
  };
  let repaired = value;
  for (const [broken, fixed] of Object.entries(map)) {
    repaired = repaired.split(broken).join(fixed);
  }
  return repaired;
}

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`CV Optimizer AI API running on http://localhost:${port}`);
});

function normalizeProviderError(error) {
  const message = error?.message || "Provider test failed";
  if (message.includes("OPENAI_API_KEY")) return "OpenAI API key is not configured.";
  if (message.includes("GROQ_API_KEY")) return "Groq API key is not configured.";
  if (message.includes("401")) return "Provider rejected the API key.";
  if (message.includes("429")) return "Provider rate limit reached.";
  return "Provider is unavailable right now.";
}

app.use((error, _request, response, next) => {
  if (!error) return next();
  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ error: "Invalid JSON body" });
  }
  if (error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: "File is too large" });
  }
  return response.status(500).json({ error: "Unexpected server error" });
});
