import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCcw, Calendar, AlertTriangle, Sparkles, Send } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { AppShell } from "../../components/AppShell";
import { ConfirmModal } from "../../components/ConfirmModal";
import type { PolicyDto, DisciplineTopicOut, TeacherDisciplinesOut } from "../../types/api";

function toLocalIso(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fromLocalIso(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

function formatDateRussian(dStr: string | null): string {
  if (!dStr) return "Без ограничений";
  const d = new Date(dStr);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TestEditor() {
  const { disciplineId } = useParams<{ disciplineId: string }>();
  const did = Number(disciplineId);
  const qc = useQueryClient();
  const [form, setForm] = useState<PolicyDto | null>(null);
  const [confirmBulkSchedule, setConfirmBulkSchedule] = useState(false);
  const pushToast = useToasts((s) => s.push);

  const disc = useQuery<TeacherDisciplinesOut>({
    queryKey: ["teacher", "disciplines"],
    queryFn: () => api.get("/api/teacher/disciplines").then((r) => r.data),
  });

  const topics = useQuery<DisciplineTopicOut[]>({
    queryKey: ["v2", "disciplines", did, "topics"],
    queryFn: () => api.get(`/api/v2/teacher/disciplines/${did}/topics`).then((r) => r.data),
    enabled: Number.isFinite(did),
  });

  const policy = useQuery<PolicyDto | { teacher_id: number; discipline_id: number; updated_at: null }>({
    queryKey: ["v2", "policy", did],
    queryFn: () =>
      api
        .get(`/api/v2/teacher/policy/${did}`)
        .then((r) => r.data as PolicyDto)
        .catch((e) => {
          if (e.response?.status === 404) {
            return {
              teacher_id: 0,
              discipline_id: did,
              available_from: null,
              available_until: null,
              attempts_allowed: 1,
              shuffle_seed: true,
              show_correct_after_finish: true,
              allow_study: true,
              proctor_min_level: 0,
              updated_at: null,
            } as PolicyDto;
          }
          throw e;
        }),
    enabled: Number.isFinite(did),
  });

  // Sync the form from server data once per discipline. Keying on `did` (not
  // `!form`) fixes the editor showing empty/stale data when navigating between
  // disciplines without the component remounting, while still preserving the
  // teacher's unsaved edits across background refetches of the same discipline.
  const loadedDidRef = useRef<number | null>(null);
  useEffect(() => {
    if (policy.data && loadedDidRef.current !== did) {
      setForm(policy.data as PolicyDto);
      loadedDidRef.current = did;
    }
  }, [policy.data, did]);

  const putMut = useMutation({
    mutationFn: (payload: PolicyDto) =>
      api.put(`/api/v2/teacher/policy/${did}`, payload).then((r) => r.data),
    onSuccess: async (data) => {
      pushToast("success", "Расписание сохранено");
      setForm(data);
      await qc.invalidateQueries({ queryKey: ["v2", "policy", did] });
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const bulkScheduleMut = useMutation({
    mutationFn: (payload: { available_from: string | null; available_until: string | null }) =>
      api.post(`/api/v2/teacher/disciplines/${did}/topics/bulk-test-schedule`, payload).then((r) => r.data),
    onSuccess: async (data) => {
      pushToast("success", `Окно доступности успешно применено к ${data.count} темам`);
      await qc.invalidateQueries({ queryKey: ["v2", "disciplines", did, "topics"] });
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  // Policy template presets
  function applyTemplate(type: "week" | "semester" | "none") {
    if (!form) return;
    const now = new Date();
    let fromVal: string | null = now.toISOString();
    let untilVal: string | null = null;

    if (type === "week") {
      const w = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      untilVal = w.toISOString();
    } else if (type === "semester") {
      const s = new Date(now.getFullYear(), now.getMonth() + 4, now.getDate(), now.getHours(), now.getMinutes());
      untilVal = s.toISOString();
    } else {
      fromVal = null;
      untilVal = null;
    }

    setForm({ ...form, available_from: fromVal, available_until: untilVal });
    pushToast("info", "Шаблон применен к полям ввода. Не забудьте сохранить.");
  }

  // Conflict detection
  const conflicts = useMemo(() => {
    if (!topics.data) return [];
    const activeTests = topics.data
      .filter((t) => t.test && t.test.is_enabled)
      .map((t) => ({
        id: t.topic_id,
        name: t.name,
        from: t.test!.available_from ? new Date(t.test!.available_from) : null,
        until: t.test!.available_until ? new Date(t.test!.available_until) : null,
      }));

    const result: string[] = [];
    for (let i = 0; i < activeTests.length; i++) {
      for (let j = i + 1; j < activeTests.length; j++) {
        const t1 = activeTests[i];
        const t2 = activeTests[j];

        const f1 = t1.from ? t1.from.getTime() : 0;
        const u1 = t1.until ? t1.until.getTime() : Infinity;
        const f2 = t2.from ? t2.from.getTime() : 0;
        const u2 = t2.until ? t2.until.getTime() : Infinity;

        const overlap = f1 < u2 && f2 < u1;
        if (overlap) {
          result.push(`Конфликт расписаний: тесты по темам «${t1.name}» и «${t2.name}» пересекаются.`);
        }
      }
    }
    return result;
  }, [topics.data]);

  // Timeline coordinate calculations
  const timelineData = useMemo(() => {
    if (!form && !topics.data) return null;
    const now = new Date();
    
    // Collect all dates to find min/max
    const dates: Date[] = [new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)]; // default range starts 2 days ago
    if (form?.available_from) dates.push(new Date(form.available_from));
    if (form?.available_until) dates.push(new Date(form.available_until));
    
    topics.data?.forEach((t) => {
      if (t.test) {
        if (t.test.available_from) dates.push(new Date(t.test.available_from));
        if (t.test.available_until) dates.push(new Date(t.test.available_until));
      }
    });

    const minTime = Math.min(...dates.map((d) => d.getTime()));
    const maxTime = Math.max(...dates.map((d) => d.getTime()), now.getTime() + 14 * 24 * 60 * 60 * 1000); // at least 2 weeks forward

    const range = maxTime - minTime;

    function getPercentage(dateStr: string | null, fallbackPercent: number): number {
      if (!dateStr) return fallbackPercent;
      const t = new Date(dateStr).getTime();
      return Math.max(0, Math.min(100, ((t - minTime) / range) * 100));
    }

    const nowPercent = ((now.getTime() - minTime) / range) * 100;

    const items = [
      {
        name: "Общее окно (Дисциплина)",
        from: form?.available_from ? formatDateRussian(form.available_from) : "Всегда",
        until: form?.available_until ? formatDateRussian(form.available_until) : "Всегда",
        left: form?.available_from ? getPercentage(form.available_from, 0) : 0,
        width: form?.available_from || form?.available_until
          ? getPercentage(form.available_until, 100) - getPercentage(form.available_from, 0)
          : 100,
        isInfinite: !form?.available_from && !form?.available_until,
      },
    ];

    topics.data?.forEach((t) => {
      if (t.test && t.test.is_enabled) {
        items.push({
          name: `Тест темы: ${t.name}`,
          from: t.test.available_from ? formatDateRussian(t.test.available_from) : "Всегда",
          until: t.test.available_until ? formatDateRussian(t.test.available_until) : "Всегда",
          left: t.test.available_from ? getPercentage(t.test.available_from, 0) : 0,
          width: t.test.available_from || t.test.available_until
            ? getPercentage(t.test.available_until, 100) - getPercentage(t.test.available_from, 0)
            : 100,
          isInfinite: !t.test.available_from && !t.test.available_until,
        });
      }
    });

    return {
      minTime,
      maxTime,
      nowPercent,
      items,
    };
  }, [form, topics.data]);

  if (!Number.isFinite(did)) {
    return (
      <AppShell rightSlot={<Link to="/teacher" className="hidden md:inline-flex btn btn-ghost btn-sm">На главную</Link>}>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <EmptyState title="Некорректная дисциплина" description="Проверьте ссылку и вернитесь к списку дисциплин." />
        </section>
      </AppShell>
    );
  }

  if (policy.isLoading) {
    return (
      <AppShell rightSlot={<Link to="/teacher" className="hidden md:inline-flex btn btn-ghost btn-sm">На главную</Link>}>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6">
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-8 w-80 max-w-full" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-40 ml-auto" />
            </Card>
            <Card className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
            </Card>
          </div>
        </section>
      </AppShell>
    );
  }

  if (policy.isError) {
    return (
      <AppShell rightSlot={<Link to="/teacher" className="hidden md:inline-flex btn btn-ghost btn-sm">На главную</Link>}>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <EmptyState title="Не удалось открыть настройки" description={errorMessage(policy.error)} />
        </section>
      </AppShell>
    );
  }

  const dname = disc.data?.disciplines?.find((d) => d.discipline_id === did)?.name ?? `Дисциплина #${did}`;
  const dirty = JSON.stringify(form) !== JSON.stringify(policy.data);

  return (
    <AppShell rightSlot={<Link to="/teacher" className="hidden md:inline-flex btn btn-ghost btn-sm">На главную</Link>}>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <Link to="/teacher" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> К дисциплинам
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2">Тест по дисциплине · {dname}</h1>
        </header>

        {conflicts.length > 0 && (
          <div className="mb-6 p-4 border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 rounded-lg flex gap-3 text-sm text-[var(--color-danger)]">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold">Обнаружены конфликты пересечения окон тем:</span>
              <ul className="list-disc pl-4 space-y-1">
                {conflicts.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 space-y-4">
            {form && (
              <Card className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 mb-2">
                  <span className="font-medium text-sm text-[var(--color-text-secondary)]">Настройка общего теста по дисциплине</span>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[var(--color-accent)]" />
                    <span className="text-xs text-[var(--color-text-muted)]">Шаблоны:</span>
                    <button type="button" className="btn btn-ghost btn-xs px-1.5" onClick={() => applyTemplate("week")}>Неделя</button>
                    <button type="button" className="btn btn-ghost btn-xs px-1.5" onClick={() => applyTemplate("semester")}>Семестр</button>
                    <button type="button" className="btn btn-ghost btn-xs px-1.5 text-[var(--color-danger)]" onClick={() => applyTemplate("none")}>Сбросить</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Доступен с" hint="Опционально: окно открытия">
                    <Input
                      type="datetime-local"
                      value={toLocalIso(form.available_from)}
                      onChange={(e) => setForm({ ...form, available_from: fromLocalIso(e.target.value) })}
                    />
                  </Field>
                  <Field label="Доступен по" hint="Опционально: окно закрытия">
                    <Input
                      type="datetime-local"
                      value={toLocalIso(form.available_until)}
                      onChange={(e) => setForm({ ...form, available_until: fromLocalIso(e.target.value) })}
                    />
                  </Field>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    iconLeft={<Send className="w-3.5 h-3.5" />}
                    onClick={() => setConfirmBulkSchedule(true)}
                  >
                    Применить это окно ко всем темам
                  </Button>
                </div>

                <Field label="Попыток на студента (0 = бесконечно)" hint="Сколько раз каждый студент может начать тест по дисциплине">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.attempts_allowed}
                    onChange={(e) =>
                      setForm({ ...form, attempts_allowed: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                    }
                  />
                </Field>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-accent)]"
                      checked={form.shuffle_seed}
                      onChange={(e) => setForm({ ...form, shuffle_seed: e.target.checked })}
                    />
                    Перемешивать вопросы и варианты
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-accent)]"
                      checked={form.show_correct_after_finish}
                      onChange={(e) => setForm({ ...form, show_correct_after_finish: e.target.checked })}
                    />
                    Показывать студенту правильные ответы после завершения
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-accent)]"
                      checked={form.allow_study}
                      onChange={(e) => setForm({ ...form, allow_study: e.target.checked })}
                    />
                    Разрешить самоподготовку (просмотр вопросов перед тестом)
                  </label>
                </div>

                <Field label="Proctor-уровень">
                  <Select
                    value={form.proctor_min_level}
                    onChange={(e) => setForm({ ...form, proctor_min_level: Number(e.target.value) })}
                  >
                    <option value={0}>off — без отслеживания</option>
                    <option value={1}>light — лог переключений вкладок и blur</option>
                    <option value={2}>strict — полный прокторинг</option>
                  </Select>
                </Field>

                <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
                  <Button
                    variant="ghost"
                    iconLeft={<RotateCcw className="w-4 h-4" />}
                    onClick={() => policy.data && setForm(policy.data as PolicyDto)}
                    disabled={!dirty}
                  >
                    Сброс
                  </Button>
                  <Button
                    loading={putMut.isPending}
                    disabled={!dirty}
                    iconLeft={<Save className="w-4 h-4" />}
                    onClick={() => putMut.mutate(form)}
                  >
                    Сохранить
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* Timeline visualization */}
          <div className="space-y-4">
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold border-b border-[var(--color-border)] pb-2">
                <Calendar className="w-4 h-4 text-[var(--color-accent)]" />
                <span>Визуальный таймлайн окон доступности</span>
              </div>

              {timelineData && (
                <div className="border border-[var(--color-border)] rounded-md bg-[var(--color-bg-muted)]/10 text-xs">
                  {/* Range header — kept outside the plot so the NOW line can't
                      cross it. */}
                  <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border)] px-3 py-1.5 font-mono">
                    <span>{new Date(timelineData.minTime).toLocaleDateString()}</span>
                    <span>{new Date(timelineData.maxTime).toLocaleDateString()}</span>
                  </div>

                  {/* Plot: every row's track lives in the same 1fr column, so a
                      single NOW line can be aligned to the bar coordinates and
                      scoped to the track column (never overlapping the labels). */}
                  <div className="relative p-3 space-y-2 font-medium">
                    {timelineData.items.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-[110px_1fr] items-center gap-2 relative group/item">
                        <div className="relative">
                          <span
                            className="text-[11px] font-semibold text-[var(--color-text-secondary)] truncate block w-[110px] cursor-help"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <div className="absolute left-0 bottom-full mb-1 hidden group-hover/item:block z-30 bg-gray-950 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-md border border-gray-800">
                            {item.name}
                          </div>
                        </div>
                        <div className="relative h-5 bg-[var(--color-bg-muted)] rounded border border-[var(--color-border)] overflow-hidden">
                          <div
                            className={`absolute top-0 bottom-0 rounded ${idx === 0 ? "bg-indigo-600/40 border border-indigo-500/60" : "bg-emerald-600/40 border border-emerald-500/60"}`}
                            style={{
                              left: `${item.left}%`,
                              width: `${item.width}%`,
                            }}
                            title={`Окно: ${item.from} — ${item.until}`}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--color-text-primary)] font-semibold pointer-events-none drop-shadow">
                            {item.isInfinite ? "Без ограничений" : "Активно"}
                          </span>
                        </div>
                      </div>
                    ))}

                    {timelineData.nowPercent >= 0 && timelineData.nowPercent <= 100 && (
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-red-500/50 z-20"
                        style={{
                          left: `calc(0.75rem + 110px + 0.5rem + (100% - 1.5rem - 110px - 0.5rem) * ${timelineData.nowPercent} / 100)`,
                        }}
                        title={`Текущий момент: ${formatDateRussian(new Date().toISOString())}`}
                      >
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-red-500 text-[9px] text-white px-1 py-0.5 rounded font-mono font-semibold z-30">
                          NOW
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirmBulkSchedule}
        onClose={() => setConfirmBulkSchedule(false)}
        title="Применить расписание ко всем темам?"
        description={
          form
            ? `Вы действительно хотите скопировать окно доступности (с ${formatDateRussian(form.available_from)} по ${formatDateRussian(form.available_until)}) во все темы дисциплины «${dname}»? Это заменит все их текущие расписания.`
            : undefined
        }
        confirmLabel="Применить"
        loading={bulkScheduleMut.isPending}
        onConfirm={async () => {
          if (!form) return;
          setConfirmBulkSchedule(false);
          await bulkScheduleMut.mutateAsync({
            available_from: form.available_from,
            available_until: form.available_until,
          });
        }}
      />
    </AppShell>
  );
}
