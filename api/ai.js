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
If energy mode is "push", include every visible open task and every visible open habit for the day. Do not cap the number of items.
If energy mode is "low", use at most 3 items.
If energy mode is "normal", use at most 4 items.
Keep the order realistic and avoid inventing tasks that are not in the data.
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

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

async function fetchForecast(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function fetchOpenMeteoWeather(location = {}) {
  const latitude = validCoordinate(location.latitude, -90, 90);
  const longitude = validCoordinate(location.longitude, -180, 180);
  if (latitude === null || longitude === null) return { weather: null, weatherUnavailable: true };

  const baseParams = {
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: "apparent_temperature,precipitation,rain,showers,weather_code",
    daily: "uv_index_max,precipitation_probability_max,precipitation_sum,apparent_temperature_max,apparent_temperature_min",
    forecast_days: "1",
    timezone: "auto",
  };
  const buildUrl = (extra = {}) => {
    const params = new URLSearchParams({ ...baseParams, ...extra });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  };

  const data = await fetchForecast(buildUrl({ models: "ukmo_seamless" })) || await fetchForecast(buildUrl());
  if (!data) return { weather: null, weatherUnavailable: true };

  const current = data.current || {};
  const daily = data.daily || {};
  const weather = {
    source: "Open-Meteo UK Met Office",
    locationName: String(location.name || "").trim(),
    uvIndex: daily.uv_index_max?.[0] ?? null,
    feelsLikeTempC: current.apparent_temperature ?? daily.apparent_temperature_max?.[0] ?? null,
    rainProbability: daily.precipitation_probability_max?.[0] ?? null,
    rainAmountMm: daily.precipitation_sum?.[0] ?? current.precipitation ?? current.rain ?? current.showers ?? null,
    weatherCode: current.weather_code ?? null,
  };
  return { weather, weatherUnavailable: false };
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
    const weatherContext = type === "today-considerations" ? await fetchOpenMeteoWeather(payload.weatherLocation) : {};
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
