import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi } from '@/api/monitoringApi';
import { weatherApi } from '@/api/weatherApi';
import { cropApi } from '@/api/cropApi';
import { t } from '@/lib/i18n';
import {
  ClipboardCheck,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Check,
  AlertTriangle,
  Eye,
  Leaf,
  CloudRain,
  CalendarClock,
  X,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import type {
  FarmResponseDto,
  MonitoringCheckDto,
  WeatherAlertDto,
} from '@/types';

// ─── Task Model ──────────────────────────────────────────────────────────────

type TaskUrgency = 'High' | 'Medium' | 'Routine';
type TaskSource = 'monitoring-due' | 'monitoring-upcoming' | 'weather-alert' | 'crop-schedule';

interface DailyTask {
  id: string;
  title: string;
  description: string;
  urgency: TaskUrgency;
  source: TaskSource;
  /** Route for the 'View Details' link. */
  detailLink: string;
  /** Original data id for deduplication. */
  sourceId: string;
  /** Farm name for the detail modal. */
  farmName?: string;
  /** Full un-truncated description for the modal. */
  fullDescription?: string;
}

// ─── localStorage helpers ────────────────────────────────────────────────────

const STORAGE_KEY = 'sabz_daily_tasks';

interface StoredState {
  date: string; // YYYY-MM-DD
  completed: string[]; // task ids completed on that date
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadCompleted(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StoredState = JSON.parse(raw);
    // Auto-reset: only keep completions if they're from today
    if (parsed.date === todayKey()) return parsed.completed;
    return [];
  } catch {
    return [];
  }
}

function saveCompleted(ids: string[]) {
  try {
    const state: StoredState = { date: todayKey(), completed: ids };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full — ignore */ }
}

// ─── Urgency styling ─────────────────────────────────────────────────────────

function urgencyClasses(urgency: TaskUrgency): string {
  switch (urgency) {
    case 'High':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
}

function urgencyIcon(urgency: TaskUrgency): React.ReactNode {
  switch (urgency) {
    case 'High':
      return <AlertTriangle className="h-3 w-3" />;
    case 'Medium':
      return <Eye className="h-3 w-3" />;
    default:
      return <CalendarClock className="h-3 w-3" />;
  }
}

function sourceIcon(source: TaskSource): React.ReactNode {
  switch (source) {
    case 'monitoring-due':
    case 'monitoring-upcoming':
      return <Leaf className="h-3.5 w-3.5 text-emerald-600" />;
    case 'weather-alert':
      return <CloudRain className="h-3.5 w-3.5 text-sky-600" />;
    case 'crop-schedule':
      return <CalendarClock className="h-3.5 w-3.5 text-amber-600" />;
  }
}

// ─── Task generation ─────────────────────────────────────────────────────────

function buildTasks(
  dueChecks: MonitoringCheckDto[],
  upcomingChecks: MonitoringCheckDto[],
  weatherAlerts: { farmId: string; farmName: string; alert: WeatherAlertDto }[],
  crops: { farmId: string; farmName: string; cropName: string; harvestDate?: string | null; growthStage?: string | null }[],
): DailyTask[] {
  const tasks: DailyTask[] = [];
  const seen = new Set<string>();

  // 1. Due monitoring checks → High / Medium urgency
  for (const c of dueChecks) {
    const key = `due-${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      id: key,
      title: c.title,
      description: c.description.length > 80 ? `${c.description.slice(0, 80)}…` : c.description,
      fullDescription: c.description,
      farmName: c.farmName || undefined,
      urgency: c.priority === 'High' ? 'High' : c.priority === 'Medium' ? 'Medium' : 'Routine',
      source: 'monitoring-due',
      detailLink: `/farms/${c.farmId}/crops/${c.cropId}/monitoring`,
      sourceId: c.id,
    });
  }

  // 2. Upcoming monitoring checks → Routine urgency
  for (const c of upcomingChecks) {
    const key = `upcoming-${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      id: key,
      title: c.title,
      description: c.description.length > 80 ? `${c.description.slice(0, 80)}…` : c.description,
      fullDescription: c.description,
      farmName: c.farmName || undefined,
      urgency: 'Routine',
      source: 'monitoring-upcoming',
      detailLink: `/farms/${c.farmId}/crops/${c.cropId}/monitoring`,
      sourceId: c.id,
    });
  }

  // 3. Weather alerts → High/Medium based on severity
  for (const { farmId, farmName, alert } of weatherAlerts) {
    const key = `weather-${farmId}-${alert.type}-${alert.when}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      id: key,
      title: alert.title,
      description: alert.message.length > 80 ? `${alert.message.slice(0, 80)}…` : alert.message,
      fullDescription: alert.message,
      farmName,
      urgency: alert.severity === 'High' ? 'High' : 'Medium',
      source: 'weather-alert',
      detailLink: `/farms/${farmId}/weather`,
      sourceId: key,
    });
  }

  // 4. Crop schedule insights (approaching harvest or key growth stage)
  const now = new Date();
  for (const { farmId, farmName, cropName, harvestDate, growthStage } of crops) {
    if (!harvestDate) continue;
    const harvest = new Date(harvestDate);
    const daysUntil = Math.ceil((harvest.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0 || daysUntil > 30) continue; // only within 30-day window

    const key = `crop-${farmId}-${cropName}-harvest`;
    if (seen.has(key)) continue;
    seen.add(key);

    const urgency: TaskUrgency = daysUntil <= 7 ? 'High' : daysUntil <= 14 ? 'Medium' : 'Routine';
    tasks.push({
      id: key,
      title: daysUntil <= 7
        ? `Harvest imminent for ${cropName}`
        : `Schedule ${cropName} field inspection`,
      description:
        daysUntil <= 7
          ? `Expected harvest in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} on ${harvest.toLocaleDateString()}.`
          : `${cropName} is at ${growthStage || 'active'} stage — harvest in ~${daysUntil} days.`,
      fullDescription:
        daysUntil <= 7
          ? `Expected harvest in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} on ${harvest.toLocaleDateString()}. Prepare equipment and arrange transport.`
          : `${cropName} is at ${growthStage || 'active'} stage — harvest in ~${daysUntil} days. Schedule a field inspection to assess readiness.`,
      farmName,
      urgency,
      source: 'crop-schedule',
      detailLink: `/farms/${farmId}/crops`,
      sourceId: key,
    });
  }

  // Sort: High → Medium → Routine, then truncate to keep the sidebar concise.
  const order: Record<TaskUrgency, number> = { High: 0, Medium: 1, Routine: 2 };
  tasks.sort((a, b) => order[a.urgency] - order[b.urgency]);
  return tasks.slice(0, 12);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DailyTaskChecklistProps {
  farms: FarmResponseDto[];
  isOpen: boolean;
  onToggle: () => void;
}

export function DailyTaskChecklist({ farms, isOpen, onToggle }: DailyTaskChecklistProps) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [completed, setCompleted] = useState<string[]>(loadCompleted);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);

  // Persist completion changes
  const toggleTask = useCallback((taskId: string) => {
    setCompleted((prev) => {
      const next = prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId];
      saveCompleted(next);
      return next;
    });
  }, []);

  // Fetch data and build tasks
  useEffect(() => {
    if (farms.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [due, upcoming] = await Promise.all([
          monitoringApi.getDue().catch(() => [] as MonitoringCheckDto[]),
          monitoringApi.getUpcoming().catch(() => [] as MonitoringCheckDto[]),
        ]);

        // Weather alerts (per farm, best-effort)
        const alertResults = await Promise.all(
          farms.map(async (f) => {
            try {
              const res = await weatherApi.getAlerts(f.id);
              return res.alerts.map((a) => ({ farmId: f.id, farmName: f.farmName, alert: a }));
            } catch {
              return [];
            }
          }),
        );
        const allAlerts = alertResults.flat();

        // Crop schedule data (per farm)
        const cropResults = await Promise.all(
          farms.map(async (f) => {
            try {
              const crops = await cropApi.getByFarm(f.id);
              return crops.map((c) => ({
                farmId: f.id,
                farmName: f.farmName,
                cropName: c.cropName,
                harvestDate: c.harvestDate,
                growthStage: c.growthStage,
              }));
            } catch {
              return [];
            }
          }),
        );
        const allCrops = cropResults.flat();

        if (!cancelled) {
          setTasks(buildTasks(due, upcoming, allAlerts, allCrops));
        }
      } catch {
        // Non-critical — sidebar stays empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [farms]);

  const completedCount = tasks.filter((t) => completed.includes(t.id)).length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // ── Collapsed floating strip (w-12) ──
  if (!isOpen) {
    return (
      <div className="fixed right-2 top-20 z-30 w-12 max-h-[calc(100vh-6rem)] flex flex-col items-center bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden transition-all duration-300 ease-in-out">
        {/* Expand button */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors rounded-t-2xl"
          title="Expand tasks"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Task icon */}
        <div className="flex flex-col items-center gap-1.5 px-1">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary-600 to-emerald-600 flex items-center justify-center">
            <ClipboardCheck className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Progress badge — filled circle with count */}
        {tasks.length > 0 && (
          <div className="flex flex-col items-center mt-2 gap-0.5">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${
                progress === 100
                  ? 'bg-emerald-500 text-white'
                  : completedCount > 0
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-200'
                    : 'bg-gray-100 text-gray-600 ring-2 ring-gray-200'
              }`}
              title={`${completedCount}/${tasks.length} Tasks`}
            >
              {completedCount}/{tasks.length}
            </div>
            <span className="text-[9px] font-semibold text-gray-500">
              {progress}%
            </span>
          </div>
        )}

        {/* Urgent alerts indicator */}
        {tasks.some((t) => t.urgency === 'High' && !completed.includes(t.id)) && (
          <div className="mt-2 mb-1" title="High priority tasks pending">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
        )}

        {/* Spacer to push expand-down button to bottom */}
        <div className="flex-1" />

        {/* Collapse hint */}
        <div className="pb-2">
          <div className="h-1 w-4 rounded-full bg-gray-200" />
        </div>
      </div>
    );
  }

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <aside className="fixed right-4 top-20 z-30 w-80 max-h-[calc(100vh-6rem)] flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden transition-all duration-300 ease-in-out">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-600 to-emerald-600 flex items-center justify-center shrink-0">
              <ClipboardCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('dashboard.dailyTasks')}</h3>
              <p className="text-[11px] text-gray-400">{todayFormatted}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </span>
            <button
              onClick={onToggle}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Collapse"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-gray-600">
              {completedCount} / {tasks.length} {t('dashboard.tasksCompleted')}
            </span>
            <span className="font-bold text-primary-700">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Task list ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="text-center py-8">
            <ClipboardCheck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">{t('dashboard.noTasks')}</p>
          </div>
        )}

        {!loading &&
          tasks.map((task) => {
            const isDone = completed.includes(task.id);
            return (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer transition-all h-[42px] ${
                  isDone
                    ? 'bg-gray-50/60 border-gray-100'
                    : 'bg-white border-gray-150 hover:border-primary-200 hover:shadow-sm'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                  className={`shrink-0 h-4.5 w-4.5 rounded-md border-2 flex items-center justify-center transition-all ${
                    isDone
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 hover:border-primary-500'
                  }`}
                  style={{ height: 18, width: 18 }}
                >
                  {isDone && <Check className="h-2.5 w-2.5" />}
                </button>

                {/* Title — single line, truncated */}
                <p
                  className={`flex-1 min-w-0 text-xs font-semibold leading-none truncate ${
                    isDone ? 'line-through text-gray-400' : 'text-gray-800'
                  }`}
                >
                  {task.title}
                </p>

                {/* Urgency badge */}
                <span
                  className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${urgencyClasses(task.urgency)}`}
                >
                  {urgencyIcon(task.urgency)}
                  {task.urgency}
                </span>
              </div>
            );
          })}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={() => navigate('/monitoring')}
          className="w-full text-center text-[11px] font-medium text-primary-700 hover:text-primary-800 hover:underline"
        >
          {t('dashboard.viewAllMonitoring')} →
        </button>
      </div>

      {/* ── Task Detail Modal ── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isDone={completed.includes(selectedTask.id)}
          onToggle={() => toggleTask(selectedTask.id)}
          onNavigate={(link) => { navigate(link); setSelectedTask(null); }}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </aside>
  );
}

// ─── Task Detail Modal ───────────────────────────────────────────────────────

function sourceLabel(source: TaskSource): string {
  switch (source) {
    case 'monitoring-due': return 'Due Monitoring Check';
    case 'monitoring-upcoming': return 'Upcoming Monitoring Check';
    case 'weather-alert': return 'Weather Alert';
    case 'crop-schedule': return 'Crop Schedule';
  }
}

function TaskDetailModal({
  task,
  isDone,
  onToggle,
  onNavigate,
  onClose,
}: {
  task: DailyTask;
  isDone: boolean;
  onToggle: () => void;
  onNavigate: (link: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full sm:max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                task.urgency === 'High'
                  ? 'bg-red-100'
                  : task.urgency === 'Medium'
                    ? 'bg-amber-100'
                    : 'bg-emerald-100'
              }`}>
                {sourceIcon(task.source)}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{sourceLabel(task.source)}</p>
                <h4 className="text-sm font-bold text-gray-900 truncate">{task.title}</h4>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Urgency + Status row */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border ${urgencyClasses(task.urgency)}`}>
              {urgencyIcon(task.urgency)}
              {task.urgency} Priority
            </span>
            {isDone && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="h-3 w-3" /> Completed
              </span>
            )}
          </div>

          {/* Farm name */}
          {task.farmName && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="font-medium">{task.farmName}</span>
            </div>
          )}

          {/* Full description */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-700 leading-relaxed">
              {task.fullDescription || task.description}
            </p>
          </div>

          {/* Recommended actions */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Recommended Actions</p>
            <ul className="space-y-1">
              {task.source === 'monitoring-due' || task.source === 'monitoring-upcoming' ? (
                <>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><Leaf className="h-3 w-3 text-emerald-500" /> Inspect crop for pests and disease symptoms</li>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><Eye className="h-3 w-3 text-sky-500" /> Use Disease Camera for AI-powered analysis</li>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><ClipboardCheck className="h-3 w-3 text-violet-500" /> Record observations in monitoring log</li>
                </>
              ) : task.source === 'weather-alert' ? (
                <>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><CloudRain className="h-3 w-3 text-sky-500" /> Check weather forecast before field operations</li>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><AlertTriangle className="h-3 w-3 text-amber-500" /> Protect sensitive crops if needed</li>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><CalendarClock className="h-3 w-3 text-gray-400" /> Reschedule planned activities accordingly</li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><Leaf className="h-3 w-3 text-emerald-500" /> Assess crop readiness for harvest</li>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><CalendarClock className="h-3 w-3 text-amber-500" /> Arrange equipment and labour</li>
                  <li className="flex items-center gap-2 text-xs text-gray-600"><ClipboardCheck className="h-3 w-3 text-violet-500" /> Update crop records</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2">
          {/* Mark as Done */}
          <button
            onClick={onToggle}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              isDone
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            {isDone ? 'Mark as Pending' : 'Mark as Done'}
          </button>

          {/* Go to page */}
          <button
            onClick={() => onNavigate(task.detailLink)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
