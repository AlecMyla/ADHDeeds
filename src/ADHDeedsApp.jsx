import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Flame,
  Home,
  Minus,
  Pencil,
  Plus,
  ArrowRight,
  ListChecks,
  Settings2,
  Sparkles,
  SquarePen,
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
import { askAI } from "./aiClient";

const BLUE = "#3577DE";
const LEGACY_STORAGE_KEY = "adhdiary_mobile_app_v1";
const STORAGE_KEY = "adhdeeds_mobile_app_v1";
const NOTIFICATIONS_KEY = "adhdeeds_notifications_enabled_v1";
const NOTIFIED_DATE_KEY = "adhdeeds_notified_date_v1";

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
const RECURRENCE_OPTIONS = [
  { label: "Does not repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];
const TODAY_SECTION_ORDER = ["plan", "considerations", "tasks", "dumpster", "nudges", "habits"];
const WEEK_SECTION_ORDER = ["stats", "nudges", "tasks"];
const SECTION_WIDTHS = ["full", "half"];
const FEATURE_OPTIONS = [
  { id: "stats", label: "Stats" },
  { id: "dailyPlan", label: "Daily plan" },
  { id: "habitsInDailyPlan", label: "Habits in daily plan", sub: true },
  { id: "worthNext", label: "Worth doing next" },
  { id: "brainDumpster", label: "Brain Dumpster" },
];
const BETA_FEATURE_OPTIONS = [
  { id: "todaysConsiderations", label: "Today's Considerations", beta: true },
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
function normalizeWebsite(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
function normalizeChecklist(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const text = String(item?.text || item || "").trim();
      if (!text) return null;
      return {
        id: item?.id || `check-${Date.now()}-${index}`,
        text,
        done: !!item?.done,
      };
    })
    .filter(Boolean);
}
function checklistStats(task) {
  const checklist = normalizeChecklist(task?.checklist);
  return {
    total: checklist.length,
    done: checklist.filter((item) => item.done).length,
  };
}
function normalizeSectionWidths(raw, allowedSections) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([id, width]) => allowedSections.includes(id) && SECTION_WIDTHS.includes(width))
  );
}
function sectionWidthClass(id, widths, extra = "") {
  return `${widths?.[id] === "half" ? "lg:col-span-1" : "lg:col-span-2"} ${extra}`;
}
function pretty(date, options = { day: "numeric", month: "short" }) {
  return date.toLocaleDateString("en-GB", options);
}
function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}
function daysBetween(startDate, targetDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  return Math.round((target - start) / 86400000);
}
function recurrenceMatches(template, dateKey) {
  if (dateKey < template.startDate) return false;
  if (template.skippedDates?.includes(dateKey)) return false;
  const gap = daysBetween(template.startDate, dateKey);
  if (template.frequency === "daily") return gap >= 0;
  if (template.frequency === "weekly") return gap >= 0 && gap % 7 === 0;
  if (template.frequency === "monthly") {
    return new Date(`${template.startDate}T00:00:00`).getDate() === new Date(`${dateKey}T00:00:00`).getDate();
  }
  return false;
}
function taskFromRecurring(template, dateKey) {
  return {
    id: `task-${template.id}-${dateKey}`,
    recurringId: template.id,
    name: template.name,
    category: template.category,
    date: dateKey,
    points: template.points,
    done: false,
    important: template.important,
    notes: template.notes || "",
    website: template.website || "",
    checklist: normalizeChecklist(template.checklist),
  };
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
    brainDump: [],
    categories: DEFAULT_CATEGORIES,
    recurringTasks: [],
    ui: { todayOrder: TODAY_SECTION_ORDER, weekOrder: WEEK_SECTION_ORDER, todayWidths: {}, weekWidths: {}, hiddenFeatures: [], enabledFeatures: [] },
  };
}
function normalizeData(raw) {
  const fallback = seedData();
  if (!raw || typeof raw !== "object") return fallback;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
      .filter((task) => !LEGACY_SAMPLE_TASK_NAMES.has(task.name))
      .map((task) => ({ ...task, checklist: normalizeChecklist(task.checklist) }))
    : [];
  const habits = Array.isArray(raw.habits)
    ? raw.habits.filter((habit) => !LEGACY_SAMPLE_HABIT_IDS.has(habit.id) && !LEGACY_SAMPLE_HABIT_NAMES.has(habit.name))
    : [];
  const brainDump = Array.isArray(raw.brainDump)
    ? raw.brainDump.filter((item) => item?.text).map((item) => ({
      id: item.id || `dump-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: String(item.text).trim(),
      createdAt: item.createdAt || new Date().toISOString(),
    }))
    : [];
  const taskCategories = tasks.map((task) => task.category).filter(Boolean);
  const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
  const recurringTasks = Array.isArray(raw.recurringTasks)
    ? raw.recurringTasks
      .filter((item) => item?.id && item?.frequency && item?.startDate)
      .map((item) => ({ ...item, checklist: normalizeChecklist(item.checklist) }))
    : [];
  const todayOrder = Array.isArray(raw.ui?.todayOrder)
    ? [...raw.ui.todayOrder.filter((item) => TODAY_SECTION_ORDER.includes(item)), ...TODAY_SECTION_ORDER].filter((item, index, list) => list.indexOf(item) === index)
    : TODAY_SECTION_ORDER;
  const weekOrder = Array.isArray(raw.ui?.weekOrder)
    ? [...raw.ui.weekOrder.filter((item) => WEEK_SECTION_ORDER.includes(item)), ...WEEK_SECTION_ORDER].filter((item, index, list) => list.indexOf(item) === index)
    : WEEK_SECTION_ORDER;
  const hiddenFeatures = Array.isArray(raw.ui?.hiddenFeatures)
    ? raw.ui.hiddenFeatures.filter((item) => FEATURE_OPTIONS.some((option) => option.id === item))
    : [];
  const enabledFeatures = Array.isArray(raw.ui?.enabledFeatures)
    ? raw.ui.enabledFeatures.filter((item) => BETA_FEATURE_OPTIONS.some((option) => option.id === item))
    : [];
  const todayWidths = normalizeSectionWidths(raw.ui?.todayWidths, TODAY_SECTION_ORDER);
  const weekWidths = normalizeSectionWidths(raw.ui?.weekWidths, WEEK_SECTION_ORDER);
  const recurringCategories = recurringTasks.map((task) => task.category).filter(Boolean);
  const categories = [...rawCategories, ...taskCategories, ...recurringCategories]
    .map((category) => String(category).trim())
    .filter(Boolean)
    .filter((category) => rawCategories.includes(category) || !LEGACY_DEFAULT_CATEGORIES.has(category) || taskCategories.includes(category));
  return {
    tasks,
    habits,
    brainDump,
    recurringTasks,
    ui: { ...(raw.ui || {}), todayOrder, weekOrder, todayWidths, weekWidths, hiddenFeatures, enabledFeatures },
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

function Logo({ size = "header" }) {
  if (size === "welcome") {
    return <img src="/adhdeeds-logo.png" alt="ADHDeeds" className="h-24 w-auto max-w-full object-contain" />;
  }

  return <img src="/adhdeeds-header-logo.png" alt="ADHDeeds" className="h-12 w-auto max-w-[210px] object-contain sm:max-w-[260px]" />;
}

function TaskRow({ task, onToggle, onToggleChecklistItem, onRemove, onEdit, onReframe, onMoveTomorrow, onMoveTomorrowPenalty, onDragStart, compact = false, showWebsite = false }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeSettling, setSwipeSettling] = useState(false);
  const touchTimer = useRef(null);
  const swipeStart = useRef(null);
  const website = normalizeWebsite(task.website);
  const checklist = normalizeChecklist(task.checklist);
  const listStats = checklistStats(task);
  const hasChecklist = listStats.total > 0;
  const checklistComplete = !hasChecklist || listStats.done === listStats.total;
  function completeFromSwipe() {
    if (!task.done && hasChecklist && !checklistComplete) return;
    onToggle(task.id);
  }
  function handleTouchStart(event) {
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    setSwipeSettling(false);
  }
  function handleTouchMove(event) {
    if (!swipeStart.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - swipeStart.current.x;
    const deltaY = touch.clientY - swipeStart.current.y;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 12) return;
    const clamped = Math.max(-96, Math.min(96, deltaX));
    setSwipeOffset(clamped);
  }
  function handleTouchEnd(event) {
    if (!swipeStart.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - swipeStart.current.x;
    const deltaY = touch.clientY - swipeStart.current.y;
    swipeStart.current = null;
    setSwipeSettling(true);
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
      setSwipeOffset(0);
      return;
    }
    if (deltaX > 0) {
      if (!task.done && hasChecklist && !checklistComplete) {
        setSwipeOffset(0);
        return;
      }
      setSwipeOffset(104);
      window.setTimeout(() => {
        completeFromSwipe();
        setSwipeOffset(0);
      }, 140);
    }
    if (deltaX < 0 && onRemove) {
      setSwipeOffset(-104);
      window.setTimeout(() => onRemove(task.id), 140);
    }
    if (deltaX < 0 && !onRemove) setSwipeOffset(0);
  }
  const completeProgress = Math.min(1, Math.max(0, swipeOffset / 72));
  const deleteProgress = Math.min(1, Math.max(0, -swipeOffset / 72));
  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-xl"
    >
      <div className="absolute inset-0 flex items-center justify-between rounded-xl bg-slate-100">
        <div
          className="flex h-full min-w-24 items-center gap-2 bg-emerald-500 px-4 text-xs font-bold text-white"
          style={{ opacity: completeProgress, transform: `scale(${0.92 + completeProgress * 0.08})` }}
        >
          <Check size={17} /> Complete
        </div>
        <div
          className="flex h-full min-w-24 items-center justify-end gap-2 bg-rose-500 px-4 text-xs font-bold text-white"
          style={{ opacity: deleteProgress, transform: `scale(${0.92 + deleteProgress * 0.08})` }}
        >
          Delete <Trash2 size={17} />
        </div>
      </div>
      <motion.div
      draggable={!!onDragStart}
      onDragStart={(event) => onDragStart?.(event, task.id)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`group/task relative flex items-start gap-3 rounded-xl bg-white ${compact ? "p-2" : "p-3"} ${onDragStart ? "cursor-grab active:cursor-grabbing" : ""} hover:bg-slate-50`}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: swipeSettling ? "transform 220ms cubic-bezier(.2,1.4,.35,1)" : "none",
      }}
    >
      <button
        onClick={(event) => { event.stopPropagation(); onToggle(task.id); }}
        disabled={!task.done && hasChecklist && !checklistComplete}
        aria-label={!task.done && hasChecklist && !checklistComplete ? "Complete checklist items first" : task.done ? "Mark incomplete" : "Complete task"}
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
          task.done ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 bg-white text-transparent"
        } disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-transparent disabled:opacity-60`}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <div className={`flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5 ${task.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
          <span className="min-w-0 truncate">{task.name}</span>
          {task.notes && (
            <span className="relative inline-flex shrink-0">
              <button
                type="button"
                onMouseEnter={() => setNoteOpen(true)}
                onMouseLeave={() => setNoteOpen(false)}
                onTouchStart={() => { touchTimer.current = setTimeout(() => setNoteOpen(true), 450); }}
                onTouchEnd={() => { if (touchTimer.current) clearTimeout(touchTimer.current); }}
                onClick={(event) => { event.stopPropagation(); setNoteOpen((open) => !open); }}
                className="grid h-5 w-5 place-items-center rounded-md bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-[#3577DE]"
                aria-label="Show task note"
              >
                <SquarePen size={13} />
              </button>
              {noteOpen && (
                <span className="absolute left-0 top-6 z-20 w-56 rounded-xl bg-[#112849] p-3 text-xs font-medium leading-5 text-white shadow-xl">
                  {task.notes}
                </span>
              )}
            </span>
          )}
          {showWebsite && website && (
            <a href={website} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-blue-50 text-[#3577DE] hover:bg-blue-100" aria-label="Open task website">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyle(task.category)}`}>{task.category}</span>
          <span className="text-[11px] font-medium text-slate-400">{task.points} pts</span>
          {hasChecklist ? (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); setChecklistOpen((open) => !open); }}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#3577DE] ring-1 ring-blue-100 hover:bg-blue-100"
              aria-label={checklistOpen ? "Hide task checklist" : "Show task checklist"}
              title={checklistOpen ? "Hide checklist" : "Show checklist"}
            >
              <ListChecks size={11} /> {listStats.done}/{listStats.total}
            </button>
          ) : null}
          {task.recurringId && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Repeats</span>}
          {task.important && !task.done && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Important</span>}
        </div>
        {checklistOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-1.5 overflow-hidden rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200/70">
            {checklist.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={(event) => { event.stopPropagation(); onToggleChecklistItem?.(task.id, item.id); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white"
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${item.done ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 text-transparent"}`}><Check size={13} strokeWidth={3} /></span>
                <span className={`text-xs leading-5 ${item.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.text}</span>
              </button>
            ))}
          </motion.div>
        )}
      </div>
      {(onEdit || onReframe || onMoveTomorrow || onMoveTomorrowPenalty || onRemove) && (
        <div className={`${compact ? "absolute right-1 top-1 rounded-lg bg-white/95 shadow-sm ring-1 ring-slate-200" : "flex shrink-0"} flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover/task:opacity-100`}>
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
    </motion.div>
  );
}

function Header({ activeWeek, setActiveWeek, onProfile, points }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  function pickDate(value) {
    if (!value) return;
    setActiveWeek(startOfWeek(new Date(`${value}T00:00:00`)));
    setPickerOpen(false);
  }

  return (
    <header className="relative bg-[#112849] px-4 py-3 text-white sm:px-8">
      <div className="mx-auto grid max-w-none grid-cols-[1fr_auto] items-center gap-3 md:grid-cols-[1fr_auto_1fr] 2xl:max-w-[1800px]">
        <div className="justify-self-start"><Logo /></div>
        <div className="relative order-3 col-span-2 flex w-full items-center justify-between rounded-xl bg-white/10 p-1 md:order-none md:col-span-1 md:w-[280px] md:justify-self-center">
          <button onClick={() => setActiveWeek(addDays(activeWeek, -7))} className="grid h-9 w-9 place-items-center rounded-lg text-blue-100 hover:bg-white/10"><ChevronLeft size={20} /></button>
          <button onClick={() => setPickerOpen((open) => !open)} className="rounded-lg px-4 py-1 text-center hover:bg-white/10">
            <div className="text-[10px] uppercase tracking-widest text-blue-200/70">Week of</div>
            <div className="text-sm font-semibold">{pretty(activeWeek, { day: "numeric", month: "long" })}</div>
          </button>
          <button onClick={() => setActiveWeek(addDays(activeWeek, 7))} className="grid h-9 w-9 place-items-center rounded-lg text-blue-100 hover:bg-white/10"><ChevronRight size={20} /></button>
          {pickerOpen && (
            <div className="absolute left-1/2 top-12 z-30 w-64 -translate-x-1/2 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200">
              <div className="text-sm font-bold text-[#112849]">Jump to week</div>
              <p className="mt-1 text-xs text-slate-400">Choose any date. ADHDeeds will open that week.</p>
              <input type="date" value={isoDate(activeWeek)} onChange={(event) => pickDate(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#3577DE]" />
              <button onClick={() => setPickerOpen(false)} className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-500">Close</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <div className="rounded-full border border-white/15 px-3 py-2 text-sm"><strong>{points}</strong> points</div>
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

function ProfileSheet({ open, onClose, session, authLoading, syncStatus, notificationsEnabled, notificationSupported, hiddenFeatures, enabledFeatures, onToggleFeature, onToggleEnabledFeature, onResetLayout, onEnableNotifications, onGoogleSignIn, onSignIn, onSignOut }) {
  const [customiseOpen, setCustomiseOpen] = useState(false);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 27, stiffness: 280 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-[#F3F6FB] px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:right-8 sm:top-[76px] sm:w-[360px] sm:translate-x-0 sm:translate-y-0 sm:rounded-2xl sm:p-4">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-[#112849]">Profile</h2>
              <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500"><X size={18}/></button>
            </div>
            <AuthPanel session={session} authLoading={authLoading} syncStatus={syncStatus} onGoogleSignIn={onGoogleSignIn} onSignIn={onSignIn} onSignOut={onSignOut} />
            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
              <button onClick={() => setCustomiseOpen((open) => !open)} className="flex w-full items-center justify-between text-left">
                <span>
                  <span className="block text-sm font-bold text-[#112849]">Customise</span>
                  <span className="mt-1 block text-xs text-slate-400">Hide features or enable beta tools.</span>
                </span>
                <Settings2 size={18} className="text-slate-400" />
              </button>
              {customiseOpen && (
                <div className="mt-3 space-y-2">
                  {FEATURE_OPTIONS.map((feature) => {
                    const hidden = hiddenFeatures.includes(feature.id);
                    return (
                      <button key={feature.id} onClick={() => onToggleFeature(feature.id)} className={`flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ${feature.sub ? "ml-4 w-[calc(100%-1rem)]" : ""}`}>
                        <span>{feature.label}</span>
                        <span className={`grid h-5 w-5 place-items-center rounded-md border ${hidden ? "border-slate-300 text-transparent" : "border-[#3577DE] bg-[#3577DE] text-white"}`}><Check size={13} strokeWidth={3} /></span>
                      </button>
                    );
                  })}
                  {BETA_FEATURE_OPTIONS.map((feature) => {
                    const enabled = enabledFeatures.includes(feature.id);
                    return (
                      <button key={feature.id} onClick={() => onToggleEnabledFeature(feature.id)} className="flex w-full items-center justify-between rounded-xl bg-blue-50 px-3 py-2 text-sm text-[#112849] ring-1 ring-blue-100">
                        <span className="flex items-center gap-2">
                          {feature.label}
                          <span className="rounded-full bg-[#3577DE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Beta</span>
                        </span>
                        <span className={`grid h-5 w-5 place-items-center rounded-md border ${enabled ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 bg-white text-transparent"}`}><Check size={13} strokeWidth={3} /></span>
                      </button>
                    );
                  })}
                  <button onClick={onResetLayout} className="flex w-full items-center justify-between rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100">
                    <span>Reset screen layout</span>
                    <Settings2 size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-start gap-3">
                <Bell size={18} className="mt-0.5 text-[#3577DE]" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-[#112849]">Browser notifications</div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Get a once-a-day reminder for today’s open tasks while ADHDeeds is open.</p>
                  <button
                    type="button"
                    onClick={onEnableNotifications}
                    disabled={!notificationSupported || notificationsEnabled}
                    className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:ring-slate-200"
                  >
                    {!notificationSupported ? "Not supported here" : notificationsEnabled ? "Notifications on" : "Enable notifications"}
                  </button>
                </div>
              </div>
            </div>
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
            <div>
              <Logo size="welcome" />
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">Plan your week, move what changes, and keep the next step visible.</p>
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
      <div className="mt-3 flex h-[58px] items-end justify-between gap-2 sm:h-[76px] sm:gap-3">
        {days.map((day) => {
          const daily = tasks.filter((t) => t.date === isoDate(day));
          const done = daily.filter((t) => t.done).length;
          const pct = daily.length ? Math.round((done / daily.length) * 100) : 0;
          const available = daily.length ? Math.min(44, 10 + daily.length * 12) : 6;
          return (
            <div key={isoDate(day)} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="relative w-full max-w-[24px] overflow-hidden rounded-t-md bg-slate-100 sm:max-w-[27px]" style={{ height: available }}>
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
function NudgeCard({ task, category, onAskOpinion }) {
  return (
    <div className="rounded-2xl bg-[#112849] p-4 text-white shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-blue-200/60">Worth doing next</div>
      {category && <div className="mt-2 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold">{category}</div>}
      <div className="mt-3 text-[17px] font-semibold leading-tight">{task.name}</div>
      <p className="mt-2 text-xs leading-5 text-blue-100/70">{task.important ? "Marked important. Clearing this would make the week feel lighter." : "A good task to move forward while it is visible."}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold">{task.points} points</span>
        {onAskOpinion && (
          <button onClick={() => onAskOpinion(task)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#112849]">
            <Sparkles size={12} /> Opinion
          </button>
        )}
      </div>
    </div>
  );
}

function CategoryNudges({ nudges, onAskOpinion }) {
  if (!nudges.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {nudges.map(({ category, task }) => <NudgeCard key={category} category={category} task={task} onAskOpinion={onAskOpinion} />)}
    </div>
  );
}

function fallbackConsiderations(today, tasks, habits) {
  const todayKey = isoDate(today);
  const todayTasks = tasks.filter((task) => task.date === todayKey && !task.done);
  const movedTasks = todayTasks.filter((task) => task.movedCount || task.penaltyCount).length;
  const openHabits = habits.filter((habit) => !habit.ticks[todayKey]).length;
  const considerations = [];
  if (todayTasks.length >= 5) considerations.push("This is a fuller day. Pick one task to protect and let the rest queue behind it.");
  if (movedTasks) considerations.push("A few tasks look like they have been carried forward. Try shrinking one to a two-minute first step.");
  if (openHabits >= 3) considerations.push("Several habits are still open. Choose one anchor habit rather than trying to rescue everything at once.");
  if (todayTasks.some((task) => /call|phone|appointment|gp|dentist|book|submit|pay/i.test(task.name))) considerations.push("There is a time-sensitive-looking task here. Doing it earlier may reduce friction.");
  if (!considerations.length) considerations.push("Nothing is shouting for attention. A steady start is enough.");
  return {
    weather: [],
    planning: considerations.slice(0, 3),
    rut: "If you feel stuck, make the first action smaller rather than pushing harder.",
    protect: todayTasks.sort((a, b) => Number(b.important) - Number(a.important) || b.points - a.points)[0]?.name || "one easy win",
  };
}

function TodayConsiderationsCard({ today, tasks, habits, aiAccessToken }) {
  const [briefing, setBriefing] = useState(null);
  const [status, setStatus] = useState("");
  const todayKey = isoDate(today);

  async function refresh() {
    setStatus("Checking...");
    try {
      const result = await askAI("today-considerations", {
        date: todayKey,
        tasks: tasks.filter((task) => task.date === todayKey).map((task) => ({
          name: task.name,
          category: task.category,
          points: task.points,
          done: task.done,
          important: task.important,
          movedCount: task.movedCount || 0,
          penaltyCount: task.penaltyCount || 0,
          checklistTotal: normalizeChecklist(task.checklist).length,
          checklistDone: normalizeChecklist(task.checklist).filter((item) => item.done).length,
        })),
        habits: habits.map((habit) => ({
          name: habit.name,
          detail: habit.detail,
          mode: habit.mode,
          completedToday: !!habit.ticks[todayKey],
        })),
      }, aiAccessToken);
      setBriefing(result);
      setStatus(result.weatherUnavailable ? "Weather not connected" : "Updated");
    } catch (error) {
      setBriefing(fallbackConsiderations(today, tasks, habits));
      setStatus(error.message || "Using built-in considerations");
    }
  }

  useEffect(() => {
    setBriefing(null);
    setStatus("");
  }, [todayKey]);

  const visible = briefing || fallbackConsiderations(today, tasks, habits);
  const items = [
    ...(visible.weather || []).map((text) => ({ label: "Weather", text })),
    ...(visible.planning || []).map((text) => ({ label: "Planning", text })),
  ].slice(0, 5);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#112849]">
            <Sparkles size={16} className="text-[#3577DE]" /> Today's Considerations
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#3577DE] ring-1 ring-blue-100">Beta</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Weather, task load, and rut prevention.</p>
        </div>
        <button onClick={refresh} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100">Refresh</button>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="rounded-xl bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</div>
            <div className="mt-1 text-sm leading-5 text-slate-700">{item.text}</div>
          </div>
        ))}
        {visible.rut && <div className="rounded-xl bg-blue-50 p-3 text-sm leading-5 text-[#112849] ring-1 ring-blue-100">{visible.rut}</div>}
        {visible.protect && <div className="text-xs font-semibold text-slate-400">Protect: <span className="text-[#112849]">{visible.protect}</span></div>}
        {status && <div className="text-xs font-medium text-slate-400">{status}</div>}
      </div>
    </div>
  );
}

function DailyPlanCard({ today, tasks, habits, aiAccessToken }) {
  const [energy, setEnergy] = useState("normal");
  const [aiPlan, setAiPlan] = useState(null);
  const [aiStatus, setAiStatus] = useState("");
  const [orderedPlan, setOrderedPlan] = useState([]);
  const [dragPlanIndex, setDragPlanIndex] = useState(null);
  const fallbackPlan = useMemo(() => buildDailyPlan(today, tasks, habits, energy), [today, tasks, habits, energy]);
  const plan = useMemo(() => (aiPlan?.items?.length ? aiPlan.items : fallbackPlan), [aiPlan, fallbackPlan]);
  const planKey = plan.join("\u0001");

  async function improvePlan() {
    setAiStatus("Thinking...");
    try {
      const todayKey = isoDate(today);
      const result = await askAI("daily-plan", {
        date: todayKey,
        energy,
        tasks: tasks.filter((task) => task.date === todayKey && !task.done),
        habits: habits.filter((habit) => !habit.ticks[todayKey]).map((habit) => ({ name: habit.name, detail: habit.detail, points: habit.points, mode: habit.mode })),
      }, aiAccessToken);
      setAiPlan(result);
      setAiStatus("AI improved");
    } catch (error) {
      setAiPlan(null);
      setAiStatus(error.message || "Using built-in plan");
    }
  }

  useEffect(() => {
    setAiPlan(null);
    setAiStatus("");
  }, [energy, today, tasks, habits]);

  useEffect(() => {
    setOrderedPlan(plan);
  }, [planKey]);

  function reorderPlanItem(sourceIndex, targetIndex) {
    if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0) return;
    setOrderedPlan((current) => {
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button onClick={improvePlan} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100 hover:bg-blue-100">Improve with AI</button>
        {aiStatus && <span className="text-xs font-semibold text-slate-400">{aiStatus}</span>}
      </div>
      <ol className="mt-4 space-y-2">
        {orderedPlan.map((item, index) => (
          <li
            key={`${item}-${index}`}
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-plan-index", String(index));
              setDragPlanIndex(index);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const sourceIndex = Number(event.dataTransfer.getData("application/x-plan-index"));
              reorderPlanItem(sourceIndex, index);
              setDragPlanIndex(null);
            }}
            onDragEnd={() => setDragPlanIndex(null)}
            className={`flex cursor-grab gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 active:cursor-grabbing ${dragPlanIndex === index ? "bg-blue-50 ring-1 ring-blue-100" : "bg-slate-50"}`}
          >
            <span className="font-bold text-[#3577DE]">{index + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
      {aiPlan?.opinion && <p className="mt-3 text-xs leading-5 text-slate-500">{aiPlan.opinion}</p>}
    </div>
  );
}

function TodaySection({ id, children, onMove, className = "" }) {
  const [dragOver, setDragOver] = useState(false);

  function dropPlacement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x < 0.35) return "half-before";
    if (x > 0.65) return "half-after";
    return "full-before";
  }

  return (
    <motion.div
      layout
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-today-section", id);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-today-section")) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        onMove(event.dataTransfer.getData("application/x-today-section"), id, dropPlacement(event));
      }}
      className={`group cursor-grab rounded-2xl transition active:cursor-grabbing ${className} ${dragOver ? "ring-2 ring-[#3577DE] ring-offset-2 ring-offset-[#F3F6FB]" : ""}`}
    >
      {children}
    </motion.div>
  );
}

function TodayView({ today, selectedDate, tasks, habits, brainDump, categories, hiddenFeatures, enabledFeatures, aiAccessToken, todaySectionOrder, todaySectionWidths, onPreviousDay, onNextDay, onJumpToday, onReorderSection, onToggleTask, onToggleChecklistItem, onToggleHabit, onEditTask, onRemoveTask, onAddTask, onAddBrainDumpItems, onRemoveBrainDumpItem, onConvertBrainDumpItem, onAddCategory, onReframeTask, onAskOpinion, onMoveTomorrow, onMoveTomorrowPenalty, nudges, points, progress }) {
  const selectedKey = isoDate(selectedDate);
  const todayKey = isoDate(today);
  const isToday = selectedKey === todayKey;
  const touchStartX = useRef(null);
  const todaysTasks = tasks.filter((t) => t.date === selectedKey);
  const hidden = new Set(hiddenFeatures);
  const sections = {
    plan: {
      content: <DailyPlanCard today={selectedDate} tasks={tasks} habits={hidden.has("habitsInDailyPlan") ? [] : habits} aiAccessToken={aiAccessToken} />,
    },
    considerations: {
      content: <TodayConsiderationsCard today={selectedDate} tasks={tasks} habits={habits} aiAccessToken={aiAccessToken} />,
    },
    tasks: {
      content: (
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <h3 className="text-sm font-bold text-[#112849]">{isToday ? "Today’s tasks" : `${pretty(selectedDate, { weekday: "long" })} tasks`}</h3>
            <span className="text-xs text-slate-400">{todaysTasks.filter((t) => t.done).length} / {todaysTasks.length} complete</span>
          </div>
          <div className="divide-y divide-slate-100">
            {todaysTasks.length ? todaysTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onToggleTask}
                onToggleChecklistItem={onToggleChecklistItem}
                onRemove={onRemoveTask}
                onEdit={onEditTask}
                onReframe={onReframeTask}
                onMoveTomorrow={onMoveTomorrow}
                onMoveTomorrowPenalty={onMoveTomorrowPenalty}
                showWebsite
              />
            )) : <p className="p-4 text-sm text-slate-400">Nothing planned today.</p>}
          </div>
          <button onClick={() => onAddTask(selectedKey)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100 hover:bg-blue-100">
            <Plus size={16} /> Add task
          </button>
        </div>
      ),
    },
    nudges: {
      content: <CategoryNudges nudges={nudges} onAskOpinion={onAskOpinion} />,
    },
    dumpster: {
      content: <BrainDumpsterView items={brainDump} categories={categories} onAddItems={onAddBrainDumpItems} onRemoveItem={onRemoveBrainDumpItem} onConvertItem={onConvertBrainDumpItem} onAddCategory={onAddCategory} compact />,
    },
    habits: {
      content: (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
          <h3 className="mb-3 text-sm font-bold text-[#112849]">{isToday ? "Today’s habits" : `${pretty(selectedDate, { weekday: "long" })} habits`}</h3>
          <div className="space-y-2">
            {habits.map((habit) => {
              const checked = !!habit.ticks[selectedKey];
              return (
                <button key={habit.id} onClick={() => onToggleHabit(habit.id, selectedKey)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50">
                  <span className={`grid h-6 w-6 place-items-center rounded-lg border ${checked ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 text-transparent"}`}><Check size={15} strokeWidth={3} /></span>
                  <div className="flex-1"><div className="text-sm font-medium text-slate-800">{habit.name}</div><div className="text-[11px] text-slate-400">{habit.detail}</div></div>
                  <span className="text-xs font-semibold text-slate-400">{habit.points} pts</span>
                </button>
              );
            })}
            {!habits.length && <p className="p-4 text-sm text-slate-400">No habits yet.</p>}
          </div>
        </div>
      ),
    },
  };
  const visibleOrder = todaySectionOrder.filter((id) => {
    if (!sections[id]) return false;
    if (id === "plan" && hidden.has("dailyPlan")) return false;
    if (id === "considerations" && !enabledFeatures.includes("todaysConsiderations")) return false;
    if (id === "nudges" && (hidden.has("worthNext") || !nudges.length)) return false;
    if (id === "dumpster" && hidden.has("brainDumpster")) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-24">
      <div
        className="rounded-3xl bg-[#112849] p-5 text-white shadow-sm"
        onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) < 45) return;
          if (delta < 0) onNextDay();
          else onPreviousDay();
        }}
      >
        <div className="flex justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-blue-100/70">{isToday ? "Today" : "Selected day"}</div>
            <div className="mt-1 grid max-w-sm grid-cols-[2.25rem_minmax(8rem,1fr)_2.25rem] items-center gap-3">
              <button onClick={onPreviousDay} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-blue-100 hover:bg-white/15" aria-label="Previous day"><ChevronLeft size={18} /></button>
              <button onClick={onJumpToday} disabled={isToday} className="min-w-0 text-center disabled:cursor-default" aria-label="Jump to today">
                <h2 className="truncate text-2xl font-bold tracking-tight">{pretty(selectedDate, { weekday: "long" })}</h2>
                <p className="text-sm text-blue-100/70">{pretty(selectedDate, { day: "numeric", month: "long" })}</p>
              </button>
              <button onClick={onNextDay} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-blue-100 hover:bg-white/15" aria-label="Next day"><ChevronRight size={18} /></button>
            </div>
          </div>
          <Ring value={progress} size={78} dark />
        </div>
        <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-sm text-blue-100/80">
          <Flame size={16} className="text-[#6EA8FF]" /> <strong className="text-white">{points}</strong> points this week
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visibleOrder.map((id) => (
          <TodaySection key={id} id={id} onMove={onReorderSection} className={sectionWidthClass(id, todaySectionWidths)}>
            {sections[id].content}
          </TodaySection>
        ))}
      </div>
    </motion.div>
  );
}

function DayCard({ day, tasks, onToggle, onToggleChecklistItem, onRemove, onEdit, onAddTask, onReframe, onMoveTomorrow, onMoveTomorrowPenalty, onDropTask, onDragTask, today }) {
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
              onToggleChecklistItem={onToggleChecklistItem}
              onRemove={onRemove}
              onEdit={onEdit}
              onReframe={onReframe}
              onMoveTomorrow={onMoveTomorrow}
              onMoveTomorrowPenalty={onMoveTomorrowPenalty}
              onDragStart={onDragTask}
            />
          )) : <div className="pt-8 text-center text-xs text-slate-400">Drop tasks here</div>}
        </div>
        <button onClick={() => onAddTask(dayKey)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 py-2.5 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100 hover:bg-blue-100">
          <Plus size={15} /> Add task
        </button>
      </div>
    </motion.article>
  );
}

function MobileWeekTask({ task, days, onToggle, onToggleChecklistItem, onRemove, onEdit, onReframe, onMoveTask, onMoveTomorrow, onMoveTomorrowPenalty }) {
  const [moving, setMoving] = useState(false);

  return (
    <div>
      <TaskRow
        task={task}
        onToggle={onToggle}
        onToggleChecklistItem={onToggleChecklistItem}
        onRemove={onRemove}
        onEdit={onEdit}
        onReframe={onReframe}
        onMoveTomorrow={onMoveTomorrow}
        onMoveTomorrowPenalty={onMoveTomorrowPenalty}
      />
      <div className="px-3 pb-3">
        <button onClick={() => setMoving(!moving)} className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
          {moving ? "Close move options" : "Move to another day"}
        </button>
        {moving && (
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const dayKey = isoDate(day);
              const current = task.date === dayKey;
              return (
                <button
                  key={dayKey}
                  disabled={current}
                  onClick={() => {
                    onMoveTask(task.id, dayKey);
                    setMoving(false);
                  }}
                  className={`rounded-lg px-1 py-2 text-center text-[11px] font-bold ring-1 ${current ? "bg-[#112849] text-white ring-[#112849]" : "bg-white text-slate-500 ring-slate-200"}`}
                >
                  <div>{pretty(day, { weekday: "short" }).slice(0, 1)}</div>
                  <div>{pretty(day, { day: "numeric" })}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WeekView({ days, tasks, weekSectionOrder, weekSectionWidths, hiddenFeatures, onReorderSection, onToggle, onToggleChecklistItem, onRemove, onEdit, onAddTask, onReframe, onAskOpinion, onMoveTomorrow, onMoveTomorrowPenalty, onMoveTask, today, points, taskPoints, habitPoints, nudges }) {
  const initialDay = days.find((day) => isoDate(day) === isoDate(today)) || days[0];
  const [selectedDay, setSelectedDay] = useState(isoDate(initialDay));
  const done = tasks.filter((t) => t.done).length;
  const selectedDate = days.find((day) => isoDate(day) === selectedDay) || days[0];
  const selectedTasks = tasks.filter((task) => task.date === selectedDay);
  function dragTask(event, taskId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  }
  const hidden = new Set(hiddenFeatures);
  const sections = {
    stats: {
      content: (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <ScoreCard points={points} taskPoints={taskPoints} habitPoints={habitPoints} />
          <ProgressCard done={done} total={tasks.length} />
          <div className="col-span-2 lg:col-span-1">
            <DailyBars days={days} tasks={tasks} />
          </div>
        </div>
      ),
    },
    nudges: {
      content: <CategoryNudges nudges={nudges} onAskOpinion={onAskOpinion} />,
    },
    tasks: {
      content: (
        <div className="space-y-5">
          <div className="flex items-center justify-between lg:hidden">
            <h2 className="text-xl font-bold tracking-tight text-[#112849]">This week</h2>
            <div className="text-xs text-slate-400">Tap a day</div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 lg:hidden">
            {days.map((day) => {
              const dayKey = isoDate(day);
              const dayTasks = tasks.filter((task) => task.date === dayKey);
              const isSelected = selectedDay === dayKey;
              const isToday = isoDate(today) === dayKey;
              return (
                <button key={dayKey} onClick={() => setSelectedDay(dayKey)} className={`rounded-xl px-1 py-2 text-center ring-1 transition ${isSelected ? "bg-[#112849] text-white ring-[#112849]" : "bg-white text-slate-500 ring-slate-200"}`}>
                  <div className="text-[10px] font-bold uppercase">{pretty(day, { weekday: "short" }).slice(0, 1)}</div>
                  <div className="mt-1 text-sm font-bold">{pretty(day, { day: "numeric" })}</div>
                  <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${dayTasks.length ? isSelected ? "bg-white" : "bg-[#3577DE]" : isToday ? "bg-amber-400" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 lg:hidden">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div>
                <h3 className="text-sm font-bold text-[#112849]">{pretty(selectedDate, { weekday: "long" })}</h3>
                <p className="text-xs text-slate-400">{pretty(selectedDate, { day: "numeric", month: "long" })}</p>
              </div>
              <span className="text-xs text-slate-400">{selectedTasks.filter((task) => task.done).length} / {selectedTasks.length} complete</span>
            </div>
            <div className="divide-y divide-slate-100">
              {selectedTasks.length ? selectedTasks.map((task) => (
                <MobileWeekTask
                  key={task.id}
                  task={task}
                  days={days}
                  onToggle={onToggle}
                  onToggleChecklistItem={onToggleChecklistItem}
                  onRemove={onRemove}
                  onEdit={onEdit}
                  onReframe={onReframe}
                  onMoveTask={onMoveTask}
                  onMoveTomorrow={onMoveTomorrow}
                  onMoveTomorrowPenalty={onMoveTomorrowPenalty}
                />
              )) : <div className="p-5 text-center text-sm text-slate-400">No tasks planned.</div>}
            </div>
            <button onClick={() => onAddTask(selectedDay)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100 hover:bg-blue-100">
              <Plus size={16} /> Add task
            </button>
          </div>
          <div className="hidden items-center justify-between lg:flex">
            <h2 className="text-xl font-bold tracking-tight text-[#112849]">This week</h2>
            <div className="text-xs text-slate-400">Drag tasks between days</div>
          </div>
          <div className="hidden lg:mx-0 lg:grid lg:grid-cols-7 lg:gap-3 lg:overflow-visible lg:px-0">
            {days.map((day) => (
              <div className="snap-start lg:min-w-0" key={isoDate(day)}>
                <DayCard
                  day={day}
                  tasks={tasks.filter((t) => t.date === isoDate(day))}
                  onToggle={onToggle}
                  onToggleChecklistItem={onToggleChecklistItem}
                  onRemove={onRemove}
                  onEdit={onEdit}
                  onAddTask={onAddTask}
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
        </div>
      ),
    },
  };
  const visibleOrder = weekSectionOrder.filter((id) => {
    if (!sections[id]) return false;
    if (id === "stats" && hidden.has("stats")) return false;
    if (id === "nudges" && (hidden.has("worthNext") || !nudges.length)) return false;
    return true;
  });
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 pb-24">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visibleOrder.map((id) => (
          <TodaySection key={id} id={id} onMove={onReorderSection} className={sectionWidthClass(id, weekSectionWidths, sections[id].className || "")}>
            {sections[id].content}
          </TodaySection>
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
              <div>
                <h3 className="font-semibold text-[#112849]">{habit.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{habit.detail} · {habit.points} points</p>
                {habit.narrative && <p className="mt-3 max-w-2xl rounded-xl bg-blue-50 px-3 py-2 text-sm leading-5 text-[#112849] ring-1 ring-blue-100">{habit.narrative}</p>}
              </div>
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

function BrainDumpsterView({ items, categories, onAddItems, onRemoveItem, onConvertItem, onAddCategory, compact = false }) {
  const [text, setText] = useState("");

  function submit(event) {
    event.preventDefault();
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    onAddItems(lines);
    setText("");
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`space-y-4 ${compact ? "" : "pb-24"}`}>
      <div>
        <h2 className={`${compact ? "text-sm" : "text-2xl"} font-bold tracking-tight text-[#112849]`}>Brain Dumpster</h2>
        <p className="mt-1 text-sm text-slate-500">Catch loose thoughts first. Decide what they are later.</p>
      </div>
      <form onSubmit={submit} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Dump it here</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="One thought per line..."
            rows={5}
            className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]"
          />
        </label>
        <button type="submit" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3577DE] py-3 text-sm font-semibold text-white">
          <Plus size={16} /> Add to dumpster
        </button>
      </form>
      <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 border-b border-slate-100 p-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-5 text-slate-800">{item.text}</div>
              <div className="mt-1 text-[11px] text-slate-400">Captured {new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => onConvertItem(item)}
                disabled={!categories.length}
                className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:ring-slate-200"
              >
                Make task
              </button>
              <button onClick={() => onRemoveItem(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="Delete dumped item">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="p-8 text-center text-sm text-slate-400">Nothing dumped yet.</div>}
      </div>
      {!categories.length && (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-[#112849] ring-1 ring-blue-100">
          Create a category before turning dumped items into tasks.
          <button onClick={onAddCategory} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100">
            <Plus size={16} /> Add Category
          </button>
        </div>
      )}
    </motion.div>
  );
}

function AllTasksView({ tasks, categories, onAddCategory, onToggle, onToggleChecklistItem, onRemove, onAdd, onEdit, onReframe, onMoveTomorrow, onMoveTomorrowPenalty }) {
  const [filter, setFilter] = useState("All");
  const [showRecurring, setShowRecurring] = useState(true);
  const filteredByCategory = filter === "All" ? tasks : tasks.filter((task) => task.category === filter);
  const visible = showRecurring ? filteredByCategory : filteredByCategory.filter((task) => !task.recurringId);
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
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
        <div>
          <div className="text-sm font-bold text-[#112849]">Recurring tasks</div>
          <div className="text-xs text-slate-400">{showRecurring ? "Showing repeated tasks" : "Hidden from this view"}</div>
        </div>
        <button onClick={() => setShowRecurring((value) => !value)} className={`relative h-7 w-12 rounded-full transition ${showRecurring ? "bg-[#3577DE]" : "bg-slate-200"}`} aria-label={showRecurring ? "Hide recurring tasks" : "Show recurring tasks"}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${showRecurring ? "left-6" : "left-1"}`} />
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70">
        {sortedTasks.map((task) => (
          <div key={task.id} className="border-b border-slate-100 last:border-b-0">
            <div className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{new Date(task.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</div>
            <TaskRow task={task} onToggle={onToggle} onToggleChecklistItem={onToggleChecklistItem} onRemove={onRemove} onEdit={onEdit} onReframe={onReframe} onMoveTomorrow={onMoveTomorrow} onMoveTomorrowPenalty={onMoveTomorrowPenalty} />
          </div>
        ))}
        {!visible.length && <div className="p-8 text-center text-sm text-slate-400">No tasks here.</div>}
      </div>
    </motion.div>
  );
}

function AddTaskSheet({ open, onClose, onSave, onUpdate, days, task, initialDate, initialName = "", categories, onAddCategory, aiAccessToken }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0] || "");
  const [date, setDate] = useState(isoDate(days[0]));
  const [points, setPoints] = useState(10);
  const [important, setImportant] = useState(false);
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [breakdown, setBreakdown] = useState([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [checklistStatus, setChecklistStatus] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(task?.name || initialName);
    setCategory(task?.category || categories[0] || "");
    setDate(task?.date || initialDate || isoDate(days[0]));
    setPoints(task?.points || 10);
    setImportant(!!task?.important);
    setNotes(task?.notes || "");
    setWebsite(task?.website || "");
    setRecurrence("none");
    setBreakdown([]);
    const savedChecklist = normalizeChecklist(task?.checklist);
    setChecklist(savedChecklist);
    setChecklistOpen(!!savedChecklist.length);
    setChecklistStatus("");
  }, [open, days, task, initialDate, initialName, categories]);
  useEffect(() => {
    if (open && !category && categories.length) setCategory(categories[0]);
  }, [open, category, categories]);
  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const cleanChecklist = normalizeChecklist(checklist);
    if (task) {
      const nextDone = cleanChecklist.length && cleanChecklist.some((item) => !item.done) ? false : task.done;
      onUpdate({ ...task, name: name.trim(), category, date, points, important, notes: notes.trim(), website: normalizeWebsite(website), checklist: cleanChecklist, done: nextDone });
    } else {
      onSave({ id: `task-${Date.now()}`, name: name.trim(), category, date, points, done: false, important, notes: notes.trim(), website: normalizeWebsite(website), checklist: cleanChecklist, recurrence });
    }
    setName(""); setCategory(categories[0] || ""); setPoints(10); setImportant(false); setNotes(""); setWebsite(""); setRecurrence("none"); setChecklist([]); setChecklistOpen(false); setChecklistStatus(""); onClose();
  }
  function createBreakdown() {
    if (!name.trim()) return;
    setBreakdown(breakDownTask(name.trim(), category, date, points));
  }
  function addBreakdownTasks() {
    breakdown.forEach((item, index) => onSave({ ...item, id: `task-${Date.now()}-${index}`, done: false }));
    onClose();
  }
  function addChecklistItem(text = "") {
    setChecklist((items) => [...items, { id: `check-${Date.now()}-${items.length}`, text, done: false }]);
  }
  function updateChecklistItem(id, updates) {
    setChecklist((items) => items.map((item) => item.id === id ? { ...item, ...updates } : item));
  }
  function removeChecklistItem(id) {
    setChecklist((items) => items.filter((item) => item.id !== id));
  }
  async function suggestChecklist() {
    if (!name.trim()) return;
    setChecklistStatus("Suggesting...");
    try {
      const result = await askAI("checklist", {
        task: {
          name: name.trim(),
          notes: notes.trim(),
          category,
          existingItems: normalizeChecklist(checklist).map((item) => item.text),
        },
      }, aiAccessToken);
      const suggested = normalizeChecklist(result.items || []).map((item, index) => ({
        ...item,
        id: `check-ai-${Date.now()}-${index}`,
        done: false,
      }));
      if (!suggested.length) throw new Error("No checklist items returned.");
      setChecklist((items) => [...items, ...suggested]);
      setChecklistOpen(true);
      setChecklistStatus("Suggestions added as draft items.");
    } catch (error) {
      setChecklistStatus(error.message || "AI checklist suggestions are unavailable right now.");
    }
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40" />
          <motion.form onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
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
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Useful context, booking reference, what to ask..." className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Website</span><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[#112849]"><ListChecks size={16} className="text-[#3577DE]" /> Checklist</div>
                    <p className="mt-1 text-xs text-slate-400">The task completes when every item is checked.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChecklistOpen((open) => checklist.length ? !open : true);
                      if (!checklist.length) addChecklistItem();
                    }}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#3577DE] ring-1 ring-blue-100"
                  >
                    {checklist.length ? checklistOpen ? "Hide List" : "Open List" : "Create List"}
                  </button>
                </div>
                {checklistOpen && (
                  <div className="mt-3 space-y-2">
                    {checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
                        <button type="button" onClick={() => updateChecklistItem(item.id, { done: !item.done })} className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${item.done ? "border-[#3577DE] bg-[#3577DE] text-white" : "border-slate-300 text-transparent"}`} aria-label={item.done ? "Mark checklist item incomplete" : "Complete checklist item"}>
                          <Check size={15} strokeWidth={3} />
                        </button>
                        <input value={item.text} onChange={(event) => updateChecklistItem(item.id, { text: event.target.value })} placeholder="Checklist item" className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm outline-none focus:border-[#3577DE]" />
                        <button type="button" onClick={() => removeChecklistItem(item.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="Remove checklist item"><X size={15} /></button>
                      </div>
                    ))}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => addChecklistItem()} className="rounded-xl bg-white py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">Add item</button>
                      <button type="button" onClick={suggestChecklist} disabled={!name.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-2.5 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:ring-slate-200"><Sparkles size={15} /> Suggest list with AI</button>
                    </div>
                    {checklistStatus && <p className="text-xs font-medium text-slate-400">{checklistStatus}</p>}
                  </div>
                )}
              </div>
              {!task && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Repeat</span>
                  <select value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">
                    {RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )}
              <button type="button" onClick={onAddCategory} className="w-full rounded-xl bg-blue-50 py-3 text-sm font-semibold text-[#3577DE] ring-1 ring-blue-100">Add Category</button>
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
  const [narrative, setNarrative] = useState("");
  const [points, setPoints] = useState(5);
  const [mode, setMode] = useState("daily");

  useEffect(() => {
    if (!open) return;
    setName(habit?.name || "");
    setDetail(habit?.detail || "");
    setNarrative(habit?.narrative || "");
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
      narrative: narrative.trim(),
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
          <motion.form onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight text-[#112849]">{habit ? "Edit habit" : "Add a habit"}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={18}/></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Habit</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you want to keep visible?" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Detail</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Daily goal, weekly target, or a note" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]" /></label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Narrative</span>
                <textarea
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Why does this habit matter?"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#3577DE]"
                />
              </label>
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
          <motion.form onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
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

function BottomNav({ view, setView }) {
  const tabs = [
    { id: "today", label: "Today", icon: Home },
    { id: "week", label: "Week", icon: CalendarDays },
    { id: "dumpster", label: "Dump", icon: ClipboardList },
    { id: "tasks", label: "Tasks", icon: BarChart3 },
    { id: "habits", label: "Habits", icon: Flame },
  ];
  return (
    <nav className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-20 mx-auto flex max-w-[390px] items-center justify-between rounded-3xl border border-white/70 bg-white/75 px-4 py-2.5 shadow-[0_18px_45px_rgba(17,40,73,0.20)] ring-1 ring-slate-200/70 backdrop-blur-2xl sm:hidden">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => setView(id)} className={`flex min-h-11 min-w-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition ${view === id ? "bg-white/80 text-[#3577DE] shadow-sm ring-1 ring-slate-200/70" : "text-slate-400 hover:bg-white/50"}`}><Icon size={21}/><span>{label}</span></button>
      ))}
    </nav>
  );
}

export default function ADHDeedsApp() {
  const [data, setData] = useState(loadData);
  const [activeWeek, setActiveWeek] = useState(() => startOfWeek(new Date()));
  const [selectedTodayDate, setSelectedTodayDate] = useState(() => new Date());
  const [view, setView] = useState("today");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [newTaskDate, setNewTaskDate] = useState(null);
  const [brainTaskDraft, setBrainTaskDraft] = useState(null);
  const [habitSheetOpen, setHabitSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [aiInsight, setAiInsight] = useState(null);
  const [rescheduleAdvice, setRescheduleAdvice] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem(NOTIFICATIONS_KEY) === "true");
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? "Not signed in" : "Local only");
  const saveTimer = useRef(null);
  const today = new Date();
  const days = useMemo(() => weekDays(activeWeek), [activeWeek]);
  const weekTasks = useMemo(() => data.tasks.filter((task) => task.date >= isoDate(days[0]) && task.date <= isoDate(days[6])), [data.tasks, days]);
  const notificationSupported = typeof window !== "undefined" && "Notification" in window;

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
    localStorage.setItem(NOTIFICATIONS_KEY, notificationsEnabled ? "true" : "false");
  }, [notificationsEnabled]);

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

  useEffect(() => {
    const recurringTasks = data.recurringTasks || [];
    if (!recurringTasks.length) return;
    const dayKeys = days.map(isoDate);
    const existingKeys = new Set(data.tasks.map((task) => `${task.recurringId || ""}:${task.date}`));
    const generated = recurringTasks.flatMap((template) =>
      dayKeys
        .filter((dateKey) => recurrenceMatches(template, dateKey))
        .filter((dateKey) => !existingKeys.has(`${template.id}:${dateKey}`))
        .map((dateKey) => taskFromRecurring(template, dateKey))
    );
    if (!generated.length) return;
    setData((old) => ({ ...old, tasks: [...old.tasks, ...generated] }));
  }, [data.recurringTasks, data.tasks, days]);

  useEffect(() => {
    if (!notificationsEnabled || !notificationSupported || Notification.permission !== "granted") return;
    const todayKey = isoDate(today);
    if (localStorage.getItem(NOTIFIED_DATE_KEY) === todayKey) return;
    const openToday = data.tasks.filter((task) => task.date === todayKey && !task.done);
    if (!openToday.length) return;
    new Notification("ADHDeeds", {
      body: openToday.length === 1 ? `1 task due today: ${openToday[0].name}` : `${openToday.length} tasks due today.`,
      tag: `adhdeeds-${todayKey}`,
    });
    localStorage.setItem(NOTIFIED_DATE_KEY, todayKey);
  }, [notificationsEnabled, notificationSupported, data.tasks]);

  const completed = weekTasks.filter((task) => task.done);
  const taskPoints = completed.reduce((sum, task) => sum + task.points, 0);
  const habitPoints = data.habits.reduce((sum, habit) => sum + days.filter((day) => habit.ticks[isoDate(day)]).length * habit.points, 0);
  const points = taskPoints + habitPoints;
  const selectedTodayKey = isoDate(selectedTodayDate);
  const todayTasks = weekTasks.filter((task) => task.date === selectedTodayKey);
  const todayProgress = todayTasks.length ? Math.round((todayTasks.filter((task) => task.done).length / todayTasks.length) * 100) : 0;
  const todaySectionOrder = data.ui?.todayOrder || TODAY_SECTION_ORDER;
  const weekSectionOrder = data.ui?.weekOrder || WEEK_SECTION_ORDER;
  const todaySectionWidths = data.ui?.todayWidths || {};
  const weekSectionWidths = data.ui?.weekWidths || {};
  const hiddenFeatures = data.ui?.hiddenFeatures || [];
  const enabledFeatures = data.ui?.enabledFeatures || [];
  const categories = data.categories || [];
  const categoryNudges = categories.map((category) => {
    const task = [...weekTasks]
      .filter((item) => item.category === category && !item.done)
      .sort((a, b) => Number(b.important) - Number(a.important) || b.points - a.points)[0];
    return task ? { category, task } : null;
  }).filter(Boolean);

  function toggleTask(id) {
    setData((old) => ({
      ...old,
      tasks: old.tasks.map((task) => {
        if (task.id !== id) return task;
        const stats = checklistStats(task);
        if (!task.done && stats.total > 0 && stats.done < stats.total) return task;
        return { ...task, done: !task.done };
      }),
    }));
  }
  function toggleChecklistItem(taskId, itemId) {
    setData((old) => ({
      ...old,
      tasks: old.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const checklist = normalizeChecklist(task.checklist).map((item) => item.id === itemId ? { ...item, done: !item.done } : item);
        const complete = checklist.length > 0 && checklist.every((item) => item.done);
        return { ...task, checklist, done: complete ? true : false };
      }),
    }));
  }
  function removeTask(id) {
    setData((old) => {
      const task = old.tasks.find((item) => item.id === id);
      if (!task?.recurringId) return { ...old, tasks: old.tasks.filter((item) => item.id !== id) };
      return {
        ...old,
        tasks: old.tasks.filter((item) => item.recurringId !== task.recurringId),
        recurringTasks: (old.recurringTasks || []).filter((template) => template.id !== task.recurringId),
      };
    });
  }
  function addTask(task) {
    if (task.recurrence && task.recurrence !== "none") {
      const recurringId = `recurring-${Date.now()}`;
      const { recurrence, ...taskFields } = task;
      setData((old) => ({
        ...old,
        recurringTasks: [
          ...(old.recurringTasks || []),
          {
            id: recurringId,
            name: task.name,
            category: task.category,
            startDate: task.date,
            frequency: recurrence,
            points: task.points,
            important: task.important,
            notes: task.notes || "",
            website: task.website || "",
            checklist: normalizeChecklist(task.checklist),
            skippedDates: [],
          },
        ],
        brainDump: brainTaskDraft ? (old.brainDump || []).filter((item) => item.id !== brainTaskDraft.id) : (old.brainDump || []),
        tasks: [...old.tasks, { ...taskFields, recurringId }],
      }));
      setBrainTaskDraft(null);
      return;
    }
    const { recurrence, ...taskFields } = task;
    setData((old) => ({
      ...old,
      brainDump: brainTaskDraft ? (old.brainDump || []).filter((item) => item.id !== brainTaskDraft.id) : (old.brainDump || []),
      tasks: [...old.tasks, taskFields],
    }));
    setBrainTaskDraft(null);
  }
  function updateTask(updatedTask) { setData((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === updatedTask.id ? updatedTask : task) })); }
  function openAddTask(date = null) {
    setEditingTask(null);
    setBrainTaskDraft(null);
    setNewTaskDate(date);
    setSheetOpen(true);
  }
  function openEditTask(task) {
    setEditingTask(task);
    setNewTaskDate(null);
    setSheetOpen(true);
  }
  function closeSheet() {
    setSheetOpen(false);
    setEditingTask(null);
    setNewTaskDate(null);
    setBrainTaskDraft(null);
  }
  function addBrainDumpItems(lines) {
    setData((old) => ({
      ...old,
      brainDump: [
        ...(old.brainDump || []),
        ...lines.map((line, index) => ({
          id: `dump-${Date.now()}-${index}`,
          text: line,
          createdAt: new Date().toISOString(),
        })),
      ],
    }));
  }
  function removeBrainDumpItem(id) {
    setData((old) => ({ ...old, brainDump: (old.brainDump || []).filter((item) => item.id !== id) }));
  }
  function convertBrainDumpItem(item) {
    setEditingTask(null);
    setBrainTaskDraft(item);
    setNewTaskDate(isoDate(today));
    setSheetOpen(true);
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
          movedCount: (task.movedCount || 0) + (task.date === date ? 0 : 1),
          penaltyCount: (task.penaltyCount || 0) + (penalize ? 1 : 0),
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
  function setTodayDate(date) {
    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);
    setSelectedTodayDate(nextDate);
    setActiveWeek(startOfWeek(nextDate));
  }
  function moveTodayDate(daysToMove) {
    setTodayDate(addDays(selectedTodayDate, daysToMove));
  }
  function reorderSections(current, sourceId, targetId, placement) {
    const withoutSource = current.filter((id) => id !== sourceId);
    const targetIndex = withoutSource.indexOf(targetId);
    if (targetIndex < 0) return current;
    const insertAfter = placement === "half-after";
    const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
    return [...withoutSource.slice(0, insertIndex), sourceId, ...withoutSource.slice(insertIndex)];
  }
  function nextWidths(current, sourceId, targetId, placement) {
    if (placement === "half-before" || placement === "half-after") {
      return { ...current, [sourceId]: "half", [targetId]: "half" };
    }
    return { ...current, [sourceId]: "full" };
  }
  function reorderTodaySection(sourceId, targetId, placement = "full-before") {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setData((old) => {
      const current = old.ui?.todayOrder || TODAY_SECTION_ORDER;
      const nextOrder = reorderSections(current, sourceId, targetId, placement);
      const todayWidths = nextWidths(old.ui?.todayWidths || {}, sourceId, targetId, placement);
      return { ...old, ui: { ...(old.ui || {}), todayOrder: nextOrder, todayWidths } };
    });
  }
  function reorderWeekSection(sourceId, targetId, placement = "full-before") {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setData((old) => {
      const current = old.ui?.weekOrder || WEEK_SECTION_ORDER;
      const nextOrder = reorderSections(current, sourceId, targetId, placement);
      const weekWidths = nextWidths(old.ui?.weekWidths || {}, sourceId, targetId, placement);
      return { ...old, ui: { ...(old.ui || {}), weekOrder: nextOrder, weekWidths } };
    });
  }
  function resetScreenLayout() {
    setData((old) => ({
      ...old,
      ui: {
        ...(old.ui || {}),
        todayOrder: TODAY_SECTION_ORDER,
        weekOrder: WEEK_SECTION_ORDER,
        todayWidths: {},
        weekWidths: {},
      },
    }));
  }
  function toggleFeature(featureId) {
    setData((old) => {
      const current = old.ui?.hiddenFeatures || [];
      const hiddenFeatures = current.includes(featureId)
        ? current.filter((item) => item !== featureId)
        : [...current, featureId];
      return { ...old, ui: { ...(old.ui || {}), hiddenFeatures } };
    });
  }
  function toggleEnabledFeature(featureId) {
    setData((old) => {
      const current = old.ui?.enabledFeatures || [];
      const enabledFeatures = current.includes(featureId)
        ? current.filter((item) => item !== featureId)
        : [...current, featureId];
      return { ...old, ui: { ...(old.ui || {}), enabledFeatures } };
    });
  }
  async function openReframeTask(task) {
    const fallback = {
      task,
      title: "Kind reframe",
      ...reframeTask(task),
    };
    setAiInsight(fallback);
    try {
      const result = await askAI("reframe", { task }, session?.access_token);
      setAiInsight({ ...fallback, ...result, task, title: result.title || "Kind reframe" });
    } catch (error) {
      setRescheduleAdvice(`${error.message || "AI is unavailable right now."} Using the built-in reframe instead.`);
    }
  }
  async function openOpinion(task) {
    const context = {
      sameDayOpenTasks: weekTasks.filter((item) => item.date === task.date && !item.done).map((item) => ({ name: item.name, points: item.points, important: item.important })),
      categories,
    };
    setAiInsight({
      task,
      title: "AI opinion",
      note: task.important ? "This is already marked important. A good next move is to make the first step almost too small." : "This looks like a useful next task because it is already visible and ready to be made smaller.",
      firstStep: `Spend 10 minutes starting ${task.name}`,
    });
    try {
      const result = await askAI("opinion", { task, context }, session?.access_token);
      setAiInsight({ task, ...result, title: result.title || "AI opinion" });
    } catch (error) {
      setRescheduleAdvice(`${error.message || "AI opinion is unavailable right now."} Using the built-in view instead.`);
    }
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
  async function enableNotifications() {
    if (!notificationSupported) {
      setRescheduleAdvice("This browser does not support in-browser notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      localStorage.removeItem(NOTIFIED_DATE_KEY);
      setRescheduleAdvice("Notifications are on. ADHDeeds will remind you about today’s open tasks while the app is open.");
      return;
    }
    setNotificationsEnabled(false);
    setRescheduleAdvice("Notifications were not enabled. You can allow them later in your browser settings.");
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
      <Header activeWeek={activeWeek} setActiveWeek={setActiveWeek} onProfile={() => setProfileOpen(true)} points={points} />
      <main className={`mx-auto px-4 py-5 sm:px-8 sm:py-7 ${view === "week" ? "max-w-none 2xl:max-w-[1800px]" : "max-w-7xl"}`}>
        <div className="hidden gap-2 pb-6 sm:flex">
          {[{id:"today",label:"Today"},{id:"week",label:"Week"},{id:"dumpster",label:"Brain Dumpster"},{id:"tasks",label:"All tasks"},{id:"habits",label:"Habits"}].map((tab) => (
            <button key={tab.id} onClick={() => setView(tab.id)} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${view === tab.id ? "bg-[#112849] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{tab.label}</button>
          ))}
        </div>
        {view === "today" && <TodayView today={today} selectedDate={selectedTodayDate} tasks={weekTasks} habits={data.habits} brainDump={data.brainDump || []} categories={categories} hiddenFeatures={hiddenFeatures} enabledFeatures={enabledFeatures} aiAccessToken={session?.access_token} todaySectionOrder={todaySectionOrder} todaySectionWidths={todaySectionWidths} onPreviousDay={() => moveTodayDate(-1)} onNextDay={() => moveTodayDate(1)} onJumpToday={() => setTodayDate(new Date())} onReorderSection={reorderTodaySection} onToggleTask={toggleTask} onToggleChecklistItem={toggleChecklistItem} onToggleHabit={toggleHabit} onEditTask={openEditTask} onRemoveTask={removeTask} onAddTask={openAddTask} onAddBrainDumpItems={addBrainDumpItems} onRemoveBrainDumpItem={removeBrainDumpItem} onConvertBrainDumpItem={convertBrainDumpItem} onAddCategory={() => setCategorySheetOpen(true)} onReframeTask={openReframeTask} onAskOpinion={openOpinion} onMoveTomorrow={(id) => moveTaskToTomorrow(id)} onMoveTomorrowPenalty={(id) => moveTaskToTomorrow(id, true)} nudges={categoryNudges} points={points} progress={todayProgress} />}
        {view === "week" && <WeekView days={days} tasks={weekTasks} weekSectionOrder={weekSectionOrder} weekSectionWidths={weekSectionWidths} hiddenFeatures={hiddenFeatures} onReorderSection={reorderWeekSection} onToggle={toggleTask} onToggleChecklistItem={toggleChecklistItem} onRemove={removeTask} onEdit={openEditTask} onAddTask={openAddTask} onReframe={openReframeTask} onAskOpinion={openOpinion} onMoveTomorrow={(id) => moveTaskToTomorrow(id)} onMoveTomorrowPenalty={(id) => moveTaskToTomorrow(id, true)} onMoveTask={moveTask} today={today} points={points} taskPoints={taskPoints} habitPoints={habitPoints} nudges={categoryNudges} />}
        {view === "dumpster" && <BrainDumpsterView items={data.brainDump || []} categories={categories} onAddItems={addBrainDumpItems} onRemoveItem={removeBrainDumpItem} onConvertItem={convertBrainDumpItem} onAddCategory={() => setCategorySheetOpen(true)} />}
        {view === "habits" && <HabitsView days={days} habits={data.habits} onToggle={toggleHabit} onAdd={openAddHabit} onEdit={openEditHabit} onRemove={removeHabit} />}
        {view === "tasks" && <AllTasksView tasks={weekTasks} categories={categories} onAddCategory={() => setCategorySheetOpen(true)} onToggle={toggleTask} onToggleChecklistItem={toggleChecklistItem} onRemove={removeTask} onAdd={openAddTask} onEdit={openEditTask} onReframe={openReframeTask} onMoveTomorrow={(id) => moveTaskToTomorrow(id)} onMoveTomorrowPenalty={(id) => moveTaskToTomorrow(id, true)} />}
      </main>
      <BottomNav view={view} setView={setView} />
      <AddTaskSheet open={sheetOpen} onClose={closeSheet} onSave={addTask} onUpdate={updateTask} days={days} task={editingTask} initialDate={newTaskDate} initialName={brainTaskDraft?.text || ""} categories={categories} onAddCategory={() => setCategorySheetOpen(true)} aiAccessToken={session?.access_token} />
      <HabitSheet open={habitSheetOpen} onClose={closeHabitSheet} onSave={addHabit} onUpdate={updateHabit} habit={editingHabit} />
      <CategorySheet open={categorySheetOpen} onClose={() => setCategorySheetOpen(false)} onSave={addCategory} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} session={session} authLoading={authLoading} syncStatus={syncStatus} notificationsEnabled={notificationsEnabled} notificationSupported={notificationSupported} hiddenFeatures={hiddenFeatures} enabledFeatures={enabledFeatures} onToggleFeature={toggleFeature} onToggleEnabledFeature={toggleEnabledFeature} onResetLayout={resetScreenLayout} onEnableNotifications={enableNotifications} onGoogleSignIn={signInWithGoogle} onSignIn={signIn} onSignOut={signOut} />
      <AISheet insight={aiInsight} onClose={() => setAiInsight(null)} onAddFirstStep={addFirstStepTask} />
      <AIToast message={rescheduleAdvice} onClose={() => setRescheduleAdvice("")} />
    </div>
  );
}
