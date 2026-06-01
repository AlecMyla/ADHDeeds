export async function askAI(type, payload, accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch("/api/ai", {
    method: "POST",
    headers,
    body: JSON.stringify({ type, payload }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "AI is unavailable right now.");
  }
  return body;
}
