import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api/client";
import { Shell } from "../../components/AppShell";
import { Toast } from "../../components/ui/Toast";
import { useAuth } from "../../store/auth";
import type {
  OptionIn,
  QuestionIn,
  QuestionWithOptions,
  TeacherDisciplinesOut,
} from "../../types/api";

function emptyOption(ix: number): OptionIn {
  return {
    option_number: ix + 1,
    text: ix === 0 ? "" : "",
    is_correct: false,
  };
}

function blankQuestion(disciplineId: number): QuestionIn {
  return {
    discipline_id: disciplineId,
    text: "",
    difficulty: 1,
    options: [emptyOption(0), emptyOption(1), emptyOption(2), emptyOption(3)],
  };
}

export default function Questions() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<QuestionIn | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");
  const [err, setErr] = useState<string | null>(null);

  const disc = useQuery<TeacherDisciplinesOut>({
    queryKey: ["teacher", "disciplines"],
    queryFn: () => api.get("/api/teacher/disciplines").then((r) => r.data),
  });

  const qs = useQuery<QuestionWithOptions[]>({
    queryKey: ["teacher", "questions"],
    queryFn: () => api.get("/api/teacher/questions").then((r) => r.data),
  });

  const filtered = useMemo(() => {
    if (!qs.data) return [];
    if (filter === "all") return qs.data;
    return qs.data.filter((q) => q.discipline_id === filter);
  }, [qs.data, filter]);

  const createMut = useMutation({
    mutationFn: (payload: QuestionIn) =>
      api.post("/api/teacher/questions", payload).then((r) => r.data),
    onSuccess: async () => {
      setErr(null);
      setEditor(null);
      await qc.invalidateQueries({ queryKey: ["teacher", "questions"] });
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  function startNew() {
    const firstId = disc.data?.disciplines[0]?.discipline_id;
    if (firstId == null) return;
    setEditor(blankQuestion(firstId));
    setErr(null);
  }

  function updateOption(i: number, patch: Partial<OptionIn>) {
    if (!editor) return;
    const opts = editor.options.map((o, ix) => (ix === i ? { ...o, ...patch } : o));
    setEditor({ ...editor, options: opts });
  }

  return (
    <Shell
      title={`Преподаватель: ${user?.full_name}`}
      right={
        <div className="flex gap-2">
          <Link className="btn-ghost" to="/teacher">
            На главную
          </Link>
          <button className="btn-ghost" onClick={logout}>Выйти</button>
        </div>
      }
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 items-center">
          <h2 className="text-lg font-semibold">Вопросы</h2>
          <select
            className="input w-auto"
            value={filter === "all" ? "all" : String(filter)}
            onChange={(e) =>
              setFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Все дисциплины</option>
            {disc.data?.disciplines.map((d) => (
              <option key={d.discipline_id} value={d.discipline_id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={!disc.data?.disciplines.length} onClick={startNew}>
          + Новый вопрос
        </button>
      </div>

      {err && <div className="mb-3"><Toast kind="error">{err}</Toast></div>}
      {qs.isLoading && <p className="text-slate-500">Загрузка…</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Дисциплина</th>
              <th className="py-2 pr-3">Текст</th>
              <th className="py-2 pr-3">Сложность</th>
              <th className="py-2 pr-3">Правильный вариант</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => {
              const correct = q.options.find((o) => o.is_correct);
              const discName = disc.data?.disciplines.find((d) => d.discipline_id === q.discipline_id)?.name ?? `#${q.discipline_id}`;
              return (
                <tr key={q.question_id} className="border-t border-slate-200">
                  <td className="py-2 pr-3">{q.question_id}</td>
                  <td className="py-2 pr-3">{discName}</td>
                  <td className="py-2 pr-3">{q.text}</td>
                  <td className="py-2 pr-3">{q.difficulty}</td>
                  <td className="py-2 pr-3">
                    {correct ? <span className="badge-green">№{correct.option_number}: {correct.text}</span> : <span className="badge-red">нет</span>}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && !qs.isLoading && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-500">Пока нет вопросов</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-10">
          <div className="card w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-3">Новый вопрос</h3>
            <label className="label">Дисциплина</label>
            <select
              className="input"
              value={editor.discipline_id}
              onChange={(e) => setEditor({ ...editor, discipline_id: Number(e.target.value) })}
            >
              {disc.data?.disciplines.map((d) => (
                <option key={d.discipline_id} value={d.discipline_id}>{d.name}</option>
              ))}
            </select>
            <div className="h-2" />
            <label className="label">Текст вопроса</label>
            <textarea
              className="input"
              rows={3}
              value={editor.text}
              onChange={(e) => setEditor({ ...editor, text: e.target.value })}
            />
            <div className="h-2" />
            <label className="label">Сложность (1-5)</label>
            <input
              className="input w-24"
              type="number"
              min={1}
              max={5}
              value={editor.difficulty}
              onChange={(e) => setEditor({ ...editor, difficulty: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
            />
            <div className="h-3" />
            <div className="space-y-2">
              {editor.options.map((o, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="w-6 text-center font-semibold">{o.option_number}</span>
                  <input
                    className="input"
                    placeholder={`Вариант ${o.option_number}`}
                    value={o.text}
                    onChange={(e) => updateOption(i, { text: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name="correct"
                      checked={o.is_correct}
                      onChange={() => {
                        const opts = editor.options.map((oo, ix) => ({ ...oo, is_correct: ix === i }));
                        setEditor({ ...editor, options: opts });
                      }}
                    />
                    верный
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-ghost" onClick={() => setEditor(null)}>Отмена</button>
              <button
                className="btn-primary"
                disabled={createMut.isPending || !editor.text.trim() || editor.options.some((o) => !o.text.trim())}
                onClick={() => createMut.mutate(editor)}
              >
                {createMut.isPending ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
