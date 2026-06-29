import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Check,
  X,
  Edit2,
  RotateCcw,
  Filter,
  CheckSquare,
  Square,
  ChevronDown,
  Info,
  Trash2,
  Loader2,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { useToasts } from "../../components/ui/Toast";
import { api } from "../../api/client";
import {
  getPendingQuestions,
  approveQuestion,
  rejectQuestion,
  editPendingQuestion,
  regeneratePendingQuestion,
  batchApproveQuestions,
  batchRejectQuestions,
} from "../../api/ai";
import { QuestionWithType, QuestionType } from "../../types/api";

const TYPE_LABELS: Record<string, string> = {
  single: "Одиночный выбор",
  multi: "Множественный выбор",
  bool: "Да / Нет",
  short: "Краткий ответ",
  numeric: "Числовой ответ",
  match: "Установление соответствия",
};

export default function AiQuestionReview() {
  const pushToast = useToasts((s) => s.push);

  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionWithType[]>([]);
  const [disciplines, setDisciplines] = useState<any[]>([]);

  // Filters State
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<number | "">("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | "">("");

  // Selection state for batch actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Edit / Regenerate Modals state
  const [editingQuestion, setEditingQuestion] = useState<QuestionWithType | null>(null);
  const [editForm, setEditForm] = useState<{
    text: string;
    explanation: string;
    difficulty: number;
    options: Array<{ option_number: number; text: string; is_correct: boolean }>;
    short_pattern: string;
    numeric_tolerance: number;
    correct_bool: boolean;
  } | null>(null);

  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [submittingRegen, setSubmittingRegen] = useState(false);

  // Load disciplines on mount
  useEffect(() => {
    async function loadDisciplines() {
      try {
        const r = await api.get("/api/v2/teacher/question-bank/disciplines");
        setDisciplines(r.data);
      } catch (e: any) {
        console.error(e);
        pushToast({ tone: "error", title: "Ошибка", body: "Не удалось загрузить список дисциплин" });
      }
    }
    loadDisciplines();
  }, []);

  // Fetch pending questions
  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const data = await getPendingQuestions(selectedDisciplineId || undefined);
      setQuestions(data);
      setSelectedIds([]); // Reset selection on reload
    } catch (e: any) {
      console.error(e);
      pushToast({ tone: "error", title: "Ошибка загрузки вопросов", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [selectedDisciplineId]);

  // Filter questions locally (type, difficulty)
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesType = !selectedType || q.qtype === selectedType;
      const matchesDiff = !selectedDifficulty || q.difficulty === selectedDifficulty;
      return matchesType && matchesDiff;
    });
  }, [questions, selectedType, selectedDifficulty]);

  // Individual Actions
  const handleApprove = async (id: number) => {
    try {
      await approveQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.question_id !== id));
      pushToast({ tone: "success", title: "Вопрос одобрен", body: "Вопрос перенесен в банк вопросов" });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка одобрения", body: e.message });
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.question_id !== id));
      pushToast({ tone: "success", title: "Вопрос отклонен", body: "Вопрос удален из очереди проверки" });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка отклонения", body: e.message });
    }
  };

  // Batch Actions
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      await batchApproveQuestions(selectedIds);
      setQuestions((prev) => prev.filter((q) => !selectedIds.includes(q.question_id)));
      pushToast({
        tone: "success",
        title: "Пакетное одобрение завершено",
        body: `Успешно одобрено ${selectedIds.length} вопросов`,
      });
      setSelectedIds([]);
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка пакетного одобрения", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      await batchRejectQuestions(selectedIds);
      setQuestions((prev) => prev.filter((q) => !selectedIds.includes(q.question_id)));
      pushToast({
        tone: "success",
        title: "Пакетное отклонение завершено",
        body: `Отклонено ${selectedIds.length} вопросов`,
      });
      setSelectedIds([]);
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка пакетного отклонения", body: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Select all / Toggle selection
  const handleToggleSelectAll = () => {
    const visibleIds = filteredQuestions.map((q) => q.question_id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleToggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Edit logic
  const startEdit = (q: QuestionWithType) => {
    setEditingQuestion(q);
    setEditForm({
      text: q.text,
      explanation: q.explanation || "",
      difficulty: q.difficulty,
      options: q.options ? q.options.map((o) => ({ ...o })) : [],
      short_pattern: q.short_pattern || "",
      numeric_tolerance: q.numeric_tolerance || 0,
      correct_bool: q.correct_bool ?? false,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingQuestion || !editForm) return;
    try {
      const payload: any = {
        text: editForm.text,
        explanation: editForm.explanation,
        difficulty: editForm.difficulty,
      };

      if (["single", "multi"].includes(editingQuestion.qtype)) {
        payload.options = editForm.options;
      } else if (editingQuestion.qtype === "short") {
        payload.short_pattern = editForm.short_pattern;
      } else if (editingQuestion.qtype === "numeric") {
        payload.numeric_tolerance = editForm.numeric_tolerance;
      } else if (editingQuestion.qtype === "bool") {
        payload.correct_bool = editForm.correct_bool;
      }

      const updated = await editPendingQuestion(editingQuestion.question_id, payload);
      setQuestions((prev) => prev.map((q) => (q.question_id === updated.question_id ? updated : q)));
      pushToast({ tone: "success", title: "Вопрос изменен", body: "Изменения сохранены" });
      setEditingQuestion(null);
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка сохранения", body: e.message });
    }
  };

  // Regeneration logic
  const handleRegenerate = async () => {
    if (!regeneratingId || !regenInstruction.trim()) return;
    try {
      setSubmittingRegen(true);
      const newQuestion = await regeneratePendingQuestion(regeneratingId, regenInstruction.trim());
      // Remove old question and add new one
      setQuestions((prev) => [
        newQuestion,
        ...prev.filter((q) => q.question_id !== regeneratingId),
      ]);
      pushToast({ tone: "success", title: "Вопрос регенерирован", body: "Сгенерирован новый черновик" });
      setRegeneratingId(null);
      setRegenInstruction("");
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка регенерации", body: e.message });
    } finally {
      setSubmittingRegen(false);
    }
  };

  const visibleIds = filteredQuestions.map((q) => q.question_id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <AppShell>
      <div className="flex-1 flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-y-auto pb-24">
        {/* Header */}
        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-850 dark:text-neutral-100 flex items-center space-x-2">
                  <span>Очередь проверки ИИ</span>
                  <span className="text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/50">
                    Черновики: {questions.length}
                  </span>
                </h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-450 mt-0.5">
                  Оцените, отредактируйте или переделайте вопросы от ИИ перед публикацией в банк вопросов
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center space-x-6 text-xs text-neutral-600 dark:text-neutral-400 font-medium">
              <div className="flex flex-col">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase font-semibold">На проверке</span>
                <span className="text-base font-bold text-neutral-800 dark:text-neutral-200">{questions.length}</span>
              </div>
              <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-800" />
              <div className="flex flex-col">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase font-semibold">Выбрано</span>
                <span className="text-base font-bold text-indigo-600 dark:text-indigo-450">{selectedIds.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Actions Bar */}
        <div className="p-6">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center space-x-2 text-neutral-500 dark:text-neutral-400">
              <Filter className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Фильтры</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              {/* Discipline filter */}
              <select
                value={selectedDisciplineId}
                onChange={(e) => setSelectedDisciplineId(e.target.value ? Number(e.target.value) : "")}
                className="select text-xs py-2 bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Все дисциплины</option>
                {disciplines.map((d) => (
                  <option key={d.discipline_id} value={d.discipline_id}>
                    {d.name}
                  </option>
                ))}
              </select>

              {/* Type filter */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="select text-xs py-2 bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Все типы вопросов</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              {/* Difficulty filter */}
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value ? Number(e.target.value) : "")}
                className="select text-xs py-2 bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Любая сложность</option>
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    Сложность {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* List of Questions */}
        <div className="px-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <span className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Загрузка очереди...</span>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm p-8">
              <Info className="w-12 h-12 text-neutral-350 dark:text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-neutral-850 dark:text-neutral-200 mb-1">
                Очередь пуста
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-450 max-w-sm mx-auto">
                Вопросы со статусом «На проверке» не найдены. Сгенерируйте новые вопросы с помощью ИИ-кнопки в банке вопросов.
              </p>
            </div>
          ) : (
            <>
              {/* Select All Checkbox bar */}
              <div className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-3 shadow-xs">
                <button
                  onClick={handleToggleSelectAll}
                  className="flex items-center space-x-2.5 text-xs text-neutral-700 dark:text-neutral-300 font-semibold cursor-pointer"
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-4.5 h-4.5 text-indigo-650" />
                  ) : (
                    <Square className="w-4.5 h-4.5 text-neutral-400" />
                  )}
                  <span>Выбрать все ({filteredQuestions.length})</span>
                </button>
              </div>

              {filteredQuestions.map((q) => {
                const isSelected = selectedIds.includes(q.question_id);
                const isRegening = regeneratingId === q.question_id;

                return (
                  <div
                    key={q.question_id}
                    className={`bg-white dark:bg-neutral-900 border rounded-2xl shadow-sm hover:shadow-md transition duration-150 flex items-start p-5 ${
                      isSelected
                        ? "border-indigo-400 dark:border-indigo-800 bg-indigo-50/5 dark:bg-indigo-950/5"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleSelectOne(q.question_id)}
                      className="mt-1 mr-4 text-neutral-450 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-550" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 space-y-4 min-w-0">
                      {/* Meta Tags */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-2 py-0.5 rounded-md font-semibold">
                          ID: {q.question_id}
                        </span>
                        <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded-md font-semibold border border-indigo-100/40 dark:border-indigo-900/40">
                          {TYPE_LABELS[q.qtype] || q.qtype}
                        </span>
                        <span className="text-[10px] bg-amber-50 dark:bg-amber-950/20 text-amber-650 dark:text-amber-400 px-2 py-0.5 rounded-md font-semibold border border-amber-100/40 dark:border-amber-900/40">
                          Сложность: {q.difficulty}
                        </span>
                        {q.topic_name && (
                          <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-450 px-2 py-0.5 rounded-md truncate max-w-[200px]" title={q.topic_name}>
                            Тема: {q.topic_name}
                          </span>
                        )}
                        {q.ai_model_used && (
                          <span className="text-[9px] text-neutral-400 dark:text-neutral-550 ml-auto flex items-center space-x-1">
                            <Sparkles className="w-3 h-3 text-indigo-500" />
                            <span>Модель: {q.ai_model_used}</span>
                          </span>
                        )}
                      </div>

                      {/* Question Text */}
                      <div className="text-sm font-semibold text-neutral-850 dark:text-neutral-100 leading-relaxed">
                        {q.text}
                      </div>

                      {/* Answers / Options Preview */}
                      <div className="bg-neutral-50 dark:bg-neutral-950/50 rounded-xl p-3.5 border border-neutral-150 dark:border-neutral-850 space-y-2">
                        {["single", "multi"].includes(q.qtype) && q.options && (
                          <div className="space-y-1.5">
                            {q.options.map((opt) => (
                              <div
                                key={opt.option_number}
                                className={`flex items-center text-xs p-2 rounded-lg border ${
                                  opt.is_correct
                                    ? "bg-green-500/10 dark:bg-green-500/5 border-green-200 dark:border-green-950 text-green-700 dark:text-green-400 font-medium"
                                    : "bg-white dark:bg-neutral-900 border-neutral-150 dark:border-neutral-850 text-neutral-600 dark:text-neutral-400"
                                }`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center mr-2 text-[10px] font-semibold ${
                                  opt.is_correct
                                    ? "bg-green-500 text-white"
                                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                                }`}>
                                  {opt.option_number}
                                </span>
                                <span>{opt.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {q.qtype === "bool" && (
                          <div className="text-xs flex items-center space-x-2">
                            <span className="font-semibold text-neutral-500 dark:text-neutral-450">Верное утверждение:</span>
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              q.correct_bool
                                ? "bg-green-100 dark:bg-green-955 text-green-750"
                                : "bg-red-100 dark:bg-red-955 text-red-755"
                            }`}>
                              {q.correct_bool ? "Истина (Да)" : "Ложь (Нет)"}
                            </span>
                          </div>
                        )}

                        {q.qtype === "short" && (
                          <div className="text-xs space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-neutral-500 dark:text-neutral-450">Паттерн правильного ответа (регулярное выражение):</span>
                              <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono font-bold text-neutral-800 dark:text-neutral-200">
                                {q.short_pattern || "—"}
                              </code>
                            </div>
                            {q.acceptable_answers && q.acceptable_answers.length > 0 && (
                              <div className="flex items-start space-x-2 mt-1">
                                <span className="font-semibold text-neutral-500 dark:text-neutral-450 flex-shrink-0">Альтернативные варианты:</span>
                                <div className="flex flex-wrap gap-1">
                                  {q.acceptable_answers.map((ans, idx) => (
                                    <span key={idx} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-neutral-700 dark:text-neutral-300">
                                      {ans}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {q.qtype === "numeric" && (
                          <div className="text-xs space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-neutral-500 dark:text-neutral-450">Основной числовой ответ:</span>
                              <span className="font-bold text-neutral-800 dark:text-neutral-250">
                                {q.acceptable_answers?.[0] || "—"}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-neutral-500 dark:text-neutral-450">Допустимая погрешность:</span>
                              <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-neutral-800 dark:text-neutral-200">
                                ± {q.numeric_tolerance ?? 0}
                              </code>
                            </div>
                          </div>
                        )}

                        {q.qtype === "match" && q.match_pairs && (
                          <div className="text-xs space-y-1">
                            <span className="font-semibold text-neutral-500 dark:text-neutral-450 block mb-1">Установленные пары:</span>
                            <div className="grid grid-cols-1 gap-1">
                              {q.match_pairs.map((pair, idx) => (
                                <div key={idx} className="flex items-center space-x-2 bg-white dark:bg-neutral-900 p-1.5 rounded-lg border border-neutral-150 dark:border-neutral-850">
                                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">{pair.left}</span>
                                  <span className="text-neutral-400">→</span>
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{pair.right}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="text-[11px] text-neutral-550 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-850 pt-2 mt-2 leading-relaxed flex items-start space-x-1.5">
                            <Info className="w-3.5 h-3.5 text-neutral-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Объяснение правильного ответа:</span> {q.explanation}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Action Area */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => startEdit(q)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 border border-neutral-250 dark:border-neutral-850 hover:border-indigo-300 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 transition cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Изменить</span>
                          </button>
                          <button
                            onClick={() => setRegeneratingId(q.question_id)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 border border-neutral-250 dark:border-neutral-850 hover:border-amber-300 hover:bg-amber-50/10 dark:hover:bg-amber-950/10 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 transition cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3 text-amber-550" />
                            <span>Переделать</span>
                          </button>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleReject(q.question_id)}
                            className="inline-flex items-center space-x-1 px-3.5 py-1.5 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-650 dark:text-red-400 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Отклонить</span>
                          </button>
                          <button
                            onClick={() => handleApprove(q.question_id)}
                            className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Одобрить</span>
                          </button>
                        </div>
                      </div>

                      {/* Inline Regenerate Form if open for this question */}
                      {isRegening && (
                        <div className="bg-amber-50/45 dark:bg-amber-955/10 rounded-xl p-4 border border-amber-200 dark:border-amber-900/30 space-y-3 mt-3 animate-fadeIn">
                          <div className="flex items-start space-x-2">
                            <AlertTriangle className="w-4.5 h-4.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-amber-800 dark:text-amber-400 font-medium">
                              Введите инструкцию для перегенерации вопроса. Предыдущая версия вопроса будет отклонена, и ИИ создаст новый вариант черновика.
                            </div>
                          </div>
                          <Field label="Инструкция для ИИ" required>
                            <textarea
                              value={regenInstruction}
                              onChange={(e) => setRegenInstruction(e.target.value)}
                              placeholder="Например: Сделай вопрос сложнее, добавь больше вариантов, или исправь формулировку на..."
                              rows={2}
                              className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-250 dark:border-neutral-800 rounded-xl px-3 py-2 text-neutral-850 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                            />
                          </Field>
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => {
                                setRegeneratingId(null);
                                setRegenInstruction("");
                              }}
                              disabled={submittingRegen}
                              className="px-3 py-1.5 border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-350 cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={handleRegenerate}
                              disabled={submittingRegen || !regenInstruction.trim()}
                              className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-55"
                            >
                              {submittingRegen ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              <span>Запустить ИИ</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Batch Actions Sticky Footer Bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-t border-neutral-250 dark:border-neutral-800 p-4 shadow-lg flex items-center justify-center space-x-4 z-40 animate-slideUp">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-350">
              Пакетные действия ({selectedIds.length} вопросов):
            </span>
            <button
              onClick={handleBatchReject}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-2 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-955/20 text-red-650 dark:text-red-400 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>Отклонить выбранные</span>
            </button>
            <button
              onClick={handleBatchApprove}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md transition cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Одобрить выбранные</span>
            </button>
          </div>
        )}

        {/* Edit Modal */}
        {editingQuestion && editForm && (
          <Modal
            open={!!editingQuestion}
            onClose={() => setEditingQuestion(null)}
            title="Редактирование вопроса"
            size="md"
          >
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <Field label="Текст вопроса" required>
                <Textarea
                  value={editForm.text}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  rows={3}
                  className="text-xs"
                />
              </Field>

              <Field label="Сложность (1-5)" required>
                <Select
                  value={editForm.difficulty}
                  onChange={(e) => setEditForm({ ...editForm, difficulty: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Options Editor (for single/multi) */}
              {["single", "multi"].includes(editingQuestion.qtype) && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-250">
                    Варианты ответа
                  </label>
                  {editForm.options.map((opt, idx) => (
                    <div key={opt.option_number} className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          const updatedOpts = [...editForm.options];
                          if (editingQuestion.qtype === "single") {
                            // Uncheck all other options
                            updatedOpts.forEach((o, i) => {
                              o.is_correct = i === idx;
                            });
                          } else {
                            // Toggle checkbox
                            updatedOpts[idx].is_correct = !updatedOpts[idx].is_correct;
                          }
                          setEditForm({ ...editForm, options: updatedOpts });
                        }}
                        className={`w-5 h-5 rounded flex items-center justify-center border cursor-pointer ${
                          opt.is_correct
                            ? "bg-green-500 border-green-600 text-white"
                            : "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-750 text-neutral-400"
                        }`}
                      >
                        {opt.is_correct && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const updatedOpts = [...editForm.options];
                          updatedOpts[idx].text = e.target.value;
                          setEditForm({ ...editForm, options: updatedOpts });
                        }}
                        className="flex-1 text-xs bg-white dark:bg-neutral-900 border border-neutral-250 dark:border-neutral-800 rounded-xl px-3 py-1.5 text-neutral-800 dark:text-neutral-105"
                      />
                    </div>
                  ))}
                </div>
              )}

              {editingQuestion.qtype === "bool" && (
                <Field label="Верный ответ">
                  <Select
                    value={editForm.correct_bool ? "true" : "false"}
                    onChange={(e) => setEditForm({ ...editForm, correct_bool: e.target.value === "true" })}
                  >
                    <option value="true">Истина (Да)</option>
                    <option value="false">Ложь (Нет)</option>
                  </Select>
                </Field>
              )}

              {editingQuestion.qtype === "short" && (
                <Field label="Паттерн краткого ответа (regexp)" required>
                  <input
                    type="text"
                    value={editForm.short_pattern}
                    onChange={(e) => setEditForm({ ...editForm, short_pattern: e.target.value })}
                    className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-250 dark:border-neutral-800 rounded-xl px-3 py-2 text-neutral-850 dark:text-neutral-100"
                  />
                </Field>
              )}

              {editingQuestion.qtype === "numeric" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Верное число" required>
                    <input
                      type="text"
                      value={editForm.short_pattern}
                      onChange={(e) => setEditForm({ ...editForm, short_pattern: e.target.value })}
                      className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-250 dark:border-neutral-800 rounded-xl px-3 py-2 text-neutral-850 dark:text-neutral-100"
                    />
                  </Field>
                  <Field label="Погрешность (±)" required>
                    <input
                      type="number"
                      value={editForm.numeric_tolerance}
                      onChange={(e) => setEditForm({ ...editForm, numeric_tolerance: Number(e.target.value) })}
                      className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-250 dark:border-neutral-800 rounded-xl px-3 py-2 text-neutral-850 dark:text-neutral-100"
                    />
                  </Field>
                </div>
              )}

              <Field label="Объяснение правильного ответа" required>
                <Textarea
                  value={editForm.explanation}
                  onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                  rows={3}
                  className="text-xs"
                />
              </Field>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-neutral-200 dark:border-neutral-850">
              <Button variant="secondary" onClick={() => setEditingQuestion(null)}>
                Отмена
              </Button>
              <Button variant="primary" onClick={handleSaveEdit}>
                Сохранить
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
