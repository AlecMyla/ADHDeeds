const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const METOFFICE_API_KEY = process.env.METOFFICE_API_KEY;
const METOFFICE_LATITUDE = process.env.METOFFICE_LATITUDE;
const METOFFICE_LONGITUDE = process.env.METOFFICE_LONGITUDE;
const METOFFICE_API_URL = process.env.METOFFICE_API_URL;

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

  if (type === "breakdown") {
    return `${shared}
Return JSON shaped exactly like {"items":["..."]}.
Break the task into 3 to 6 concrete smaller tasks.
Each item must be specific to the actual task, not a generic productivity step.
Use verbs and useful nouns from the task/notes/category where possible.
Prefer actions that can be completed in 2 to 15 minutes.
Avoid vague filler such as "get started", "work on it", "finish it", "review the task", or "make progress".
If the task involves contacting someone, include the specific prep/send/call steps.
If the task involves booking, buying, submitting, packing, cleaning, admin, or travel, make the steps match that domain.
Task and context: ${JSON.stringify({ task: payload.task, profile: payload.profile || {} })}`;
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
Profile rules are hard constraints:
- Only include a medication reminder if profile.onMedication is exactly "Yes" and the task plausibly involves travel, overnight stays, leaving home for a long day, appointments, or routines.
- Only include menstrual-cycle products if profile.gender is exactly "Female" and the task plausibly involves travel, overnight stays, packing, or leaving home for a long day.
- If profile.gender is "Male", "Non-binary", "Other", or "Prefer not to say", do not mention menstrual cycles, periods, tampons, pads, liners, or menstrual products.
- Do not ask what medication the user takes, do not give dosage or clinical advice, and do not infer pregnancy or health status.
Task and context: ${JSON.stringify({ task: payload.task, profile: payload.profile || {} })}`;
  }

  if (type === "today-considerations") {
    return `${shared}
Return JSON shaped exactly like {"weather":["..."],"planning":["..."],"rut":"...","protect":"...","weatherUnavailable":false}.
Create a short beta briefing for today.
Use weather when present: UV index, feels-like temperature, and rain/probability of precipitation.
Give practical suggestions such as umbrella, sunscreen, jumper, timing outdoor errands, or lighter physical load.
Use task/habit signals to spot overload, repeated moving, missed habits, growing friction, or checklist-heavy days.
For rut advice, use research-led but plain-language strategies: reduce activation energy, implementation intentions, two-minute start, environmental cue, body doubling, task chunking, and self-compassion.
Use profile context lightly for tone and relevance. If profile.adhdStatus is "Undiagnosed" or "Exploring", you may include a gentle, UK-context note that they can ask their GP about NHS ADHD assessment options and Right to Choose in England, but do not diagnose or imply they have ADHD.
Do not mention research papers or clinical claims.
Use at most 3 weather items and 3 planning items.
Data: ${JSON.stringify(payload)}`;
  }

  throw new Error("Unknown AI request type.");
}

function findFirstNumber(value, names) {
  if (!value || typeof value !== "object") return null;
  const stack = [value];
  while (stack.length) {
    const current = stack.shift();
    if (!current || typeof current !== "object") continue;
    for (const [key, raw] of Object.entries(current)) {
      if (names.some((name) => key.toLowerCase().includes(name.toLowerCase()))) {
        const number = Number(raw?.value ?? raw);
        if (Number.isFinite(number)) return number;
      }
      if (raw && typeof raw === "object") stack.push(raw);
    }
  }
  return null;
}

function simplifyWeather(data) {
  if (!data) return null;
  return {
    source: "Met Office",
    uvIndex: findFirstNumber(data, ["uvIndex", "uv-index", "uv"]),
    feelsLikeTempC: findFirstNumber(data, ["feelsLike", "feels-like", "apparent"]),
    rainProbability: findFirstNumber(data, ["probOfPrecipitation", "precip-prob", "precipitationProbability", "Pp"]),
    rainAmountMm: findFirstNumber(data, ["totalPrecipAmount", "precip-total", "precipitationAmount"]),
  };
}

async function fetchMetOfficeWeather() {
  if (!METOFFICE_API_KEY) return { weather: null, weatherUnavailable: true };
  const url = METOFFICE_API_URL
    || (METOFFICE_LATITUDE && METOFFICE_LONGITUDE
      ? `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily?latitude=${METOFFICE_LATITUDE}&longitude=${METOFFICE_LONGITUDE}`
      : "");
  if (!url) return { weather: null, weatherUnavailable: true };
  const response = await fetch(url, {
    headers: {
      apikey: METOFFICE_API_KEY,
      "x-api-key": METOFFICE_API_KEY,
    },
  });
  if (!response.ok) return { weather: null, weatherUnavailable: true };
  const data = await response.json();
  return { weather: simplifyWeather(data), weatherUnavailable: false };
}

function parseContent(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No AI response content.");
  return JSON.parse(text);
}

function removeProfileMismatches(type, result, profile = {}) {
  if (type !== "checklist" || !Array.isArray(result?.items)) return result;
  const gender = profile.gender || "Prefer not to say";
  const onMedication = profile.onMedication || "Prefer not to say";
  const menstrualPattern = /\b(period|periods|menstrual|menstruation|tampon|tampons|pad|pads|liner|liners|sanitary|cycle products?)\b/i;
  const medicationPattern = /\b(medication|medicine|meds|prescription|prescriptions|tablets|pills)\b/i;
  return {
    ...result,
    items: result.items.filter((item) => {
      const text = String(item || "");
      if (gender !== "Female" && menstrualPattern.test(text)) return false;
      if (onMedication !== "Yes" && medicationPattern.test(text)) return false;
      return true;
    }),
  };
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
    const weatherContext = type === "today-considerations" ? await fetchMetOfficeWeather() : {};
    const prompt = buildPrompt(type, { ...payload, ...weatherContext });
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

    const parsed = parseContent(data);
    return json(res, 200, removeProfileMismatches(type, parsed, payload.profile));
  } catch (error) {
    return json(res, 500, { error: error.message || "AI request failed." });
  }
}
