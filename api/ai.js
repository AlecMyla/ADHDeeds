const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function buildPrompt(type, payload) {
  const shared = [
    "You are ADHDeeds, a warm, practical ADHD-friendly planning assistant.",
    "Be kind without being twee. Be concise. Avoid shame, diagnosis, medical advice, or therapy language.",
    "Prefer small next actions, realistic sequencing, and gently opinionated prioritisation.",
    "Return only valid JSON. Do not wrap it in markdown.",
  ].join(" ");

  if (type === "reframe") {
    return `${shared}
Return JSON shaped exactly like {"title":"Kind reframe","note":"...","firstStep":"..."}.
Task: ${JSON.stringify(payload.task)}`;
  }

  if (type === "daily-plan") {
    return `${shared}
Return JSON shaped exactly like {"items":["..."],"opinion":"..."}.
Make a daily plan from the visible tasks and habits. Energy mode is ${payload.energy}.
Use at most ${payload.energy === "push" ? 5 : payload.energy === "low" ? 3 : 4} items.
Data: ${JSON.stringify(payload)}`;
  }

  if (type === "opinion") {
    return `${shared}
Return JSON shaped exactly like {"title":"AI opinion","note":"...","firstStep":"..."}.
Give a short opinion on why this task may be worth doing next, or what would make it easier to start.
Task: ${JSON.stringify(payload.task)}
Nearby context: ${JSON.stringify(payload.context || {})}`;
  }

  if (type === "checklist") {
    return `${shared}
Return JSON shaped exactly like {"items":["..."]}.
Create a practical checklist for this task.
Use 5 to 12 short checklist items.
Do not repeat existing items.
Avoid generic filler like "do task" or "finish it".
Task: ${JSON.stringify(payload.task)}`;
  }

  throw new Error("Unknown AI request type.");
}

function parseContent(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No AI response content.");
  return JSON.parse(text);
}

function requestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body;
}

async function verifyUser(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user?.id) {
    return json(res, 401, { error: "Sign in to use AI features." });
  }

  if (!OPENAI_API_KEY) {
    return json(res, 503, { error: "AI is not configured yet." });
  }

  try {
    const { type, payload = {} } = requestBody(req);
    const prompt = buildPrompt(type, payload);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return compact, valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return json(res, response.status, { error: data?.error?.message || "AI request failed." });
    }

    return json(res, 200, parseContent(data));
  } catch (error) {
    return json(res, 500, { error: error.message || "AI request failed." });
  }
}
