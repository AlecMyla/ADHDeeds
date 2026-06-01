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

function isAuthExpired(response, body) {
  return response.status === 401 || body?.message?.toLowerCase().includes("jwt expired");
}

async function withUser(session) {
  if (!session?.access_token) return null;
  const user = session.user || await getUser(session.access_token);
  if (!user) return null;
  return {
    ...session,
    user,
  };
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

export async function refreshSession(session = getStoredSession()) {
  if (!session?.refresh_token) {
    saveSession(null);
    return { error: new Error("Session expired. Please sign in again.") };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const body = await response.json();
  if (!response.ok) {
    saveSession(null);
    return { error: new Error(body.error_description || body.msg || "Session expired. Please sign in again.") };
  }

  const refreshed = await withUser(body);
  if (!refreshed) {
    saveSession(null);
    return { error: new Error("Session expired. Please sign in again.") };
  }
  saveSession(refreshed);
  return { data: { session: refreshed } };
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
  const session = await withUser(body);
  saveSession(session);
  return { data: { session } };
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
  const session = body.session || (body.access_token ? await withUser(body) : null);
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
    expires_at: Number(hash.get("expires_at") || 0) || undefined,
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
  async function request(currentSession) {
    const response = await fetch(`${supabaseUrl}/rest/v1/user_diary_data?user_id=eq.${currentSession.user.id}&select=data`, {
      headers: authHeaders(currentSession),
    });
    const body = await response.json();
    return { response, body };
  }

  let { response, body } = await request(session);
  if (!response.ok && isAuthExpired(response, body)) {
    const refreshed = await refreshSession(session);
    if (refreshed.error) return { error: refreshed.error };
    const retry = await request(refreshed.data.session);
    response = retry.response;
    body = retry.body;
    if (!response.ok) return { error: new Error(body.message || "Could not load cloud data.") };
    return { data: body[0]?.data || null, session: refreshed.data.session };
  }
  if (!response.ok) return { error: new Error(body.message || "Could not load cloud data.") };
  return { data: body[0]?.data || null, session };
}

export async function saveDiaryData(session, data) {
  async function request(currentSession) {
    const response = await fetch(`${supabaseUrl}/rest/v1/user_diary_data?on_conflict=user_id`, {
      method: "POST",
      headers: {
        ...authHeaders(currentSession),
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: currentSession.user.id,
        data,
        updated_at: new Date().toISOString(),
      }),
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  }

  let { response, body } = await request(session);
  if (!response.ok && isAuthExpired(response, body)) {
    const refreshed = await refreshSession(session);
    if (refreshed.error) return { error: refreshed.error };
    const retry = await request(refreshed.data.session);
    response = retry.response;
    body = retry.body;
    if (!response.ok) return { error: new Error(body.message || "Could not save cloud data.") };
    return { data: true, session: refreshed.data.session };
  }
  if (!response.ok) return { error: new Error(body.message || "Could not save cloud data.") };
  return { data: true, session };
}
