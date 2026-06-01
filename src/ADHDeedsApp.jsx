import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Flame,
  Home,
  Minus,
  Pencil,
  Plus,
  ArrowRight,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  consumeOAuthSessionFromUrl,
  getStoredSession,
  isSupabaseConfigured,
  loadDiaryData,
  refreshSession,
  saveDiaryData,
  signInWithGoogle,
  signInWithPassword,
  signOut as clearSupabaseSession,
  signUpWithPassword,
} from "./supabaseClient";

const BLUE = "#3577DE";
const LEGACY_STORAGE_KEY = "adhdiary_mobile_app_v1";
const STORAGE_KEY = "adhdeeds_mobile_app_v1";

const DEFAULT_CATEGORIES = [];
const LEGACY_SAMPLE_TASK_NAMES = new Set([
  "HDI email",
  "Order contact lenses",
  "Roland onboarding sessions",
  "Call my GP",
  "Organise Hartford call",
  "Send QBE DocuSign",
  "Find styles for holiday / summer",
  "Find bridge for water pipe",
  "Submit PSA application",
]);
const LEGACY_SAMPLE_HABIT_IDS = new Set(["sleep", "dogs", "clothes", "office"]);
const LEGACY_SAMPLE_HABIT_NAMES = new Set([
  "7+ hours sleep",
  "Walk the dogs",
  "Clean clothes put away",
  "Go into the office",
]);
const LEGACY_DEFAULT_CATEGORIES = new Set(["Work", "Personal", "Home", "Health", "Family", "Finance"]);
const POINT_OPTIONS = [
  { label: "Quick", value: 5 },
  { label: "Standard", value: 10 },
  { label: "Bigger task", value: 20 },
];
const HABIT_POINT_OPTIONS = [5, 10, 15, 20];
const HABIT_MODES = [
  { label: "Daily", value: "daily" },
  { label: "Optional", value: "optional" },
  { label: "Weekly", value: "weekly" },
];

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function isoDate(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}
function pretty(date, options = { day: "numeric", month: "short" }) {
  return date.toLocaleDateString("en-GB", options);
}
function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}
function categoryStyle(category) {
  const styles = {
    Work: "bg-blue-50 text-blue-700",
    Personal: "bg-violet-50 text-violet-700",
    Home: "bg-emerald-50 text-emerald-700",
    Health: "bg-amber-50 text-amber-700",
    Family: "bg-rose-50 text-rose-700",
    Finance: "bg-slate-100 text-slate-700",
  };
  return styles[category] || styles.Personal;
}
function seedData() {
  return {
    tasks: [],
    habits: [],
    categories: DEFAULT_CATEGORIES,
  };
}
function normalizeData(raw) {
  const fallback = seedData();
  if (!raw || typeof raw !== "object") return fallback;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.filter((task) => !LEGACY_SAMPLE_TASK_NAMES.has(task.name))
    : [];
  const habits = Array.isArray(raw.habits)
    ? raw.habits.filter((habit) => !LEGACY_SAMPLE_HABIT_IDS.has(habit.id) && !LEGACY_SAMPLE_HABIT_NAMES.has(habit.name))
    : [];
  const taskCategories = tasks.map((task) => task.category).filter(Boolean);
  const rawCategories = Array.isArray(raw.categories) ? raw.categories : taskCategories;
  const categories = rawCategories.filter((category) => !LEGACY_DEFAULT_CATEGORIES.has(category));
  return {
    tasks,
    habits,
    categories: [...new Set(categories)].sort((a, b) => a.localeCompare(b)),
  };
}
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeData(JSON.parse(saved));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      return normalizeData(JSON.parse(legacy));
    }
    return seedData();
  } catch {
    return seedData();
  }
}

function sortPriority(tasks) {
  return [...tasks].sort((a, b) => Number(b.important) - Number(a.important) || b.points - a.points || a.date.localeCompare(b.date));
}

function breakDownTask(name, category, date, points) {
  const lower = name.toLowerCase();
  const quick = Math.max(5, Math.min(10, Math.round(points / 2)));
  if (lower.includes("call") || lower.includes("gp") || lower.includes("phone")) {
    return ["Find the number or contact page", "Write the 3 things to ask", `Make the call about ${name}`].map((item) => ({ name: item, category, date, points: quick, important: false }));
  }
  if (lower.includes("email") || lower.includes("send") || lower.includes("docusign")) {
    return ["Open the right thread or document", "Draft the shortest acceptable message", `Send: ${name}`].map((item) => ({ name: item, category, date, points: quick, important: false }));
  }
  if (lower.includes("application") || lower.includes("form") || lower.includes("submit")) {
    return ["Open the form and scan the sections", "Gather the missing details", `Submit: ${name}`].map((item) => ({ name: item, category, date, points: quick, important: false }));
  }
  if (lower.includes("find") || lower.includes("order") || lower.includes("buy")) {
    return ["Choose where to look first", "Pick one good enough option", `Finish: ${name}`].map((item) => ({ name: item, category, date, points: quick, important: false }));
  }
  return [`Open or prepare ${name}`, `Do the smallest visible step for ${name}`, `Finish: ${name}`].map((item) => ({ name: item, category, date, points: quick, important: false }));
}

function reframeTask(task) {
  const lower = task.name.toLowerCase();
  if (lower.includes("call")) return { firstStep: `Write the first sentence for ${task.name}`, note: "You do not have to finish the whole thing. Start by making the call easier to begin." };
  if (lower.includes("submit") || lower.includes("application")) return { firstStep: `Open ${task.name} and find the first required field`, note: "This only needs to become visible. Completion can come after the first field is less mysterious." };
  if (lower.includes("send") || lower.includes("email")) return { firstStep: `Write a rough two-line draft for ${task.name}`, note: "Messy draft first. Polished message second." };
  if (lower.includes("find") || lower.includes("order")) return { firstStep: `Set a 10 minute search for ${task.name}`, note: "The goal is one acceptable option, not the perfect option." };
  return { firstStep: `Spend 10 minutes starting ${task.name}`, note: "Make the task smaller than your resistance to it." };
}

function buildDailyPlan(today, tasks, habits, energy) {
  const todayKey = isoDate(today);
  const openTasks = sortPriority(tasks.filter((task) => task.date === todayKey && !task.done));
  const limit = energy === "low" ? 2 : energy === "push" ? 5 : 3;
  const chosen = openTasks.slice(0, limit);
  const habit = habits.find((item) => !item.ticks[todayKey]);
  const plan = chosen.map((task) => `${task.name} (${task.points} pts)`);
  if (habit) plan.push(`${habit.name} (${habit.points} pts)`);
  if (!plan.length) return ["Keep the day light: everything visible for today is already clear."];
  return plan;
}

function rescheduleMessage(task, targetDate, allTasks) {
  const openOnTarget = allTasks.filter((item) => item.date === targetDate && !item.done && item.id !== task.id);
  if (openOnTarget.length < 3) return `${task.name} moved to ${pretty(new Date(`${targetDate}T00:00:00`), { weekday: "long", day: "numeric", month: "short" })}. That day still looks manageable.`;
  const nextDay = isoDate(addDays(new Date(`${targetDate}T00:00:00`), 1));
  return `${task.name} moved, but that day already has ${openOnTarget.length} open tasks. If it feels heavy, ${pretty(new Date(`${nextDay}T00:00:00`), { weekday: "long" })} may be kinder.`;
}

function Ring({ value, size = 70, dark = false }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className="relative grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${dark ? "#fff" : BLUE} ${clamped}%, ${dark ? "rgba(255,255,255,.18)" : "#E7EDF6"} 0)`,
      }}
    >
      <div
        className={`absolute rounded-full ${dark ? "bg-[#112849]" : "bg-white"}`}
        style={{ width: size - 16, height: size - 16 }}
      />
      <span className={`relative text-sm font-bold ${dark ? "text-white" : "text-[#112849]"}`}>{clamped}%</span>
    </div>
  );
}

function TaskRow({ task, onToggle, onRemove, onEdit, onReframe, onMoveTomorrow, onMoveTomorrowPenalty, onDragStart, compact = false }) {
  return (
    <motion.div
      layout
      draggable={!!onDragStart}
      onDragStart={(event) => onDragStart?.(event, task.id)}
      className={`group relative flex items-start gap-3 rounded-xl ${compact ? "p-2" : "p-3"} ${onDragStart ? "cursor-grab active:cursor-grabbing" : ""} hover:bg-slate-50`}
    >
      <button
        onClick={(event) => { event.stopPropagation(); onToggle(task.id); }}
        aria-label={task.done ? "Mark incomplete" : "Complete task"}
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
          task.done ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 bg-white text-transparent"
        }`}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium leading-5 ${task.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyle(task.category)}`}>{task.category}</span>
          <span className="text-[11px] font-medium text-slate-400">{task.points} pts</span>
          {task.important && !task.done && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Important</span>}
        </div>
      </div>
      {(onEdit || onReframe || onMoveTomorrow || onMoveTomorrowPenalty || onRemove) && (
        <div className={`${compact ? "absolute right-1 top-1 rounded-lg bg-white/95 shadow-sm ring-1 ring-slate-200" : "flex shrink-0"} flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100`}>
          {onReframe && (
            <button onClick={(event) => { event.stopPropagation(); onReframe(task); }} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-[#3577DE]" aria-label="Reframe task" title="Reframe">
              <Sparkles size={14} />
            </button>
          )}
          {onEdit && (
            <button onClick={(event) => { event.stopPropagation(); onEdit(task); }} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#3577DE]" aria-label="Edit task" title="Edit">
              <Pencil size={14} />
            </button>
          )}
          {onMoveTomorrow && (
            <button onClick={(event) => { event.stopPropagation(); onMoveTomorrow(task.id); }} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-[#3577DE]" aria-label="Move task to tomorrow" title="Move to tomorrow">
              <ArrowRight size={15} />
            </button>
          )}
          {onMoveTomorrowPenalty && (
            <button onClick={(event) => { event.stopPropagation(); onMoveTomorrowPenalty(task.id); }} className="flex h-7 min-w-8 items-center justify-center gap-0.5 rounded-lg px-1.5 text-[11px] font-bold text-slate-400 hover:bg-amber-50 hover:text-amber-700" aria-label="Move task to tomorrow and deduct 5 points" title="Move to tomorrow, minus 5 points">
              <Minus size={12} />5
            </button>
          )}
          {onRemove && (
            <button onClick={(event) => { event.stopPropagation(); onRemove(task.id); }} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="Delete task" title="Delete">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function Header({ activeWeek, setActiveWeek, onAdd, onProfile, points }) {
  return (
    <header className="bg-[#112849] px-4 py-3 text-white sm:px-8">
      <div className="mx-auto flex max-w-none flex-wrap items-center justify-between gap-3 2xl:max-w-[1800px]">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-extrabold text-[#112849]">A</div>
          <h1 className="text-[22px] font-bold tracking-tight">ADHDeeds</h1>
        </div>
        <div className="order-3 flex w-full items-center justify-between rounded-xl bg-white/10 p-1 sm:order-none sm:w-[280px]">
          <button onClick={() => setActiveWeek(addDays(activeWeek, -7))} className="grid h-9 w-9 place-items-center rounded-lg text-blue-100 hover:bg-white/10"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-blue-200/70">Week of</div>
            <div className="text-sm font-semibold">{pretty(activeWeek, { day: "numeric", month: "long" })}</div>
          </div>
          <button onClick={() => setActiveWeek(addDays(activeWeek, 7))} className="grid h-9 w-9 place-items-center rounded-lg text-blue-100 hover:bg-white/10"><ChevronRight size={20} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-full border border-white/15 px-3 py-2 text-sm sm:block"><strong>{points}</strong> points</div>
          <button onClick={onAdd} className="flex h-10 items-center gap-2 rounded-xl bg-[#3577DE] px-3 text-sm font-semibold shadow-lg shadow-blue-950/20 hover:bg-blue-500">
            <Plus size={17} /> <span className="hidden sm:inline">Add task</span>
          </button>
          <button onClick={onProfile} className="h-10 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">Profile</button>
        </div>
      </div>
    </header>
  );
}

function AuthPanel({ session, authLoading, syncStatus, onGoogleSignIn, onSignIn, onSignOut }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    const result = await onSignIn(email, password, mode);
    if (result?.error) setMessage(result.error.message);
    else setMessage(mode === "signup" ? "Account created. You are signed in." : "");
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
        Supabase is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable synced accounts.
      </div>
    );
  }

  if (authLoading) {
    return <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/70">Checking account...</div>;
  }

  if (session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <div>
          <div className="text-sm font-bold text-[#112849]">{session.user.email}</div>
          <div className="text-xs text-slate-400">{syncStatus}</div>
        </div>
        <button onClick={onSignOut} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Sign out</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-[#112849]">Sync ADHDeeds</div>
          <div className="text-xs text-slate-400">Sign in to save tasks across devices.</div>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => setMode("signin")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "signin" ? "bg-white text-[#112849] shadow-sm" : "text-slate-500"}`}>Sign in</button>
          <button type="button" onClick={() => setMode("signup")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "signup" ? "bg-white text-[#112849] shadow-sm" : "text-slate-500"}`}>Create</button>
        </div>
      </div>
      <div className="grid gap-2">
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#3577DE]" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#3577DE]" />
        <button type="submit" className="w-full rounded-xl bg-[#3577DE] px-4 py-3 text-sm font-semibold text-white">{mode === "signup" ? "Create account" : "Sign in"}</button>
      </div>
      <button type="button" onClick={onGoogleSignIn} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Continue with Google
      </button>
      {message && <p className="mt-2 text-xs text-rose-600">{message}</p>}
    </form>
  );
}

function ProfileSheet({ open, onClose, session, authLoading, syncStatus, onGoogleSignIn, onSignIn, onSignOut }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 27, stiffness: 280 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-[#F3F6FB] px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-[#112849]">Profile</h2>
              <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500"><X size={18}/></button>
            </div>
            <AuthPanel session={session} authLoading={authLoading} syncStatus={syncStatus} onGoogleSignIn={onGoogleSignIn} onSignIn={onSignIn} onSignOut={onSignOut} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function WelcomePage({ session, authLoading, syncStatus, onGoogleSignIn, onSignIn, onSignOut }) {
  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center">
        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(420px,480px)] lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#112849] text-xl font-extrabold text-white">A</div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[#112849]">ADHDeeds</h1>
                <p className="mt-1 text-sm text-slate-500">Plan your week, move what changes, and keep the next step visible.</p>
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["Tasks", "Habits", "Week"].map((item) => (
                <div key={item} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                  <div className="text-sm font-bold text-[#112849]">{item}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">Synced and ready when you sign in.</div>
                </div>
              ))}
            </div>
          </div>
          <AuthPanel session={session} authLoading={authLoading} syncStatus={syncStatus} onGoogleSignIn={onGoogleSignIn} onSignIn={onSignIn} onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ points, taskPoints, habitPoints }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Weekly score</div>
      <div className="mt-3 flex items-end gap-1.5">
        <span className="text-4xl font-bold tracking-tight text-[#112849]">{points}</span>
        <span className="mb-1 text-sm text-slate-500">points</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{taskPoints} from tasks · {habitPoints} from habits</p>
    </div>
  );
}
function ProgressCard({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Progress</div>
        <div className="mt-3 text-lg font-bold text-[#112849]">{done} of {total}</div>
        <div className="text-xs text-slate-400">tasks completed</div>
      </div>
      <Ring value={pct} size={76} />
    </div>
  );
}
function DailyBars({ days, tasks }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">By day</div>
      <div className="mt-4 flex h-[76px] items-end justify-between gap-3">
        {days.map((day) => {
          const daily = tasks.filter((t) => t.date === isoDate(day));
          const done = daily.filter((t) => t.done).length;
          const pct = daily.length ? Math.round((done / daily.length) * 100) : 0;
          const available = daily.length ? Math.min(62, 13 + daily.length * 18) : 7;
          return (
            <div key={isoDate(day)} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="relative w-full max-w-[27px] overflow-hidden rounded-t-md bg-slate-100" style={{ height: available }}>
                <motion.div animate={{ height: `${pct}%` }} className="absolute bottom-0 w-full rounded-t-md bg-[#3577DE]" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400">{pretty(day, { weekday: "short" }).slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function NudgeCard({ task, category }) {
  return (
    <div className="rounded-2xl bg-[#112849] p-4 text-white shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-blue-200/60">Worth doing next</div>
      {category && <div className="mt-2 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold">{category}</div>}
      <div className="mt-3 text-[17px] font-semibold leading-tight">{task.name}</div>
      <p className="mt-2 text-xs leading-5 text-blue-100/70">{task.important ? "Marked important. Clearing this would make the week feel lighter." : "A good task to move forward while it is visible."}</p>
      <span className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold">{task.points} points</span>
    </div>
  );
}

function CategoryNudges({ nudges }) {
  if (!nudges.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {nudges.map(({ category, task }) => <NudgeCard key={category} category={category} task={task} />)}
    </div>
  );
}

function DailyPlanCard({ today, tasks, habits }) {
  const [energy, setEnergy] = useState("normal");
  const plan = buildDailyPlan(today, tasks, habits, energy);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#112849]"><Sparkles size={16} className="text-[#3577DE]" /> Daily plan</div>
          <p className="mt-1 text-xs text-slate-400">A realistic order for today.</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[["low", "Low"], ["normal", "Normal"], ["push", "Push"]].map(([id, label]) => (
            <button key={id} onClick={() => setEnergy(id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${energy === id ? "bg-white text-[#112849] shadow-sm" : "text-slate-500"}`}>{label}</button>
          ))}
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {plan.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-bold text-[#3577DE]">{index + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TodayView({ today, tasks, habits, onToggleTask, onToggleHabit, onEditTask, onReframeTask, onMoveTomorrow, onMoveTomorrowPenalty, nudges, points, progress }) {
  const todaysTasks = tasks.filter((t) => t.date === isoDate(today));
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-24">
      <div className="rounded-3xl bg-[#112849] p-5 text-white shadow-sm">
        <div className="flex justify-between">
          <div>
            <div className="text-xs font-medium text-blue-100/70">Today</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{pretty(today, { weekday: "long" })}</h2>
            <p className="text-sm text-blue-100/70">{pretty(today, { day: "numeric", month: "long" })}</p>
          </div>
          <Ring value={progress} size={78} dark />
        </div>
        <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-sm text-blue-100/80">
          <Flame size={16} className="text-[#6EA8FF]" /> <strong className="text-white">{points}</strong> points this week
        </div>
      </div>
      <DailyPlanCard today={today} tasks={tasks} habits={habits} />
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <h3 className="text-sm font-bold text-[#112849]">Today’s tasks</h3>
          <span className="text-xs text-slate-400">{todaysTasks.filter((t) => t.done).length} / {todaysTasks.length} complete</span>
        </div>
        <div className="divide-y divide-slate-100">
          {todaysTasks.length ? todaysTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={onToggleTask}
              onEdit={onEditTask}
              onReframe={onReframeTask}
              onMoveTomorrow={onMoveTomorrow}
              onMoveTomorrowPenalty={onMoveTomorrowPenalty}
            />
          )) : <p className="p-4 text-sm text-slate-400">Nothing planned today.</p>}
        </div>
      </div>
      <CategoryNudges nudges={nudges} />
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <h3 className="mb-3 text-sm font-bold text-[#112849]">Today’s habits</h3>
        <div className="space-y-2">
          {habits.map((habit) => {
            const checked = !!habit.ticks[isoDate(today)];
            return (
              <button key={habit.id} onClick={() => onToggleHabit(habit.id, isoDate(today))} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50">
                <span className={`grid h-6 w-6 place-items-center rounded-lg border ${checked ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 text-transparent"}`}><Check size={15} strokeWidth={3} /></span>
                <div className="flex-1"><div className="text-sm font-medium text-slate-800">{habit.name}</div><div className="text-[11px] text-slate-400">{habit.detail}</div></div>
                <span className="text-xs font-semibold text-slate-400">{habit.points} pts</span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function DayCard({ day, tasks, onToggle, onEdit, onReframe, onMoveTomorrow, onMoveTomorrowPenalty, onDropTask, onDragTask, today }) {
  const [dragOver, setDragOver] = useState(false);
  const completed = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const isToday = isoDate(day) === isoDate(today);
  const dayKey = isoDate(day);
  return (
    <motion.article
      layout
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        onDropTask(event.dataTransfer.getData("text/plain"), dayKey);
      }}
      className={`min-w-[300px] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition sm:min-w-[330px] lg:min-w-0 ${dragOver ? "ring-2 ring-[#3577DE]" : isToday ? "ring-2 ring-[#3577DE]" : "ring-slate-200/70"}`}
    >
      <div className={`${isToday ? "bg-[#3577DE]" : "bg-[#112849]"} flex justify-between px-4 py-3.5 text-white`}>
        <div>
          <div className="text-[13px] font-bold uppercase tracking-wide">{pretty(day, { weekday: "long" })}</div>
          <div className="mt-1 text-xs text-blue-100/75">{pretty(day)}{isToday ? " · Today" : ""}</div>
        </div>
        <span className="text-sm font-semibold">{pct}%</span>
      </div>
      <div className="p-3">
        <div className="my-1 flex justify-center pb-3"><Ring value={pct} size={70} /></div>
        <div className="min-h-[188px] divide-y divide-slate-100">
          {tasks.length ? tasks.map((task) => (
            <TaskRow
              key={task.id}
              compact
              task={task}
              onToggle={onToggle}
              onEdit={onEdit}
              onReframe={onReframe}
              onMoveTomorrow={onMoveTomorrow}
              onMoveTomorrowPenalty={onMoveTomorrowPenalty}
              onDragStart={onDragTask}
            />
          )) : <div className="pt-8 text-center text-xs text-slate-400">Drop tasks here</div>}
        </div>
      </div>
    </motion.article>
  );
}
function WeekView({ days, tasks, onToggle, onEdit, onReframe, onMoveTomorrow, onMoveTomorrowPenalty, onMoveTask, today, points, taskPoints, habitPoints, nudges }) {
  const done = tasks.filter((t) => t.done).length;
  function dragTask(event, taskId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 pb-24">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <ScoreCard points={points} taskPoints={taskPoints} habitPoints={habitPoints} />
        <ProgressCard done={done} total={tasks.length} />
        <DailyBars days={days} tasks={tasks} />
      </div>
      <CategoryNudges nudges={nudges} />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-[#112849]">This week</h2>
        <div className="text-xs text-slate-400">Drag tasks between days</div>
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-7 lg:gap-3 lg:overflow-visible lg:px-0">
        {days.map((day) => (
          <div className="snap-start lg:min-w-0" key={isoDate(day)}>
            <DayCard
              day={day}
              tasks={tasks.filter((t) => t.date === isoDate(day))}
              onToggle={onToggle}
              onEdit={onEdit}
              onReframe={onReframe}
              onMoveTomorrow={onMoveTomorrow}
              onMoveTomorrowPenalty={onMoveTomorrowPenalty}
              onDropTask={(taskId, date) => onMoveTask(taskId, date)}
              onDragTask={dragTask}
              today={today}
            />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function HabitsView({ days, habits, onToggle, onAdd, onEdit, onRemove }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-24">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#112849]">Habits</h2>
          <p className="mt-1 text-sm text-slate-500">Small things worth keeping visible.</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-1 rounded-xl bg-[#3577DE] px-3 py-2 text-sm font-semibold text-white"><Plus size={16}/> Add</button>
      </div>
      {habits.map((habit) => {
        const completed = days.filter((day) => habit.ticks[isoDate(day)]).length;
        const target = habit.mode === "weekly" ? 1 : 7;
        const pct = Math.min(100, Math.round((completed / target) * 100));
        return (
          <div key={habit.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-semibold text-[#112849]">{habit.name}</h3><p className="mt-1 text-xs text-slate-400">{habit.detail} · {habit.points} points</p></div>
              <div className="flex items-start gap-2">
                <div className="text-right"><div className="text-lg font-bold text-[#112849]">{completed} / {target}</div><div className="text-[11px] text-slate-400">this week</div></div>
                <div className="flex rounded-xl bg-slate-50 p-1">
                  <button onClick={() => onEdit(habit)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-[#3577DE]" aria-label="Edit habit" title="Edit habit"><Pencil size={15} /></button>
                  <button onClick={() => onRemove(habit.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-500" aria-label="Delete habit" title="Delete habit"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-between gap-2">
              {days.map((day) => {
                const on = !!habit.ticks[isoDate(day)];
                return (
                  <button key={isoDate(day)} onClick={() => onToggle(habit.id, isoDate(day))} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase text-slate-400">{pretty(day, { weekday: "short" }).slice(0, 3)}</span>
                    <span className={`grid h-9 w-9 place-items-center rounded-xl border transition ${on ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-200 bg-slate-50 text-transparent"}`}><Check size={18} strokeWidth={3} /></span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><motion.div animate={{ width: `${pct}%` }} className="h-full rounded-full bg-[#3577DE]" /></div>
          </div>
        );
      })}
      {!habits.length && <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm ring-1 ring-slate-200/70">No habits yet.</div>}
    </motion.div>
  );
}

function AllTasksView({ tasks, categories, onAddCategory, onToggle, onRemove, onAdd, onEdit, onReframe, onMoveTomorrow, onMoveTomorrowPenalty }) {
  const [filter, setFilter] = useState("All");
  const visible = filter === "All" ? tasks : tasks.filter((task) => task.category === filter);
  const sortedTasks = [...visible].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-24">
      <div className="flex items-end justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight text-[#112849]">Tasks</h2><p className="mt-1 text-sm text-slate-500">Everything on your board.</p></div>
        <button onClick={onAdd} className="hidden items-center gap-1 rounded-xl bg-[#3577DE] px-3 py-2 text-sm font-semibold text-white sm:flex"><Plus size={16}/> Add</button>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Categories</span>
        <button onClick={() => setFilter("All")} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${filter === "All" ? "bg-[#112849] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>All</button>
        {categories.map((cat) => <button key={cat} onClick={() => setFilter(cat)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${filter === cat ? "bg-[#112849] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{cat}</button>)}
        <button onClick={onAddCategory} className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100"><Plus size={14} /> Add Category</button>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70">
        {sortedTasks.map((task) => (
          <div key={task.id} className="border-b border-slate-100 last:border-b-0">
            <div className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{new Date(task.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</div>
            <TaskRow task={task} onToggle={onToggle} onRemove={onRemove} onEdit={onEdit} onReframe={onReframe} onMoveTomorrow={onMoveTomorrow} onMoveTomorrowPenalty={onMoveTomorrowPenalty} />
          </div>
        ))}
        {!visible.length && <div className="p-8 text-center text-sm text-slate-400">No tasks here.</div>}
      </div>
    </motion.div>
  );
}

function AddTaskSheet({ open, onClose, onSave, onUpdate, days, task, categories, onAddCategory }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0] || "");
  const [date, setDate] = useState(isoDate(days[0]));
  const [points, setPoints] = useState(10);
  const [important, setImportant] = useState(false);
  const [breakdown, setBreakdown] = useState([]);
  useEffect(() => {
    if (!open) return;
    setName(task?.name || "");
    setCategory(task?.category || categories[0] || "");
    setDate(task?.date || isoDate(days[0]));
    setPoints(task?.points || 10);
    setImportant(!!task?.important);
    setBreakdown([]);
  }, [open, days, task]);
  useEffect(() => {
    if (open && !category && categories.length) setCategory(categories[0]);
  }, [open, category, categories]);
  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    if (task) {
      onUpdate({ ...task, name: name.trim(), category, date, points, important });
    } else {
      onSave({ id: `task-${Date.now()}`, name: name.trim(), category, date, points, done: false, important });
    }
    setName(""); setCategory(categories[0] || ""); setPoints(10); setImportant(false); onClose();
  }
  function createBreakdown() {
    if (!name.trim()) return;
    setBreakdown(breakDownTask(name.trim(), category, date, points));
  }
  function addBreakdownTasks() {
    breakdown.forEach((item, index) => onSave({ ...item, id: `task-${Date.now()}-${index}`, done: false }));
    onClose();
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.form onSubmit={submit} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 27, stiffness: 280 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight text-[#112849]">{task ? "Edit task" : "Add a task"}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={18}/></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Task</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What needs doing?" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <button type="button" onClick={createBreakdown} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 py-3 text-sm font-semibold text-[#112849]"><Sparkles size={16} /> Break into smaller tasks</button>
              {!!breakdown.length && (
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested subtasks</div>
                  <div className="space-y-2">
                    {breakdown.map((item) => <div key={item.name} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">{item.name}</div>)}
                  </div>
                  <button type="button" onClick={addBreakdownTasks} className="mt-3 w-full rounded-xl bg-[#112849] py-2.5 text-sm font-semibold text-white">Add these tasks</button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Category</span><select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!categories.length} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400">{categories.length ? categories.map((item) => <option key={item}>{item}</option>) : <option>Create a category first</option>}</select></label>
                <label><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Day</span><select value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">{days.map((day) => <option key={isoDate(day)} value={isoDate(day)}>{pretty(day, { weekday: "short", day: "numeric", month: "short" })}</option>)}</select></label>
              </div>
              {!categories.length && <button type="button" onClick={onAddCategory} className="w-full rounded-xl bg-blue-50 py-3 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100">Add Category</button>}
              <div className="grid grid-cols-3 gap-2">{POINT_OPTIONS.map((option) => <button type="button" key={option.value} onClick={() => setPoints(option.value)} className={`rounded-xl border px-2 py-3 text-center ${points === option.value ? "border-[#3577DE] bg-blue-50 text-[#112849]" : "border-slate-200 text-slate-500"}`}><span className="block text-xs font-semibold">{option.label}</span><span className="mt-1 block text-[11px]">{option.value} pts</span></button>)}</div>
              <button type="button" onClick={() => setImportant(!important)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left"><span className={`grid h-5 w-5 place-items-center rounded-md border ${important ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 text-transparent"}`}><Check size={13} /></span><span className="text-sm text-slate-700">Mark as important</span></button>
              <button type="submit" disabled={!category} className="w-full rounded-xl bg-[#3577DE] py-3.5 text-sm font-semibold text-white disabled:bg-slate-300">{task ? "Save changes" : "Add task"}</button>
            </div>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}

function HabitSheet({ open, onClose, onSave, onUpdate, habit }) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [points, setPoints] = useState(5);
  const [mode, setMode] = useState("daily");

  useEffect(() => {
    if (!open) return;
    setName(habit?.name || "");
    setDetail(habit?.detail || "");
    setPoints(habit?.points || 5);
    setMode(habit?.mode || "daily");
  }, [open, habit]);

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const payload = {
      id: habit?.id || `habit-${Date.now()}`,
      name: name.trim(),
      detail: detail.trim() || (mode === "weekly" ? "Once each week" : "Daily goal"),
      points,
      mode,
      ticks: habit?.ticks || {},
    };
    if (habit) onUpdate(payload);
    else onSave(payload);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.form onSubmit={submit} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 27, stiffness: 280 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight text-[#112849]">{habit ? "Edit habit" : "Add a habit"}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={18}/></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Habit</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you want to keep visible?" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Detail</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Daily goal, weekly target, or a note" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Mode</span><select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">{HABIT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Points</span><select value={points} onChange={(e) => setPoints(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">{HABIT_POINT_OPTIONS.map((item) => <option key={item} value={item}>{item} pts</option>)}</select></label>
              </div>
              <button type="submit" className="w-full rounded-xl bg-[#3577DE] py-3.5 text-sm font-semibold text-white">{habit ? "Save changes" : "Add habit"}</button>
            </div>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}

function CategorySheet({ open, onClose, onSave }) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.form onSubmit={submit} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 27, stiffness: 280 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight text-[#112849]">Add Category</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={18}/></button></div>
            <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Category name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work, Health, Admin" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
            <button type="submit" className="mt-4 w-full rounded-xl bg-[#3577DE] py-3.5 text-sm font-semibold text-white">Add Category</button>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}

function AISheet({ insight, onClose, onAddFirstStep }) {
  return (
    <AnimatePresence>
      {insight && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 27, stiffness: 280 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between"><h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#112849]"><Sparkles size={20} className="text-[#3577DE]" /> {insight.title}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={18}/></button></div>
            <p className="text-sm leading-6 text-slate-600">{insight.note}</p>
            {insight.firstStep && (
              <div className="mt-4 rounded-2xl bg-blue-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-500">First step</div>
                <div className="mt-2 text-sm font-semibold text-[#112849]">{insight.firstStep}</div>
                <button onClick={onAddFirstStep} className="mt-4 w-full rounded-xl bg-[#3577DE] py-3 text-sm font-semibold text-white">Add first step as task</button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function AIToast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-2xl bg-[#112849] p-4 text-white shadow-xl sm:bottom-6">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-[#6EA8FF]" />
        <p className="flex-1 text-sm leading-5 text-blue-50">{message}</p>
        <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10"><X size={14} /></button>
      </div>
    </div>
  );
}

function BottomNav({ view, setView, onAdd }) {
  const tabs = [
    { id: "today", label: "Today", icon: Home },
    { id: "week", label: "Week", icon: CalendarDays },
    { id: "add", label: "", icon: CirclePlus },
    { id: "habits", label: "Habits", icon: Flame },
    { id: "tasks", label: "Tasks", icon: BarChart3 },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-center justify-around border-t border-slate-200 bg-white/95 px-3 pb-[max(.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
      {tabs.map(({ id, label, icon: Icon }) => id === "add" ? (
        <button key={id} onClick={onAdd} className="-mt-8 grid h-14 w-14 place-items-center rounded-full bg-[#3577DE] text-white shadow-lg shadow-blue-300"><Plus size={25}/></button>
      ) : (
        <button key={id} onClick={() => setView(id)} className={`flex min-w-[52px] flex-col items-center gap-1 text-[10px] font-semibold ${view === id ? "text-[#3577DE]" : "text-slate-400"}`}><Icon size={21}/><span>{label}</span></button>
      ))}
    </nav>
  );
}

export default function ADHDeedsApp() {
  const [data, setData] = useState(loadData);
  const [activeWeek, setActiveWeek] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState("today");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [habitSheetOpen, setHabitSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [aiInsight, setAiInsight] = useState(null);
  const [rescheduleAdvice, setRescheduleAdvice] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? "Not signed in" : "Local only");
  const saveTimer = useRef(null);
  const today = new Date();
  const days = useMemo(() => weekDays(activeWeek), [activeWeek]);
  const weekTasks = useMemo(() => data.tasks.filter((task) => task.date >= isoDate(days[0]) && task.date <= isoDate(days[6])), [data.tasks, days]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    async function initialiseAuth() {
      const oauthSession = await consumeOAuthSessionFromUrl();
      let savedSession = oauthSession || getStoredSession();
      if (savedSession && !oauthSession) {
        const refreshed = await refreshSession(savedSession);
        savedSession = refreshed.data?.session || null;
      }
      setSession(savedSession);
      setAuthLoading(false);
      setCloudReady(!savedSession);
      setSyncStatus(savedSession ? "Loading cloud data..." : "Not signed in");
    }
    initialiseAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    let cancelled = false;
    async function loadCloudData() {
      setCloudReady(false);
      setSyncStatus("Loading cloud data...");
      const { data: remoteData, error, session: refreshedSession } = await loadDiaryData(session);
      if (cancelled) return;
      if (refreshedSession?.access_token !== session.access_token) setSession(refreshedSession);
      if (error) {
        setSyncStatus(`Sync error: ${error.message}`);
        setCloudReady(true);
        return;
      }
      if (remoteData?.tasks && remoteData?.habits) {
        setData(normalizeData(remoteData));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
        setSyncStatus("Synced");
      } else {
        const localData = loadData();
        await saveDiaryData(session, localData);
        setData(localData);
        setSyncStatus("Local data uploaded");
      }
      setCloudReady(true);
    }
    loadCloudData();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session || !cloudReady) return;
    setSyncStatus("Saving...");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error, session: refreshedSession } = await saveDiaryData(session, data);
      if (refreshedSession?.access_token !== session.access_token) setSession(refreshedSession);
      setSyncStatus(error ? `Sync error: ${error.message}` : "Synced");
    }, 650);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, session?.user?.id, cloudReady]);

  const completed = weekTasks.filter((task) => task.done);
  const taskPoints = completed.reduce((sum, task) => sum + task.points, 0);
  const habitPoints = data.habits.reduce((sum, habit) => sum + days.filter((day) => habit.ticks[isoDate(day)]).length * habit.points, 0);
  const points = taskPoints + habitPoints;
  const todayTasks = weekTasks.filter((task) => task.date === isoDate(today));
  const todayProgress = todayTasks.length ? Math.round((todayTasks.filter((task) => task.done).length / todayTasks.length) * 100) : 0;
  const categories = data.categories || [];
  const categoryNudges = categories.map((category) => {
    const task = [...weekTasks]
      .filter((item) => item.category === category && !item.done)
      .sort((a, b) => Number(b.important) - Number(a.important) || b.points - a.points)[0];
    return task ? { category, task } : null;
  }).filter(Boolean);

  function toggleTask(id) { setData((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) })); }
  function removeTask(id) { setData((old) => ({ ...old, tasks: old.tasks.filter((task) => task.id !== id) })); }
  function addTask(task) { setData((old) => ({ ...old, tasks: [...old.tasks, task] })); }
  function updateTask(updatedTask) { setData((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === updatedTask.id ? updatedTask : task) })); }
  function openAddTask() {
    setEditingTask(null);
    setSheetOpen(true);
  }
  function openEditTask(task) {
    setEditingTask(task);
    setSheetOpen(true);
  }
  function closeSheet() {
    setSheetOpen(false);
    setEditingTask(null);
  }
  function moveTask(id, date, penalize = false) {
    if (!id || !date) return;
    const currentTask = data.tasks.find((task) => task.id === id);
    if (currentTask) setRescheduleAdvice(rescheduleMessage(currentTask, date, data.tasks));
    setData((old) => ({
      ...old,
      tasks: old.tasks.map((task) => {
        if (task.id !== id) return task;
        return {
          ...task,
          date,
          points: penalize ? Math.max(0, task.points - 5) : task.points,
        };
      }),
    }));
  }
  function moveTaskToTomorrow(id, penalize = false) {
    const task = data.tasks.find((item) => item.id === id);
    if (!task) return;
    moveTask(id, isoDate(addDays(new Date(`${task.date}T00:00:00`), 1)), penalize);
  }
  function toggleHabit(id, date) {
    setData((old) => ({ ...old, habits: old.habits.map((habit) => habit.id === id ? { ...habit, ticks: { ...habit.ticks, [date]: !habit.ticks[date] } } : habit) }));
  }
  function openAddHabit() {
    setEditingHabit(null);
    setHabitSheetOpen(true);
  }
  function openEditHabit(habit) {
    setEditingHabit(habit);
    setHabitSheetOpen(true);
  }
  function closeHabitSheet() {
    setHabitSheetOpen(false);
    setEditingHabit(null);
  }
  function addHabit(habit) {
    setData((old) => ({ ...old, habits: [...old.habits, habit] }));
  }
  function updateHabit(updatedHabit) {
    setData((old) => ({ ...old, habits: old.habits.map((habit) => habit.id === updatedHabit.id ? updatedHabit : habit) }));
  }
  function removeHabit(id) {
    setData((old) => ({ ...old, habits: old.habits.filter((habit) => habit.id !== id) }));
  }
  function addCategory(name) {
    setData((old) => {
      const existing = old.categories || [];
      if (existing.some((category) => category.toLowerCase() === name.toLowerCase())) return old;
      return { ...old, categories: [...existing, name].sort((a, b) => a.localeCompare(b)) };
    });
  }
  function openReframeTask(task) {
    setAiInsight({
      task,
      title: "Kind reframe",
      ...reframeTask(task),
    });
  }
  function addFirstStepTask() {
    if (!aiInsight?.task || !aiInsight.firstStep) return;
    addTask({
      id: `task-${Date.now()}`,
      name: aiInsight.firstStep,
      category: aiInsight.task.category,
      date: aiInsight.task.date,
      points: 5,
      done: false,
      important: false,
    });
    setAiInsight(null);
  }
  async function signIn(email, password, mode) {
    if (!isSupabaseConfigured) return { error: new Error("Supabase is not configured.") };
    const result = mode === "signup"
      ? await signUpWithPassword(email, password)
      : await signInWithPassword(email, password);
    if (result.data?.session) {
      setSession(result.data.session);
      setCloudReady(false);
      setSyncStatus("Loading cloud data...");
    }
    if (result.needsConfirmation) {
      return { error: new Error("Check your email to confirm the account, then sign in.") };
    }
    return result;
  }
  async function signOut() {
    clearSupabaseSession();
    setSession(null);
    setCloudReady(true);
    setSyncStatus("Not signed in");
  }

  if (authLoading || !session) {
    return (
      <WelcomePage
        session={session}
        authLoading={authLoading}
        syncStatus={syncStatus}
        onGoogleSignIn={signInWithGoogle}
        onSignIn={signIn}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F6FB] font-sans text-slate-900">
      <Header activeWeek={activeWeek} setActiveWeek={setActiveWeek} onAdd={openAddTask} onProfile={() => setProfileOpen(true)} points={points} />
      <main className={`mx-auto px-4 py-5 sm:px-8 sm:py-7 ${view === "week" ? "max-w-none 2xl:max-w-[1800px]" : "max-w-7xl"}`}>
        <div className="hidden gap-2 pb-6 sm:flex">
          {[{id:"today",label:"Today"},{id:"week",label:"Week"},{id:"habits",label:"Habits"},{id:"tasks",label:"All tasks"}].map((tab) => (
            <button key={tab.id} onClick={() => setView(tab.id)} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${view === tab.id ? "bg-[#112849] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{tab.label}</button>
          ))}
        </div>
        {view === "today" && <TodayView today={today} tasks={weekTasks} habits={data.habits} onToggleTask={toggleTask} onToggleHabit={toggleHabit} onEditTask={openEditTask} onReframeTask={openReframeTask} onMoveTomorrow={(id) => moveTaskToTomorrow(id)} onMoveTomorrowPenalty={(id) => moveTaskToTomorrow(id, true)} nudges={categoryNudges} points={points} progress={todayProgress} />}
        {view === "week" && <WeekView days={days} tasks={weekTasks} onToggle={toggleTask} onEdit={openEditTask} onReframe={openReframeTask} onMoveTomorrow={(id) => moveTaskToTomorrow(id)} onMoveTomorrowPenalty={(id) => moveTaskToTomorrow(id, true)} onMoveTask={moveTask} today={today} points={points} taskPoints={taskPoints} habitPoints={habitPoints} nudges={categoryNudges} />}
        {view === "habits" && <HabitsView days={days} habits={data.habits} onToggle={toggleHabit} onAdd={openAddHabit} onEdit={openEditHabit} onRemove={removeHabit} />}
        {view === "tasks" && <AllTasksView tasks={weekTasks} categories={categories} onAddCategory={() => setCategorySheetOpen(true)} onToggle={toggleTask} onRemove={removeTask} onAdd={openAddTask} onEdit={openEditTask} onReframe={openReframeTask} onMoveTomorrow={(id) => moveTaskToTomorrow(id)} onMoveTomorrowPenalty={(id) => moveTaskToTomorrow(id, true)} />}
      </main>
      <BottomNav view={view} setView={setView} onAdd={openAddTask} />
      <AddTaskSheet open={sheetOpen} onClose={closeSheet} onSave={addTask} onUpdate={updateTask} days={days} task={editingTask} categories={categories} onAddCategory={() => setCategorySheetOpen(true)} />
      <HabitSheet open={habitSheetOpen} onClose={closeHabitSheet} onSave={addHabit} onUpdate={updateHabit} habit={editingHabit} />
      <CategorySheet open={categorySheetOpen} onClose={() => setCategorySheetOpen(false)} onSave={addCategory} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} session={session} authLoading={authLoading} syncStatus={syncStatus} onGoogleSignIn={signInWithGoogle} onSignIn={signIn} onSignOut={signOut} />
      <AISheet insight={aiInsight} onClose={() => setAiInsight(null)} onAddFirstStep={addFirstStepTask} />
      <AIToast message={rescheduleAdvice} onClose={() => setRescheduleAdvice("")} />
    </div>
  );
}
