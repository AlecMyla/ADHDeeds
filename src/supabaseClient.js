const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SESSION_KEY = "adhdeeds_supabase_session_v1";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function authHeaders(session) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

function saveSession(session) {
  if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function getUser(accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

export function getStoredSession() {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export async function signInWithPassword(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) return { error: new Error(body.error_description || body.msg || "Sign in failed.") };
  saveSession(body);
  return { data: { session: body } };
}

export async function signUpWithPassword(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) return { error: new Error(body.msg || body.error_description || "Sign up failed.") };
  const session = body.session || (body.access_token ? body : null);
  if (session) saveSession(session);
  return { data: { session, user: body.user || session?.user }, needsConfirmation: !session };
}

export function signInWithGoogle() {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
  });
  window.location.assign(`${supabaseUrl}/auth/v1/authorize?${params.toString()}`);
}

export async function consumeOAuthSessionFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  if (!accessToken) return null;

  const session = {
    access_token: accessToken,
    refresh_token: hash.get("refresh_token"),
    expires_in: Number(hash.get("expires_in") || 0),
    token_type: hash.get("token_type") || "bearer",
    provider_token: hash.get("provider_token"),
    user: await getUser(accessToken),
  };

  if (!session.user) return null;
  saveSession(session);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  return session;
}

export function signOut() {
  saveSession(null);
}

export async function loadDiaryData(session) {
  const response = await fetch(`${supabaseUrl}/rest/v1/user_diary_data?user_id=eq.${session.user.id}&select=data`, {
    headers: authHeaders(session),
  });
  const body = await response.json();
  if (!response.ok) return { error: new Error(body.message || "Could not load cloud data.") };
  return { data: body[0]?.data || null };
}

export async function saveDiaryData(session, data) {
  const response = await fetch(`${supabaseUrl}/rest/v1/user_diary_data?on_conflict=user_id`, {
    method: "POST",
    headers: {
      ...authHeaders(session),
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: session.user.id,
      data,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { error: new Error(body.message || "Could not save cloud data.") };
  }
  return { data: true };
}
