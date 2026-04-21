const Groq = require("groq-sdk");
const { buildPrompt } = require("./prompts");

async function generateAIResponse(input, provider = "groq") {
  if (provider === "openai") {
    return generateWithOpenAI(input);
  }
  return generateWithGroq(input);
}

function getAIModel(provider = "groq") {
  return provider === "openai"
    ? process.env.OPENAI_MODEL || "gpt-5.1-mini"
    : process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}

function getProviderConfigStatus() {
  return {
    groq: { configured: Boolean(process.env.GROQ_API_KEY), model: getAIModel("groq") },
    openai: { configured: Boolean(process.env.OPENAI_API_KEY), model: getAIModel("openai") }
  };
}

async function generateWithGroq(input) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const prompt = buildPrompt(input.task, input.input);
  const completion = await client.chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.25,
    max_tokens: 1200,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

async function generateWithOpenAI(input) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = buildPrompt(input.task, input.input);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: getAIModel("openai"),
      instructions: prompt.system,
      input: prompt.user,
      max_output_tokens: 1200
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text.slice(0, 160)}`);
  }

  const data = await response.json();
  return extractOpenAIText(data);
}

async function testAIProvider(provider = "groq") {
  const output = await generateAIResponse({ task: "profileSummary", input: { profile: { title: "Test" }, tone: "direct" } }, provider);
  return { ok: Boolean(output), provider, model: getAIModel(provider) };
}

function extractOpenAIText(data) {
  if (typeof data.output_text === "string") return data.output_text.trim();
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

module.exports = { generateAIResponse, getAIModel, getProviderConfigStatus, testAIProvider };
