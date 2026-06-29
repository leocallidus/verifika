import React, { useState, useEffect } from "react";
import { Sparkles, Loader2, AlertTriangle, Upload, FileText } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Select, Textarea } from "../ui/Field";
import { useToasts } from "../ui/Toast";
import { api } from "../../api/client";
import { startQuestionGeneration, getGenerationTaskStatus, getAiStatus } from "../../api/ai";
import { AiGenerationTask } from "../../types/ai";

interface AiGenerateModalProps {
  open: boolean;
  onClose: () => void;
  initialDisciplineId?: number | null;
  initialTopicId?: number | null;
  onSuccess?: (taskId: string, count: number) => void;
}

const QUESTION_TYPES = [
  { id: "single", label: "Один из вариантов (single)" },
  { id: "multi", label: "Несколько вариантов (multi)" },
  { id: "bool", label: "Да/Нет (bool)" },
  { id: "numeric", label: "Числовой (numeric)" },
  { id: "short", label: "Краткий ответ (short)" },
  { id: "match", label: "Соответствие (match)" },
];

export default function AiGenerateModal({
  open,
  onClose,
  initialDisciplineId,
  initialTopicId,
  onSuccess,
}: AiGenerateModalProps) {
  const pushToast = useToasts((s) => s.push);

  const [disciplines, setDisciplines] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);

  // Form State
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<number | "">("");
  const [selectedTopicId, setSelectedTopicId] = useState<number | "">("");
  const [topicNameHint, setTopicNameHint] = useState("");
  const [count, setCount] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["single", "multi"]);
  const [difficultyMin, setDifficultyMin] = useState(1);
  const [difficultyMax, setDifficultyMax] = useState(3);
  const [language, setLanguage] = useState("ru");
  const [additionalContext, setAdditionalContext] = useState("");
  const [material, setMaterial] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  // Generation Task State
  const [generating, setGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<AiGenerationTask | null>(null);

  // Load config, status & models
  useEffect(() => {
    if (!open) return;
    async function loadConfig() {
      try {
        setLoadingConfig(true);
        // Load disciplines
        const r = await api.get("/api/v2/teacher/question-bank/disciplines");
        setDisciplines(r.data);
        if (initialDisciplineId) {
          setSelectedDisciplineId(initialDisciplineId);
        } else if (r.data.length > 0) {
          setSelectedDisciplineId(r.data[0].discipline_id);
        }

        // Load AI status for allowed models
        const aiStatus = await getAiStatus();
        if (aiStatus.generation_models_allowed && aiStatus.generation_models_allowed.length > 0) {
          setAllowedModels(aiStatus.generation_models_allowed);
          setSelectedModel(aiStatus.generation_model || aiStatus.generation_models_allowed[0]);
        }
      } catch (e: any) {
        console.error(e);
        pushToast({ tone: "error", title: "Не удалось загрузить параметры конфигурации", body: e.message });
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, [open, initialDisciplineId]);

  // Load topics when discipline selection changes
  useEffect(() => {
    if (!selectedDisciplineId) {
      setTopics([]);
      return;
    }
    async function loadTopics() {
      try {
        const r = await api.get(`/api/v2/teacher/disciplines/${selectedDisciplineId}/topics`);
        setTopics(r.data);
        if (initialTopicId && initialDisciplineId === selectedDisciplineId) {
          setSelectedTopicId(initialTopicId);
        } else {
          setSelectedTopicId("");
        }
      } catch (e: any) {
        console.error(e);
      }
    }
    loadTopics();
  }, [selectedDisciplineId, initialTopicId, initialDisciplineId]);

  // Reset form when modal closes/opens
  useEffect(() => {
    if (open) {
      setGenerating(false);
      setTaskId(null);
      setGenError(null);
      setTaskProgress(null);
      setMaterial("");
      if (initialDisciplineId) setSelectedDisciplineId(initialDisciplineId);
      if (initialTopicId) setSelectedTopicId(initialTopicId);
    }
  }, [open]);

  // Polling Task Status
  useEffect(() => {
    if (!taskId || !generating) return;
    const currentTaskId = taskId;

    let timer: any;
    async function poll() {
      try {
        const task = await getGenerationTaskStatus(currentTaskId);
        setTaskProgress(task);
        if (task.status === "done") {
          setGenerating(false);
          pushToast({
            tone: "success",
            title: "Генерация завершена",
            body: `Успешно создано ${task.generated_count} вопросов со статусом «На проверке»!`,
          });
          if (onSuccess) {
            onSuccess(currentTaskId, task.generated_count);
          }
          onClose();
        } else if (task.status === "error") {
          setGenerating(false);
          setGenError(task.error_message || "Произошла неизвестная ошибка ИИ");
          pushToast({
            tone: "error",
            title: "Ошибка генерации ИИ",
            body: task.error_message || "ИИ не смог составить вопросы",
          });
        } else {
          // Keep polling
          timer = setTimeout(poll, 2000);
        }
      } catch (e: any) {
        console.error("Task poll error", e);
        // Retry polling in 3 seconds anyway
        timer = setTimeout(poll, 3000);
      }
    }

    timer = setTimeout(poll, 2000);
    return () => clearTimeout(timer);
  }, [taskId, generating]);

  const handleTypeToggle = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId]
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setMaterial(text);
      pushToast({
        tone: "success",
        title: "Материал загружен",
        body: `Файл «${file.name}» (${text.length} симв.) успешно считан`,
      });
    };
    reader.onerror = () => {
      pushToast({ tone: "error", title: "Ошибка", body: "Не удалось прочитать файл" });
    };
    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    if (!selectedDisciplineId) {
      pushToast({ tone: "error", title: "Ошибка", body: "Выберите дисциплину" });
      return;
    }
    if (selectedTypes.length === 0) {
      pushToast({ tone: "error", title: "Ошибка", body: "Выберите хотя бы один тип вопроса" });
      return;
    }

    try {
      setGenerating(true);
      setGenError(null);
      setTaskProgress(null);
      const res = await startQuestionGeneration({
        discipline_id: Number(selectedDisciplineId),
        topic_id: selectedTopicId ? Number(selectedTopicId) : null,
        topic_name_hint: topicNameHint || null,
        question_types: selectedTypes,
        count: count,
        difficulty_min: difficultyMin,
        difficulty_max: difficultyMax,
        language: language,
        additional_context: additionalContext || null,
        material: material || null,
        model: selectedModel || null,
      });
      setTaskId(res.task_id);
    } catch (e: any) {
      console.error(e);
      setGenerating(false);
      const errorMsg = e.response?.data?.detail || e.message || "Не удалось отправить запрос к ИИ";
      setGenError(errorMsg);
      pushToast({
        tone: "error",
        title: "Ошибка генерации вопросов",
        body: errorMsg,
      });
    }
  };

  const progressPercent = taskProgress
    ? Math.min(100, Math.round(((taskProgress.generated_count || 0) / (taskProgress.total_requested || count)) * 100))
    : 0;

  const isMaterialOverLimit = material.length > 12000;

  return (
    <Modal
      open={open}
      onClose={generating ? () => {} : onClose}
      title={
        <div className="flex items-center space-x-2 text-indigo-650 dark:text-indigo-400">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span>Генерация вопросов с помощью ИИ</span>
        </div>
      }
      size="md"
    >
      {generating ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-5 px-4">
          <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-450 animate-spin" />
          <div className="text-center w-full max-w-sm space-y-3">
            <h4 className="font-semibold text-sm text-neutral-800 dark:text-neutral-250">
              ИИ генерирует вопросы...
            </h4>
            
            {/* Real-time Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400 px-1 font-medium">
                <span>Прогресс генерации: {progressPercent}%</span>
                <span>
                  {taskProgress?.generated_count || 0} / {taskProgress?.total_requested || count}
                </span>
              </div>
              <div className="w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-650 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-xs mx-auto leading-relaxed">
              Это может занять некоторое время. Прогресс обновляется по мере сохранения каждого вопроса.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {genError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-250 dark:border-red-900/50 rounded-xl flex items-start space-x-2 text-red-700 dark:text-red-400 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Ошибка генерации:</span> {genError}
              </div>
            </div>
          )}

          {/* Discipline & Model Choice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Дисциплина" required>
              <Select
                value={selectedDisciplineId}
                onChange={(e) => setSelectedDisciplineId(Number(e.target.value))}
                disabled={loadingConfig}
              >
                {loadingConfig && <option value="">Загрузка дисциплин...</option>}
                {disciplines.map((d) => (
                  <option key={d.discipline_id} value={d.discipline_id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>

            {allowedModels.length > 0 && (
              <Field label="ИИ-Модель" hint="Выберите модель генерации">
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {allowedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {/* Topic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Тема в банке вопросов">
              <Select
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Общая (без темы)</option>
                {topics.map((t) => (
                  <option key={t.topic_id} value={t.topic_id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>

            {!selectedTopicId && (
              <Field label="Уточнение темы (для ИИ)" hint="Поможет сфокусировать генерацию">
                <input
                  type="text"
                  value={topicNameHint}
                  onChange={(e) => setTopicNameHint(e.target.value)}
                  placeholder="Например: Основы нормализации БД"
                  className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-neutral-800 dark:text-neutral-105 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </Field>
            )}
          </div>

          {/* Count and Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Количество" hint={`Вопросов: ${count}`}>
              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="flex-1 accent-indigo-650 cursor-pointer h-1 bg-neutral-200 dark:bg-neutral-850 rounded-lg appearance-none"
                />
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200">
                  {count}
                </span>
              </div>
            </Field>

            <Field label="Сложность" hint={`Интервал: ${difficultyMin} – ${difficultyMax}`}>
              <div className="flex items-center space-x-2 pt-1.5">
                <Select
                  value={difficultyMin}
                  onChange={(e) => setDifficultyMin(Number(e.target.value))}
                  className="py-1 text-xs"
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v} disabled={v > difficultyMax}>
                      {v}
                    </option>
                  ))}
                </Select>
                <span className="text-neutral-400">—</span>
                <Select
                  value={difficultyMax}
                  onChange={(e) => setDifficultyMax(Number(e.target.value))}
                  className="py-1 text-xs"
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v} disabled={v < difficultyMin}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          </div>

          {/* Question types checklist */}
          <Field label="Типы вопросов для генерации" required>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {QUESTION_TYPES.map((type) => (
                <label
                  key={type.id}
                  className="flex items-center space-x-2 text-xs text-neutral-700 dark:text-neutral-350 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type.id)}
                    onChange={() => handleTypeToggle(type.id)}
                    className="accent-indigo-600 rounded"
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Context & Material Tab/Section */}
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-4">
            <Field label="Дополнительный контекст или тема генерации" hint="Например: Упор на 3NF и BCNF">
              <Textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Дополнительные пожелания к содержанию вопросов (ключевые термины, примеры, специфика теории)"
                className="text-xs"
              />
            </Field>

            {/* Material input with upload option */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Материал для вопросов (текст лекции/книги)
                </label>
                <label className="flex items-center space-x-1 px-2.5 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-850 rounded-lg cursor-pointer transition font-medium">
                  <Upload className="w-3 h-3" />
                  <span>Загрузить .txt/.md</span>
                  <input
                    type="file"
                    accept=".txt,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <Textarea
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Вставьте сюда учебный материал (до 12 000 символов). ИИ составит вопросы строго по этому тексту."
                className="text-xs font-mono"
                rows={5}
              />
              <div className="flex justify-between items-center text-[10px] text-neutral-450 dark:text-neutral-500 font-medium px-1">
                <span>
                  {isMaterialOverLimit && (
                    <span className="text-amber-500">
                      Превышает 12 000 символов! Текст будет усечен.
                    </span>
                  )}
                </span>
                <span className={isMaterialOverLimit ? "text-amber-550 font-bold" : ""}>
                  {material.length} / 12 000
                </span>
              </div>
            </div>
          </div>

          {/* Warnings info */}
          <div className="p-3 bg-amber-50 dark:bg-amber-955/20 border border-amber-250 dark:border-amber-900/50 rounded-xl flex items-start space-x-2.5 text-amber-700 dark:text-amber-400 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              Вопросы будут сохранены со статусом <span className="font-semibold">«На проверке (AI)»</span>. Студенты не увидят их в тестах, пока вы их не одобрите. Вы сможете отредактировать любой вопрос перед публикацией.
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <button
              onClick={handleGenerate}
              className="inline-flex items-center space-x-1.5 py-2 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-650 hover:from-indigo-700 hover:to-purple-750 text-white font-medium text-sm transition shadow-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Сгенерировать</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
