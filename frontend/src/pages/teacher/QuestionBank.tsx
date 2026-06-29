import { useEffect, useRef, useState, useMemo } from "react";
import type { RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  AlignLeft,
  AlertTriangle,
  BookOpen,
  CheckSquare,
  CircleDot,
  Database,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Hash,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  Pencil,
  Plus,
  Copy,
  RotateCcw,
  Search,
  Settings,
  TextCursorInput,
  ToggleLeft,
  ChevronRight,
  Trash2,
  Type,
  Upload,
  X,
  Archive,
  Sparkles,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { api, errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import { downloadBlob } from "../../api/downloads";
import { AppShell } from "../../components/AppShell";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ProtectedImage } from "../../components/ProtectedImage";
import { Badge } from "../../components/ui/Badge";
import { QUESTION_TYPE_LABELS } from "../../components/QuestionTypeBadge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { useToasts } from "../../components/ui/Toast";
import { QuestionPreview } from "../../components/teacher/QuestionPreview";
import { percentToScaleValue, scaleValueToPercent } from "../../utils/grade";
import AiGenerateModal from "../../components/ai/AiGenerateModal";
import {
  getPendingQuestions,
  approveQuestion,
  rejectQuestion,
  editPendingQuestion,
  editorGenerateOptions,
  editorRephraseQuestion,
  editorExplainQuestion,
  editorCheckComplexity,
  editorWriteCorrectAnswer,
} from "../../api/ai";
import type {
  ClozeBlankIn,
  DisciplineTopicOut,
  QuestionBankDisciplineOut,
  QuestionQualityIssueCode,
  QuestionQualityItemOut,
  QuestionQualityReportOut,
  QuestionPayload,
  QuestionType,
  QuestionWithType,
  TagOut,
  TopicTestDto,
} from "../../types/api";

interface TopicTestGroupRule {
  group_id: number;
  group_name: string;
  topic_id: number;
  available_from: string | null;
  available_until: string | null;
  updated_at: string;
}

const ALL_TYPES: QuestionType[] = ["single", "multi", "short", "numeric", "match", "text", "order", "bool", "cloze", "file_upload"];
type TopicFilter = "all" | "none" | number;
type DisciplineView = "cards" | "select";
type QualityFilter = "all" | QuestionQualityIssueCode;

const QUALITY_ISSUE_LABELS: Record<string, string> = {
  missing_correct_answer: "Нет правильного ответа",
  duplicate_text: "Дубликаты",
  short_text: "Короткие формулировки",
  invalid_options: "Некорректные варианты",
};

const QUALITY_FILTERS: Array<{ code: QualityFilter; label: string }> = [
  { code: "all", label: "Все проблемы" },
  { code: "missing_correct_answer", label: QUALITY_ISSUE_LABELS.missing_correct_answer },
  { code: "duplicate_text", label: QUALITY_ISSUE_LABELS.duplicate_text },
  { code: "short_text", label: QUALITY_ISSUE_LABELS.short_text },
  { code: "invalid_options", label: QUALITY_ISSUE_LABELS.invalid_options },
];

function blankEditor(disciplineId: number, qtype: QuestionType, topicId: number | null = null): QuestionPayload {
  if (qtype === "match") {
    return {
      discipline_id: disciplineId,
      topic_id: topicId,
      text: "",
      difficulty: 1,
      qtype,
      options: [{ option_number: 1, text: "K", is_correct: false, match_left: "K", match_right: "V" }],
      tag_ids: [],
      short_pattern: null,
      numeric_tolerance: null,
      match_pairs: [{ left: "K", right: "V" }],
      acceptable_answers: null,
      correct_bool: null,
      explanation: null,
      case_sensitive: null,
      trim_whitespace: null,
      normalize_universal: null,
      text_mode: null,
      allow_partial: null,
      cloze_blanks: null,
    };
  }
  if (qtype === "text") {
    return {
      discipline_id: disciplineId,
      topic_id: topicId,
      text: "",
      difficulty: 1,
      qtype,
      options: [],
      tag_ids: [],
      short_pattern: null,
      numeric_tolerance: null,
      match_pairs: null,
      acceptable_answers: [""],
      correct_bool: null,
      explanation: null,
      case_sensitive: false,
      trim_whitespace: true,
      normalize_universal: true,
      text_mode: "string",
      allow_partial: false,
      cloze_blanks: null,
    };
  }
  if (qtype === "order") {
    return {
      discipline_id: disciplineId,
      topic_id: topicId,
      text: "",
      difficulty: 1,
      qtype,
      options: Array.from({ length: 4 }, (_, i) => ({
        option_number: i + 1,
        text: "",
        is_correct: false,
        correct_position: i + 1,
      })),
      tag_ids: [],
      short_pattern: null,
      numeric_tolerance: null,
      match_pairs: null,
      acceptable_answers: null,
      correct_bool: null,
      explanation: null,
      case_sensitive: null,
      trim_whitespace: null,
      normalize_universal: null,
      text_mode: null,
      allow_partial: false,
      cloze_blanks: null,
    };
  }
  if (qtype === "bool") {
    return {
      discipline_id: disciplineId,
      topic_id: topicId,
      text: "",
      difficulty: 1,
      qtype,
      options: [],
      tag_ids: [],
      short_pattern: null,
      numeric_tolerance: null,
      match_pairs: null,
      acceptable_answers: null,
      correct_bool: true,
      explanation: null,
      case_sensitive: null,
      trim_whitespace: null,
      normalize_universal: null,
      text_mode: null,
      allow_partial: null,
      cloze_blanks: null,
    };
  }
  if (qtype === "cloze") {
    return {
      discipline_id: disciplineId,
      topic_id: topicId,
      text: "{{blank:1}}",
      difficulty: 1,
      qtype,
      options: [],
      tag_ids: [],
      short_pattern: null,
      numeric_tolerance: null,
      match_pairs: null,
      acceptable_answers: null,
      correct_bool: null,
      explanation: null,
      case_sensitive: null,
      trim_whitespace: null,
      normalize_universal: null,
      text_mode: null,
      allow_partial: false,
      cloze_blanks: [
        {
          index: 1,
          kind: "select",
          options: ["", ""],
          correct_index: 0,
          acceptable_answers: null,
          case_sensitive: false,
          trim_whitespace: true,
          normalize_universal: true,
        },
      ],
    };
  }
  if (qtype === "file_upload") {
    return {
      discipline_id: disciplineId,
      topic_id: topicId,
      text: "",
      difficulty: 1,
      qtype,
      options: [],
      tag_ids: [],
      short_pattern: null,
      numeric_tolerance: null,
      match_pairs: null,
      acceptable_answers: null,
      correct_bool: null,
      explanation: null,
      case_sensitive: null,
      trim_whitespace: null,
      normalize_universal: null,
      text_mode: null,
      allow_partial: null,
      cloze_blanks: null,
      file_allowed_types: [],
      file_max_size_bytes: 10485760, // 10MB default
      file_max_count: 1,
    };
  }
  return {
    discipline_id: disciplineId,
    topic_id: topicId,
    text: "",
    difficulty: 1,
    qtype,
    options: [
      { option_number: 1, text: "", is_correct: false, match_left: null, match_right: null },
      { option_number: 2, text: "", is_correct: false, match_left: null, match_right: null },
      { option_number: 3, text: "", is_correct: false, match_left: null, match_right: null },
      { option_number: 4, text: "", is_correct: false, match_left: null, match_right: null },
    ],
    tag_ids: [],
    short_pattern: qtype === "short" ? "" : null,
    numeric_tolerance: qtype === "numeric" ? 0 : null,
    match_pairs: null,
    acceptable_answers: null,
    correct_bool: null,
    explanation: null,
    case_sensitive: null,
    trim_whitespace: null,
    normalize_universal: null,
    text_mode: null,
    allow_partial: null,
    cloze_blanks: null,
  };
}

const TYPE_PILL: Record<QuestionType, LucideIcon> = {
  single: CircleDot,
  multi: CheckSquare,
  short: TextCursorInput,
  numeric: Hash,
  match: Link2,
  text: Type as unknown as LucideIcon,
  order: GripVertical,
  bool: ToggleLeft,
  cloze: AlignLeft,
  file_upload: Upload,
};

export default function QuestionBank() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useToasts((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);
  const questionImageRef = useRef<HTMLInputElement>(null);
  const topicImageRef = useRef<HTMLInputElement>(null);
  const disciplineImageRef = useRef<HTMLInputElement>(null);

  const [disciplineView, setDisciplineView] = useState<DisciplineView>(() => {
    const saved = localStorage.getItem("question_bank_discipline_view");
    return saved === "select" ? "select" : "cards";
  });
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<number | null>(
    params.get("disc") ? Number(params.get("disc")) : null,
  );
  const [selectedTopicId, setSelectedTopicId] = useState<TopicFilter>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showPendingAI, setShowPendingAI] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [editor, setEditor] = useState<QuestionPayload | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuestionWithType | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<QuestionWithType | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);

  /* ─── Множественный выбор / CTRL+click ─────────────────────────────── */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Очищаем выделение при смене дисциплины/темы/архив-режима/поиска —
  // иначе в нём остаются id от прошлой выборки, которые больше не видны.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedDisciplineId, selectedTopicId, showArchived, showPendingAI, search]);

  /* Модал подтверждения «Удалить все вопросы» в текущем срезе. */
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [topicDraft, setTopicDraft] = useState<{
    topic: DisciplineTopicOut | null;
    name: string;
    description: string;
    sort_order: number;
    file: File | null;
  } | null>(null);
  const [topicTest, setTopicTest] = useState<{ topic: DisciplineTopicOut; values: TopicTestDto } | null>(null);
  const [groupRules, setGroupRules] = useState<TopicTestGroupRule[]>([]);
  const [deletingTopic, setDeletingTopic] = useState<DisciplineTopicOut | null>(null);
  const [archivingDiscipline, setArchivingDiscipline] = useState<QuestionBankDisciplineOut | null>(null);
  const [disciplineImageTarget, setDisciplineImageTarget] = useState<number | null>(null);
  const [bulkActionConfirm, setBulkActionConfirm] = useState<{
    type: "archive" | "restore" | "topic" | "difficulty" | "tags";
    ids: number[];
    topicId?: number | null;
    difficulty?: number;
  } | null>(null);
  const [bulkTagsInput, setBulkTagsInput] = useState("");

  const [sortBy, setSortBy] = useState<"created" | "archived" | "text" | "id">("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");

  const filterType = (params.get("type") as QuestionType | "all") ?? "all";
  const filterTag = params.get("tag") ?? "";
  const filterDifficulty = params.get("difficulty") ?? "all";
  const filterAiStatus = params.get("ai_status") ?? "all";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === "" || v === "all") next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  function selectDiscipline(id: number) {
    setSelectedDisciplineId(id);
    setSelectedTopicId("all");
    setParam("disc", String(id));
  }

  function updateDisciplineView(next: DisciplineView) {
    setDisciplineView(next);
    localStorage.setItem("question_bank_discipline_view", next);
  }

  const disciplines = useQuery<QuestionBankDisciplineOut[]>({
    queryKey: ["v2", "question-bank", "disciplines"],
    queryFn: () => api.get("/api/v2/teacher/question-bank/disciplines").then((r) => r.data),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedDisciplineId && disciplines.data?.length) {
      selectDiscipline(disciplines.data[0].discipline_id);
    }
  }, [disciplines.data, selectedDisciplineId]);

  const selectedDiscipline = disciplines.data?.find((d) => d.discipline_id === selectedDisciplineId) ?? null;

  const topics = useQuery<DisciplineTopicOut[]>({
    queryKey: ["v2", "disciplines", selectedDisciplineId, "topics", showArchived ? "archived" : "active"],
    queryFn: () =>
      api.get(
        `/api/v2/teacher/disciplines/${selectedDisciplineId}/topics`,
        { params: { include_archived: showArchived } },
      ).then((r) => r.data),
    enabled: selectedDisciplineId != null,
  });

  const editorTopics = useQuery<DisciplineTopicOut[]>({
    queryKey: ["v2", "disciplines", editor?.discipline_id, "topics", "editor"],
    queryFn: () => api.get(`/api/v2/teacher/disciplines/${editor?.discipline_id}/topics`).then((r) => r.data),
    enabled: editor?.discipline_id != null,
  });

  const tags = useQuery<TagOut[]>({
    queryKey: ["v2", "tags"],
    queryFn: () => api.get("/api/v2/teacher/tags").then((r) => r.data),
  });

  const questions = useQuery<QuestionWithType[]>({
    queryKey: [
      "v2",
      "questions",
      selectedDisciplineId,
      selectedTopicId,
      filterType,
      filterTag,
      filterDifficulty,
      filterAiStatus,
      search,
      showArchived ? "archived" : showPendingAI ? "pending" : "active",
    ],
    queryFn: () => {
      if (showPendingAI) {
        return getPendingQuestions(selectedDisciplineId ?? undefined);
      }
      const query: Record<string, string | number | boolean> = {};
      if (selectedDisciplineId) query.discipline_id = selectedDisciplineId;
      if (selectedTopicId === "none") query.topic = "none";
      if (typeof selectedTopicId === "number") query.topic_id = selectedTopicId;
      if (filterType !== "all") query.qtype = filterType;
      if (filterTag) query.tag = filterTag;
      if (filterDifficulty !== "all") query.difficulty = Number(filterDifficulty);
      if (filterAiStatus !== "all") query.ai_status = filterAiStatus;
      if (search.trim()) query.q = search.trim();
      if (showArchived) query.archived = true;
      return api.get("/api/v2/teacher/questions", { params: query }).then((r) => r.data);
    },
    enabled: selectedDisciplineId != null,
  });


  const quality = useQuery<QuestionQualityReportOut>({
    queryKey: [
      "v2",
      "questions",
      "quality",
      selectedDisciplineId,
      selectedTopicId,
      showArchived ? "archived" : "active",
    ],
    queryFn: () => {
      const query: Record<string, string | number | boolean> = {};
      if (selectedDisciplineId) query.discipline_id = selectedDisciplineId;
      if (selectedTopicId === "none") query.topic = "none";
      if (typeof selectedTopicId === "number") query.topic_id = selectedTopicId;
      if (showArchived) query.archived = true;
      return api.get("/api/v2/teacher/questions/quality", { params: query }).then((r) => r.data);
    },
    enabled: selectedDisciplineId != null && !showPendingAI,
  });

  const pendingQuestionsQuery = useQuery<QuestionWithType[]>({
    queryKey: ["v2", "questions", "pending", selectedDisciplineId],
    queryFn: () => getPendingQuestions(selectedDisciplineId ?? undefined),
    enabled: selectedDisciplineId !== null,
  });
  const pendingCount = pendingQuestionsQuery.data?.length ?? 0;

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveQuestion(id),
    onSuccess: async () => {
      pushToast({ tone: "success", title: "Вопрос одобрен", body: "Вопрос добавлен в активный банк вопросов" });
      await invalidateBank();
      qc.invalidateQueries({ queryKey: ["v2", "questions", "pending", selectedDisciplineId] });
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось одобрить", body: errorMessage(e) }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectQuestion(id),
    onSuccess: async () => {
      pushToast({ tone: "success", title: "Вопрос отклонен", body: "Вопрос перемещен в архив" });
      await invalidateBank();
      qc.invalidateQueries({ queryKey: ["v2", "questions", "pending", selectedDisciplineId] });
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось отклонить", body: errorMessage(e) }),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => approveQuestion(id)));
    },
    onSuccess: async () => {
      pushToast({ tone: "success", title: "Все вопросы одобрены", body: "Выбранные вопросы добавлены в активный банк" });
      await invalidateBank();
      qc.invalidateQueries({ queryKey: ["v2", "questions", "pending", selectedDisciplineId] });
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось одобрить все вопросы", body: errorMessage(e) }),
  });

  const createQuestion = useMutation({
    mutationFn: (payload: QuestionPayload) => api.post("/api/teacher/questions", payload).then((r) => r.data),
  });
  const updateQuestion = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: QuestionPayload }) =>
      api.put(`/api/teacher/questions/${id}`, payload).then((r) => r.data),
  });
  const deleteQuestion = useMutation({
    mutationFn: (id: number) => api.delete(`/api/teacher/questions/${id}`),
  });
  /**
   * Массовое архивирование. Используется в двух сценариях:
   *   1. Действие «Удалить выбранные (N)» из плавающей панели.
   *   2. Действие «Удалить все вопросы» из тулбара — с тем же эндпоинтом,
   *      но id берётся из видимого среза (`questionRows`).
   * Возвращаемые skipped/errors проброшены в toast — пользователь видит,
   * какие id'ы отсеялись.
   */
  const bulkArchiveQuestions = useMutation({
    mutationFn: ({ ids, archived = true }: { ids: number[]; archived?: boolean }) =>
      api
        .post<{ archived: number; skipped: number; errors: { question_id: number; reason: string }[] }>(
          "/api/teacher/questions/bulk-archive",
          { question_ids: ids, archived },
        )
        .then((r) => r.data),
    onSuccess: async (data, variables) => {
      const actionWord = variables.archived ? "Удалено" : "Восстановлено";
      const skippedShort = data.skipped - data.errors.length;
      const lines: string[] = [];
      if (data.archived) lines.push(`${actionWord} ${data.archived}`);
      if (data.errors.length) {
        const preview = data.errors.slice(0, 4).map((e) => {
          const note =
            e.reason === "already archived"
              ? "уже архивный"
              : e.reason === "already active"
                ? "уже активный"
                : e.reason === "not found"
                  ? "не найден"
                  : e.reason === "not your discipline"
                    ? "не ваша дисциплина"
                    : e.reason;
          return `#${e.question_id} ${note}`;
        });
        const extra = data.errors.length > preview.length ? ` (+${data.errors.length - preview.length})` : "";
        lines.push(`Пропущено ${data.errors.length}${skippedShort ? ` (+ ${skippedShort})` : ""}: ${preview.join(", ")}${extra}`);
      }
      pushToast(
        data.errors.length
          ? { tone: "warning", title: "Выполнено частично", body: lines.join(". ") }
          : { tone: "success", title: "Готово", body: lines.join(". ") || "Ничего не изменилось" },
      );
      setSelectedIds(new Set());
      await invalidateBank();
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) }),
  });
  const bulkChangeTopic = useMutation({
    mutationFn: ({ ids, topicId }: { ids: number[]; topicId: number | null }) =>
      api
        .post<{ ok: boolean; count: number }>("/api/teacher/questions/bulk-topic", { question_ids: ids, topic_id: topicId })
        .then((r) => r.data),
    onSuccess: async (data) => {
      pushToast({ tone: "success", title: "Тема изменена", body: `Изменена тема для ${data.count} вопросов` });
      setSelectedIds(new Set());
      await invalidateBank();
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) }),
  });
  const bulkChangeDifficulty = useMutation({
    mutationFn: ({ ids, difficulty }: { ids: number[]; difficulty: number }) =>
      api
        .post<{ ok: boolean; count: number }>("/api/v2/teacher/questions/bulk-difficulty", { question_ids: ids, difficulty })
        .then((r) => r.data),
    onSuccess: async (data) => {
      pushToast({ tone: "success", title: "Сложность изменена", body: `Изменена сложность для ${data.count} вопросов` });
      setSelectedIds(new Set());
      await invalidateBank();
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) }),
  });
  const bulkAddTags = useMutation({
    mutationFn: ({ ids, tags }: { ids: number[]; tags: string[] }) =>
      api
        .post<{ ok: boolean; count: number }>("/api/v2/teacher/questions/bulk-tags", { question_ids: ids, tags })
        .then((r) => r.data),
    onSuccess: async (data) => {
      pushToast({ tone: "success", title: "Теги добавлены", body: `Добавлены теги для ${data.count} вопросов` });
      setSelectedIds(new Set());
      await invalidateBank();
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) }),
  });

  const restoreQuestion = useMutation({
    mutationFn: (id: number) => api.post(`/api/teacher/questions/${id}/restore`),
    onSuccess: async () => {
      await invalidateBank();
    },
  });
  const duplicateQuestion = useMutation({
    mutationFn: (id: number) => api.post(`/api/teacher/questions/${id}/duplicate`).then((r) => r.data),
    onSuccess: async (newQuestion) => {
      pushToast({ tone: "success", title: "Вопрос скопирован", body: `Создан дубликат #${newQuestion.question_id}` });
      await invalidateBank();
      startEdit(newQuestion);
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось скопировать", body: errorMessage(e) }),
  });
  /**
   * Быстрая смена темы у существующего вопроса без открытия модального
   * редактора. Раньше для этого открывали модал, меняли select и жали
   * «Сохранить», что требовало полного payload — для типов bool/order/cloze
   * это часто валилось на 400 → «Не удалось связаться с сервером».
   * Теперь — POST /questions/{id}/topic с одним полем `topic_id`.
   */
  const changeTopic = useMutation({
    mutationFn: (vars: { questionId: number; topicId: number | null }) =>
      adminApi.changeQuestionTopic(vars.questionId, vars.topicId).then((r) => r.data),
    onSuccess: async (data) => {
      const tid =
        data.topic_id == null
          ? "без темы"
          : topicOptions.find((t) => t.topic_id === data.topic_id)?.name ?? `#${data.topic_id}`;
      pushToast({ tone: "success", title: "Тема изменена", body: `вопрос #${data.question_id} → ${tid}` });
      await invalidateBank();
    },
    onError: (e) => pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) }),
  });
  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/api/v2/teacher/questions/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return r.data as { created: number; skipped: number; errors: { row: number; message: string }[] };
    },
    onSuccess: async (data) => {
      pushToast("success", `Импорт: создано ${data.created}, ошибок ${data.errors.length}`);
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const saveTopic = useMutation({
    mutationFn: async () => {
      if (!topicDraft || !selectedDisciplineId) return null;
      const payload = {
        name: topicDraft.name.trim(),
        description: topicDraft.description.trim() || null,
        sort_order: topicDraft.sort_order,
      };
      const topic = topicDraft.topic
        ? await api.patch<DisciplineTopicOut>(`/api/v2/teacher/topics/${topicDraft.topic.topic_id}`, payload).then((r) => r.data)
        : await api.post<DisciplineTopicOut>(`/api/v2/teacher/disciplines/${selectedDisciplineId}/topics`, payload).then((r) => r.data);
      if (topicDraft.file) {
        const fd = new FormData();
        fd.append("file", topicDraft.file);
        await api.post(`/api/v2/teacher/topics/${topic.topic_id}/image`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      return topic;
    },
    onSuccess: async (topic) => {
      if (topic) {
        pushToast("success", "Тема сохранена");
        setTopicDraft(null);
        setSelectedTopicId(topic.topic_id);
        await invalidateBank();
      }
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const deleteTopic = useMutation({
    mutationFn: (topicId: number) => api.delete(`/api/v2/teacher/topics/${topicId}`),
    onSuccess: async () => {
      setDeletingTopic(null);
      setSelectedTopicId("all");
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const restoreTopic = useMutation({
    mutationFn: (topicId: number) =>
      api.post<DisciplineTopicOut>(`/api/v2/teacher/topics/${topicId}/restore`).then((r) => r.data),
    onSuccess: async () => {
      pushToast("success", "Тема восстановлена");
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const restoreDiscipline = useMutation({
    mutationFn: (disciplineId: number) => api.post(`/api/v2/teacher/reference/disciplines/${disciplineId}/restore`),
    onSuccess: async () => {
      pushToast("success", "Дисциплина восстановлена");
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const saveTopicTest = useMutation({
    mutationFn: async ({ topicId, payload, rules }: { topicId: number; payload: TopicTestDto; rules: TopicTestGroupRule[] }) => {
      const [resTest] = await Promise.all([
        api.put(`/api/v2/teacher/topics/${topicId}/test`, payload).then((r) => r.data),
        api.put(`/api/v2/teacher/topics/${topicId}/test/group-rules`, rules.map(r => ({
          group_id: r.group_id,
          available_from: r.available_from,
          available_until: r.available_until
        }))).then((r) => r.data)
      ]);
      return resTest;
    },
    onSuccess: async () => {
      pushToast("success", "Настройки теста сохранены");
      setTopicTest(null);
      setGroupRules([]);
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const uploadDisciplineImage = useMutation({
    mutationFn: async ({ disciplineId, file }: { disciplineId: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/api/v2/teacher/disciplines/${disciplineId}/image`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: async () => {
      pushToast("success", "Изображение дисциплины обновлено");
      setDisciplineImageTarget(null);
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const deleteDisciplineImage = useMutation({
    mutationFn: (disciplineId: number) => api.delete(`/api/v2/teacher/disciplines/${disciplineId}/image`),
    onSuccess: async () => {
      pushToast("success", "Изображение дисциплины удалено");
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const deleteTopicImage = useMutation({
    mutationFn: (topicId: number) => api.delete(`/api/v2/teacher/topics/${topicId}/image`),
    onSuccess: async () => {
      pushToast("success", "Изображение темы удалено");
      if (topicDraft?.topic) {
        setTopicDraft({ ...topicDraft, topic: { ...topicDraft.topic, image: null } });
      }
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const archiveDiscipline = useMutation({
    mutationFn: (disciplineId: number) => api.delete(`/api/v2/teacher/reference/disciplines/${disciplineId}`),
    onSuccess: async () => {
      pushToast("success", "Дисциплина архивирована");
      setArchivingDiscipline(null);
      setSelectedDisciplineId(null);
      setSelectedTopicId("all");
      setParam("disc", null);
      await invalidateBank();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  async function invalidateBank() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["v2", "question-bank"] }),
      qc.invalidateQueries({ queryKey: ["v2", "disciplines"] }),
      qc.invalidateQueries({ queryKey: ["v2", "questions"] }),
    ]);
  }

  function startNew(qtype: QuestionType = "single") {
    const disciplineId = selectedDisciplineId ?? disciplines.data?.[0]?.discipline_id ?? 1;
    const topicId = typeof selectedTopicId === "number" ? selectedTopicId : null;
    resetImageDraft();
    setEditingQuestion(null);
    setEditor(blankEditor(disciplineId, qtype, topicId));
  }

  function startEdit(question: QuestionWithType) {
    resetImageDraft();
    setRemoveExistingImage(false);
    setEditingQuestion(question);
    setEditor({
      discipline_id: question.discipline_id,
      topic_id: question.topic_id,
      text: question.text,
      difficulty: question.difficulty,
      qtype: question.qtype,
      options: question.options.map((o) => ({
        option_number: o.option_number,
        text: o.text,
        is_correct: o.is_correct,
        match_left: o.match_left ?? null,
        match_right: o.match_right ?? null,
        correct_position: (o as QuestionWithType["options"][number]).correct_position ?? null,
      })),
      tag_ids: [],
      short_pattern: question.short_pattern,
      numeric_tolerance: question.numeric_tolerance,
      match_pairs: question.match_pairs?.length ? question.match_pairs : null,
      acceptable_answers: question.acceptable_answers ?? [],
      correct_bool: question.correct_bool ?? null,
      explanation: question.explanation ?? null,
      case_sensitive: question.case_sensitive ?? false,
      trim_whitespace: question.trim_whitespace ?? true,
      normalize_universal: question.normalize_universal ?? true,
      text_mode: (question.text_mode as "string" | "number" | null) ?? "string",
      allow_partial: question.allow_partial ?? false,
      cloze_blanks: question.cloze_blanks ?? [],
      file_allowed_types: question.file_allowed_types ?? [],
      file_max_size_bytes: question.file_max_size_bytes ?? 10485760,
      file_max_count: question.file_max_count ?? 1,
    });
  }

  function openTopicDraft(topic: DisciplineTopicOut | null = null) {
    setTopicDraft({
      topic,
      name: topic?.name ?? "",
      description: topic?.description ?? "",
      sort_order: topic?.sort_order ?? 100,
      file: null,
    });
  }

  async function openTopicTest(topic: DisciplineTopicOut) {
    try {
      const values = await api.get<TopicTestDto>(`/api/v2/teacher/topics/${topic.topic_id}/test`).then((r) => r.data);
      const rules = await api.get<TopicTestGroupRule[]>(`/api/v2/teacher/topics/${topic.topic_id}/test/group-rules`).then((r) => r.data);
      setGroupRules(rules);
      setTopicTest({ topic, values });
    } catch (e) {
      pushToast("error", errorMessage(e));
    }
  }

  function resetImageDraft() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageError(null);
    setRemoveExistingImage(false);
    if (questionImageRef.current) questionImageRef.current.value = "";
  }

  function closeEditor() {
    resetImageDraft();
    setEditor(null);
    setEditingQuestion(null);
  }

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  function pickQuestionImage(file: File | undefined) {
    setImageError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Поддерживаются PNG, JPEG и WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Файл больше 5 MB");
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setRemoveExistingImage(false);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  async function saveEditor() {
    if (!editor || savingQuestion) return;
    setSavingQuestion(true);
    try {
      const saved = editingQuestion
        ? editingQuestion.ai_status === "pending_review"
          ? await editPendingQuestion(editingQuestion.question_id, editor)
          : await updateQuestion.mutateAsync({ id: editingQuestion.question_id, payload: editor })
        : await createQuestion.mutateAsync(editor);
      const questionId = editingQuestion?.question_id ?? saved.question_id;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        await api.post(`/api/v2/teacher/questions/${questionId}/image`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else if (editingQuestion?.image && removeExistingImage) {
        await api.delete(`/api/v2/teacher/questions/${questionId}/image`);
      }
      pushToast("success", editingQuestion ? "Вопрос обновлен" : "Вопрос сохранен");
      closeEditor();
      await invalidateBank();
      if (editingQuestion?.ai_status === "pending_review") {
        qc.invalidateQueries({ queryKey: ["v2", "questions", "pending", selectedDisciplineId] });
      }
    } catch (e) {
      pushToast("error", errorMessage(e));
    } finally {
      setSavingQuestion(false);
    }
  }

  async function confirmDeleteQuestion() {
    if (!deletingQuestion) return;
    const target = deletingQuestion;
    setDeletingQuestion(null);
    try {
      await deleteQuestion.mutateAsync(target.question_id);
      await invalidateBank();
      pushToast("success", `Вопрос «${target.text.slice(0, 60)}${target.text.length > 60 ? "…" : ""}» архивирован`, 5000, {
        label: "Отменить",
        title: "Восстановить вопрос",
        onClick: async () => {
          await restoreQuestion.mutateAsync(target.question_id);
        },
      });
    } catch (e) {
      pushToast("error", errorMessage(e));
    }
  }

  function updateOption(i: number, patch: Partial<QuestionPayload["options"][number]>) {
    if (!editor) return;
    setEditor({
      ...editor,
      options: editor.options.map((o, ix) => (ix === i ? { ...o, ...patch } : o)),
    });
  }

  async function onExport(format: "csv" | "xlsx") {
    try {
      const ext = format === "xlsx" ? "xlsx" : "csv";
      await downloadBlob(`/api/v2/teacher/questions/export?format=${format}`, `questions.${ext}`);
    } catch (e) {
      pushToast("error", errorMessage(e));
    }
  }

  const topicOptions = topics.data ?? [];
  const sortedQuestions = useMemo(() => {
    let list = [...(questions.data ?? [])];
    if (showPendingAI) {
      if (selectedTopicId === "none") {
        list = list.filter((q) => q.topic_id === null);
      } else if (typeof selectedTopicId === "number") {
        list = list.filter((q) => q.topic_id === selectedTopicId);
      }
      if (filterType !== "all") {
        list = list.filter((q) => q.qtype === filterType);
      }
      if (filterTag) {
        list = list.filter((q) => q.tags?.includes(filterTag));
      }
      if (filterDifficulty !== "all") {
        list = list.filter((q) => q.difficulty === Number(filterDifficulty));
      }
      if (search.trim()) {
        const s = search.toLowerCase();
        list = list.filter((q) => q.text?.toLowerCase().includes(s));
      }
    }
    list.sort((a, b) => {
      let valA: any = a.question_id;
      let valB: any = b.question_id;
      if (sortBy === "created") {
        valA = a.created_at ? new Date(a.created_at).getTime() : 0;
        valB = b.created_at ? new Date(b.created_at).getTime() : 0;
      } else if (sortBy === "archived") {
        valA = a.archived_at ? new Date(a.archived_at).getTime() : 0;
        valB = b.archived_at ? new Date(b.archived_at).getTime() : 0;
      } else if (sortBy === "text") {
        valA = a.text || "";
        valB = b.text || "";
      }
      
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [questions.data, sortBy, sortOrder, showPendingAI, selectedTopicId, filterType, filterTag, filterDifficulty, filterAiStatus, search]);

  const questionRows = sortedQuestions;
  const visibleQualityItems = useMemo(() => {
    const items = quality.data?.questions ?? [];
    if (qualityFilter === "all") return items;
    return items.filter((item) => item.issues.some((issue) => issue.code === qualityFilter));
  }, [quality.data, qualityFilter]);
  const questionById = useMemo(() => {
    return new Map((questions.data ?? []).map((question) => [question.question_id, question]));
  }, [questions.data]);

  function editQualityQuestion(item: QuestionQualityItemOut) {
    const loaded = questionById.get(item.question_id);
    if (loaded) {
      startEdit(loaded);
      return;
    }
    pushToast({
      tone: "warning",
      title: "Вопрос не в текущем списке",
      body: "Сбросьте поиск или фильтры, чтобы открыть его из таблицы.",
    });
  }

  return (
    <AppShell
      rightSlot={
        <Link to="/teacher" className="hidden md:inline-flex btn btn-ghost btn-sm">
          На главную
        </Link>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Банк вопросов</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Дисциплины, темы, вопросы и тесты по темам.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              ref={fileRef}
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv.mutate(f);
              }}
            />
            <input
              type="file"
              ref={disciplineImageRef}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && disciplineImageTarget) {
                   uploadDisciplineImage.mutate({ disciplineId: disciplineImageTarget, file });
                }
                e.currentTarget.value = "";
              }}
            />
            <Button variant="secondary" size="sm" iconLeft={<Upload className="w-4 h-4" />} onClick={() => fileRef.current?.click()} loading={importCsv.isPending}>
              Импорт (CSV/XLSX)
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<Download className="w-4 h-4" />} onClick={() => onExport("csv")}>
              Экспорт CSV
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<Download className="w-4 h-4" />} onClick={() => onExport("xlsx")}>
              Экспорт XLSX
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Sparkles className="w-4 h-4 text-indigo-500" />}
              onClick={() => setAiModalOpen(true)}
              disabled={!selectedDisciplineId}
            >
              {typeof selectedTopicId === "number" ? "✨ ИИ-вопросы" : "✨ Сгенерировать"}
            </Button>
            <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => startNew("single")} disabled={!selectedDisciplineId}>
              Новый вопрос
            </Button>
          </div>
        </header>

        <Card className="mb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[var(--color-text-primary)]">Дисциплины</div>
              <div className="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden">
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm rounded-none ${disciplineView === "cards" ? "bg-[var(--color-bg-muted)]" : ""}`}
                  onClick={() => updateDisciplineView("cards")}
                  title="Карточки"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm rounded-none ${disciplineView === "select" ? "bg-[var(--color-bg-muted)]" : ""}`}
                  onClick={() => updateDisciplineView("select")}
                  title="Список"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {disciplines.isLoading && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
            )}

            {disciplines.data && disciplineView === "select" && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="input sm:max-w-md"
                  value={selectedDisciplineId ?? ""}
                  onChange={(e) => selectDiscipline(Number(e.target.value))}
                  aria-label="Дисциплина"
                >
                  {disciplines.data.map((d) => (
                    <option key={d.discipline_id} value={d.discipline_id}>{d.name}</option>
                  ))}
                </select>
                {selectedDiscipline && (
                  <select
                    className="input sm:max-w-md"
                    value={selectedTopicId === "all" ? "all" : selectedTopicId === "none" ? "none" : String(selectedTopicId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "all") setSelectedTopicId("all");
                      else if (v === "none") setSelectedTopicId("none");
                      else setSelectedTopicId(Number(v));
                    }}
                    aria-label="Тема"
                  >
                    <option value="all">Все темы ({selectedDiscipline.questions_count})</option>
                    {!showArchived && (
                      <option value="none">
                        Без темы ({selectedDiscipline.untopiced_questions_count})
                      </option>
                    )}
                    {topicOptions.map((topic) => (
                      <option key={topic.topic_id} value={String(topic.topic_id)}>
                        {topic.name} ({topic.questions_count})
                      </option>
                    ))}
                  </select>
                )}
                {selectedDiscipline && (
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{selectedDiscipline.topics_count} тем</Badge>
                    <Badge tone="neutral">{selectedDiscipline.questions_count} вопросов</Badge>
                    <Badge tone="neutral">{selectedDiscipline.untopiced_questions_count} без темы</Badge>
                  </div>
                )}
              </div>
            )}

            {disciplines.data && disciplineView === "cards" && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {disciplines.data.map((d) => {
                  const selected = d.discipline_id === selectedDisciplineId;
                  return (
                    <div
                      key={d.discipline_id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Открыть дисциплину ${d.name}`}
                      onClick={() => selectDiscipline(d.discipline_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectDiscipline(d.discipline_id);
                        }
                      }}
                      className={`rounded-md border p-3 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${selected ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"}`}
                    >
                      <div className="flex gap-3">
                        <div className="w-16 h-16 rounded-md bg-[var(--color-bg-muted)] shrink-0 overflow-hidden grid place-items-center">
                          {d.image ? (
                            <ProtectedImage src={d.image.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <BookOpen className="w-6 h-6 text-[var(--color-text-muted)]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-left text-[var(--color-text-primary)] line-clamp-2">
                            {d.name}
                          </div>
                          {d.description && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">{d.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                        <Metric label="тем" value={d.topics_count} />
                        <Metric label="вопр." value={d.questions_count} />
                        <Metric label="без темы" value={d.untopiced_questions_count} />
                        <Metric label="тестов" value={d.enabled_topic_tests_count} />
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" iconRight={<ChevronRight className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); selectDiscipline(d.discipline_id); }}>
                          Открыть
                        </Button>
                        <Link
                          className="btn btn-ghost btn-sm"
                          to="/teacher/reference/disciplines"
                          title="Редактировать дисциплину"
                          aria-label={`Редактировать дисциплину ${d.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm h-8 w-8 p-0"
                          title={d.image ? "Заменить изображение" : "Загрузить изображение"}
                          onClick={() => {
                            setDisciplineImageTarget(d.discipline_id);
                            disciplineImageRef.current?.click();
                          }}
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                        </button>
                        {d.image && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm h-8 w-8 p-0 text-[var(--color-danger)]"
                            title="Удалить изображение"
                            onClick={() => deleteDisciplineImage.mutate(d.discipline_id)}
                            disabled={deleteDisciplineImage.isPending}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm h-8 w-8 p-0 text-[var(--color-danger)]"
                          title="Архивировать дисциплину"
                          onClick={() => setArchivingDiscipline(d)}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {selectedDiscipline && (
          <Card className="mb-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">{selectedDiscipline.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {showArchived ? "Архив тем и вопросов" : "Темы выбранной дисциплины"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="input w-auto"
                    value={
                      selectedTopicId === "all"
                        ? "all"
                        : selectedTopicId === "none"
                          ? "none"
                          : String(selectedTopicId)
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "all") setSelectedTopicId("all");
                      else if (v === "none") setSelectedTopicId("none");
                      else setSelectedTopicId(Number(v));
                    }}
                    aria-label="Фильтр по теме"
                  >
                    <option value="all">Все темы ({selectedDiscipline.questions_count})</option>
                    {!showArchived && (
                      <option value="none">
                        Без темы ({selectedDiscipline.untopiced_questions_count})
                      </option>
                    )}
                    {topicOptions.map((topic) => (
                      <option key={topic.topic_id} value={String(topic.topic_id)}>
                        {topic.name} ({topic.questions_count})
                      </option>
                    ))}
                  </select>
                  <div className="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden">
                    <button
                      type="button"
                      className={`btn btn-ghost btn-sm rounded-none ${showArchived || showPendingAI ? "" : "bg-[var(--color-bg-muted)]"}`}
                      onClick={() => { setShowArchived(false); setShowPendingAI(false); setSelectedTopicId("all"); }}
                      title="Активные темы и вопросы"
                    >
                      Активные
                    </button>
                    <button
                      type="button"
                      className={`btn btn-ghost btn-sm rounded-none ${showPendingAI ? "bg-[var(--color-bg-muted)]" : ""}`}
                      onClick={() => { setShowPendingAI(true); setShowArchived(false); setSelectedTopicId("all"); }}
                      title="На проверке (AI)"
                    >
                      На проверке (AI) {pendingCount > 0 && <span className="ml-1.5 px-1.5 py-0.2 bg-indigo-500 text-white rounded-full text-xs font-semibold">{pendingCount}</span>}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-ghost btn-sm rounded-none ${showArchived ? "bg-[var(--color-bg-muted)]" : ""}`}
                      onClick={() => { setShowArchived(true); setShowPendingAI(false); setSelectedTopicId("all"); }}
                      title="Архив тем и вопросов"
                    >
                      Архив
                    </button>
                  </div>
                  {!showArchived && !showPendingAI && (
                    <Button size="sm" iconLeft={<Plus className="w-4 h-4" />} onClick={() => openTopicDraft()}>
                      Новая тема
                    </Button>
                  )}
                  {!showArchived && !showPendingAI && questionRows.length > 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      iconLeft={<Trash2 className="w-4 h-4" />}
                      onClick={() => setConfirmingDeleteAll(true)}
                      title={`Удалить все ${questionRows.length} видимых вопросов в этой дисциплине/теме`}
                    >
                      Удалить все вопросы
                    </Button>
                  )}
                  {showPendingAI && questionRows.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        iconLeft={<Trash2 className="w-4 h-4" />}
                        onClick={() => bulkArchiveQuestions.mutate({ ids: questionRows.map(q => q.question_id), archived: true })}
                        loading={bulkArchiveQuestions.isPending}
                        title="Отклонить все вопросы в списке"
                      >
                        Отклонить все
                      </Button>
                      <Button
                        size="sm"
                        iconLeft={<CheckSquare className="w-4 h-4" />}
                        onClick={() => bulkApproveMutation.mutate(questionRows.map(q => q.question_id))}
                        loading={bulkApproveMutation.isPending}
                        title="Одобрить все вопросы в списке"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:border-emerald-700"
                      >
                        Одобрить все
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <TopicChip
                  active={selectedTopicId === "all"}
                  title={showArchived ? "Все в архиве" : showPendingAI ? "Все на проверке" : "Все вопросы"}
                  count={
                    showArchived
                      ? (topics.data?.length ?? 0)
                      : showPendingAI
                        ? pendingCount
                        : selectedDiscipline.questions_count
                  }
                  onClick={() => setSelectedTopicId("all")}
                />
                {!showArchived && !showPendingAI && (
                  <TopicChip active={selectedTopicId === "none"} title="Без темы" count={selectedDiscipline.untopiced_questions_count} onClick={() => setSelectedTopicId("none")} />
                )}
                {!showPendingAI && topicOptions.map((topic) => (
                  <TopicChip
                    key={topic.topic_id}
                    topic={topic}
                    title={topic.name}
                    count={topic.questions_count}
                    imageUrl={topic.image?.url}
                    testEnabled={topic.test?.is_enabled}
                    active={selectedTopicId === topic.topic_id}
                    archived={showArchived}
                    onClick={() => setSelectedTopicId(topic.topic_id)}
                    onEdit={() => openTopicDraft(topic)}
                    onSettings={() => openTopicTest(topic)}
                    onDelete={() => setDeletingTopic(topic)}
                    onRestore={() => restoreTopic.mutate(topic.topic_id)}
                  />
                ))}
              </div>
            </div>
          </Card>
        )}

        {selectedDiscipline && !showPendingAI && (
          <QuestionQualityPanel
            report={quality.data}
            loading={quality.isLoading}
            error={quality.isError ? errorMessage(quality.error) : null}
            filter={qualityFilter}
            onFilterChange={setQualityFilter}
            items={visibleQualityItems}
            onEditQuestion={editQualityQuestion}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4 bg-[var(--color-bg-elevated)] p-3 rounded-lg border border-[var(--color-border)] shadow-sm">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
            <input className="input pl-9 text-xs sm:text-sm" placeholder="Поиск по тексту..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select
            className="input w-auto text-xs sm:text-sm"
            value={selectedDisciplineId || ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) selectDiscipline(Number(val));
            }}
            aria-label="Фильтр по дисциплине"
          >
            {disciplines.data?.map((d) => (
              <option key={d.discipline_id} value={d.discipline_id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className="input w-auto text-xs sm:text-sm"
            value={
              selectedTopicId === "all"
                ? "all"
                : selectedTopicId === "none"
                  ? "none"
                  : String(selectedTopicId)
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") setSelectedTopicId("all");
              else if (v === "none") setSelectedTopicId("none");
              else setSelectedTopicId(Number(v));
            }}
            aria-label="Фильтр по теме"
          >
            <option value="all">Все темы</option>
            <option value="none">Без темы</option>
            {topicOptions.map((topic) => (
              <option key={topic.topic_id} value={String(topic.topic_id)}>
                {topic.name}
              </option>
            ))}
          </select>
          <select
            className="input w-auto text-xs sm:text-sm"
            value={showArchived ? "archived" : showPendingAI ? "pending" : "active"}
            onChange={(e) => {
              const val = e.target.value;
              setShowArchived(val === "archived");
              setShowPendingAI(val === "pending");
              setSelectedTopicId("all");
            }}
            aria-label="Фильтр по статусу"
          >
            <option value="active">Активные</option>
            <option value="pending">На проверке (AI)</option>
            <option value="archived">Архивные</option>
          </select>
          <select className="input w-auto text-xs sm:text-sm" value={filterType} onChange={(e) => setParam("type", e.target.value)}>
            <option value="all">Все типы</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{QUESTION_TYPE_LABELS[t].full}</option>
            ))}
          </select>
          <select className="input w-auto text-xs sm:text-sm" value={filterTag || "all"} onChange={(e) => setParam("tag", e.target.value === "all" ? null : e.target.value)}>
            <option value="all">Все теги</option>
            {tags.data?.map((t) => <option key={t.tag_id} value={t.name}>{t.name}</option>)}
          </select>
          <select
            className="input w-auto text-xs sm:text-sm"
            value={filterDifficulty}
            onChange={(e) => setParam("difficulty", e.target.value)}
            aria-label="Фильтр по сложности"
          >
            <option value="all">Все сложности</option>
            <option value="1">Сложность 1</option>
            <option value="2">Сложность 2</option>
            <option value="3">Сложность 3</option>
            <option value="4">Сложность 4</option>
            <option value="5">Сложность 5</option>
          </select>
          <select
            className="input w-auto text-xs sm:text-sm"
            value={filterAiStatus}
            onChange={(e) => setParam("ai_status", e.target.value)}
            aria-label="Фильтр по статусу ИИ"
          >
            <option value="all">Все (ИИ и вручную)</option>
            <option value="manual">Только вручную</option>
            <option value="approved">Одобренные ИИ</option>
            <option value="pending_review">На проверке ИИ</option>
          </select>
          <div className="h-5 w-[1px] bg-[var(--color-border)] hidden md:block" />
          <select
            className="input w-auto text-xs sm:text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Сортировка"
          >
            <option value="id">По ID</option>
            <option value="text">По тексту</option>
            <option value="created">По дате создания</option>
            <option value="archived">По дате архивации</option>
          </select>
          <select
            className="input w-auto text-xs sm:text-sm"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            aria-label="Направление сортировки"
          >
            <option value="asc">↑ Возр.</option>
            <option value="desc">↓ Убыв.</option>
          </select>
        </div>

        {questions.isLoading && (
          <Card className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </Card>
        )}

        {questions.isError && (
          <EmptyState icon={<Database />} title="Не удалось загрузить банк" description={errorMessage(questions.error)} />
        )}

        {questions.data && questionRows.length === 0 && (
          <EmptyState
            icon={<Database />}
            title={showArchived ? "Архив пуст" : "Нет вопросов по фильтру"}
            description={showArchived ? "Архивных вопросов в этой дисциплине / теме нет." : "Измените фильтр или создайте первый вопрос в выбранной теме."}
            action={!showArchived ? <Button onClick={() => startNew("single")} iconLeft={<Plus className="w-4 h-4" />}>Новый вопрос</Button> : undefined}
          />
        )}

        {questionRows.length > 0 && selectedIds.size > 0 && (
          <div
            role="region"
            aria-label="Действия с выбранными вопросами"
            className="sticky top-14 z-20 mb-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 backdrop-blur shadow-sm"
          >
            <span className="text-sm">
              Выбрано: <b>{selectedIds.size}</b>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Снять выбор
            </button>
            <span className="flex-1" />
            {!showArchived && (
              <select
                className="input input-sm w-auto text-xs py-1 px-2 h-8"
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") return;
                  const topicId = val === "none" ? null : Number(val);
                  setBulkActionConfirm({
                    type: "topic",
                    ids: Array.from(selectedIds),
                    topicId,
                  });
                }}
              >
                <option value="">Перенести в тему...</option>
                <option value="none">Без темы</option>
                {topicOptions.map((t) => (
                  <option key={t.topic_id} value={t.topic_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {!showArchived && (
              <select
                className="input input-sm w-auto text-xs py-1 px-2 h-8"
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") return;
                  const difficulty = Number(val);
                  setBulkActionConfirm({
                    type: "difficulty",
                    ids: Array.from(selectedIds),
                    difficulty,
                  });
                }}
              >
                <option value="">Сложность...</option>
                <option value="1">Сложность 1</option>
                <option value="2">Сложность 2</option>
                <option value="3">Сложность 3</option>
                <option value="4">Сложность 4</option>
                <option value="5">Сложность 5</option>
              </select>
            )}
            {!showArchived && (
              <button
                type="button"
                className="btn btn-secondary btn-sm h-8 text-xs py-1 px-3"
                onClick={() => {
                  setBulkTagsInput("");
                  setBulkActionConfirm({
                    type: "tags",
                    ids: Array.from(selectedIds),
                  });
                }}
              >
                Добавить теги...
              </button>
            )}

            {showArchived ? (
              <button
                type="button"
                className="btn btn-primary btn-sm h-8"
                disabled={bulkArchiveQuestions.isPending}
                onClick={() =>
                  setBulkActionConfirm({
                    type: "restore",
                    ids: Array.from(selectedIds),
                  })
                }
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Восстановить выбранные ({selectedIds.size})
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-sm h-8"
                disabled={bulkArchiveQuestions.isPending}
                onClick={() =>
                  setBulkActionConfirm({
                    type: "archive",
                    ids: Array.from(selectedIds),
                  })
                }
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Удалить выбранные ({selectedIds.size})
              </button>
            )}
          </div>
        )}

        {questionRows.length > 0 && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]">
                <tr>
                  {true && (
                    <th className="py-2.5 px-2 w-9">
                      <input
                        type="checkbox"
                        aria-label="Выбрать все"
                        checked={
                          questionRows.length > 0 &&
                          questionRows.every((q) => selectedIds.has(q.question_id))
                        }
                        ref={(el) => {
                          if (!el) return;
                          const all = questionRows.every((q) => selectedIds.has(q.question_id));
                          const some = questionRows.some((q) => selectedIds.has(q.question_id));
                          el.indeterminate = !all && some;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(
                              new Set(questionRows.map((q) => q.question_id)),
                            );
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="py-2.5 px-4 font-medium">Тип</th>
                  <th className="py-2.5 px-4 font-medium">Тема</th>
                  <th className="py-2.5 px-4 font-medium">Текст</th>
                  <th className="py-2.5 px-4 font-medium">Изобр.</th>
                  <th className="py-2.5 px-4 font-medium">Сл.</th>
                  <th className="py-2.5 px-4 font-medium">Теги</th>
                  <th className="py-2.5 px-4 font-medium">Правильный</th>
                  <th className="py-2.5 px-4 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {questionRows.map((q) => {
                  const Icon = TYPE_PILL[q.qtype];
                  const correct = q.options.find((o) => o.is_correct);
                  const selected = selectedIds.has(q.question_id);
                  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
                    // Все клики по кнопкам внутри строки должны игнорироваться —
                    // мы не хотим включать selection, когда пользователь жмёт
                    // «Изменить» или «Удалить». Кнопки останавливают всплытие.
                    if ((e.target as HTMLElement).closest("button, a, input")) return;
                    // Модификаторы: CTRL/Meta → toggle, Shift → range to last,
                    // простой клик → ничего (чтобы не было случайных выделений
                    // от обычных кликов по строке).
                    if (!e.ctrlKey && !e.metaKey) return;
                    e.preventDefault();
                    setSelectedIds((cur) => {
                      const next = new Set(cur);
                      if (next.has(q.question_id)) next.delete(q.question_id);
                      else next.add(q.question_id);
                      return next;
                    });
                  };
                  return (
                    <tr
                      key={q.question_id}
                      onClick={handleRowClick}
                      className={
                        selected
                          ? "border-t border-[var(--color-border)] bg-[var(--color-accent)]/10"
                          : "border-t border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] transition"
                      }
                      data-testid={`question-row-${q.question_id}`}
                    >
                      {true && (
                        <td className="py-2.5 px-2 w-9" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Выбрать вопрос ${q.question_id}`}
                            checked={selected}
                            onChange={(e) =>
                              setSelectedIds((cur) => {
                                const next = new Set(cur);
                                if (e.target.checked) next.add(q.question_id);
                                else next.delete(q.question_id);
                                return next;
                              })
                            }
                          />
                        </td>
                      )}
                      <td className="py-2.5 px-4"><Icon className="w-4 h-4 text-[var(--color-text-secondary)]" strokeWidth={1.75} /></td>
                      <td className="py-2.5 px-4 text-[var(--color-text-secondary)]" onClick={(e) => e.stopPropagation()}>
                        {!showArchived && !showPendingAI ? (
                          <select
                            className="input text-xs py-1 px-2 min-w-[10rem]"
                            value={q.topic_id ?? ""}
                            aria-label={`Тема вопроса ${q.question_id}`}
                            onChange={(e) => {
                              const v = e.target.value;
                              changeTopic.mutate({
                                questionId: q.question_id,
                                topicId: v === "" ? null : Number(v),
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={changeTopic.isPending}
                          >
                            <option value="">Без темы</option>
                            {topicOptions
                              .filter((t) => !t.archived)
                              .map((t) => (
                                <option key={t.topic_id} value={t.topic_id}>
                                  {t.name}
                                </option>
                              ))}
                          </select>
                        ) : (
                          q.topic_name ?? "Без темы"
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--color-text-primary)]">
                        <div>{q.text}</div>
                        {q.ai_model_used && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-medium">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-455 border border-indigo-100/50 dark:border-indigo-900/30">
                              <Sparkles className="w-3 h-3" />
                              🤖 {q.ai_model_used.replace(/^(openai\/|anthropic\/)/, "")}
                            </span>
                            {q.explanation && (
                              <span className="text-neutral-400" title={q.explanation}>
                                💡 Объяснение прилагается
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4">{q.image ? <ImageIcon className="w-4 h-4 text-[var(--color-accent)]" /> : <span className="text-[var(--color-text-muted)]">-</span>}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[var(--color-text-secondary)]">{q.difficulty}</td>
                      <td className="py-2.5 px-4"><div className="flex flex-wrap gap-1">{q.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</div></td>
                      <td className="py-2.5 px-4">
                        {q.qtype === "match" ? <Badge tone="info">{q.match_pairs.length} пар</Badge> : correct ? <Badge tone="success">№{correct.option_number}</Badge> : <Badge tone="danger">нет</Badge>}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex justify-end gap-1">
                          {showPendingAI ? (
                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm h-8 w-8 p-0"
                                title="Редактировать"
                                aria-label={`Изменить вопрос ${q.question_id}`}
                                onClick={() => startEdit(q)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm h-8 px-2 text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20"
                                title="Отклонить"
                                onClick={() => rejectMutation.mutate(q.question_id)}
                                disabled={rejectMutation.isPending}
                              >
                                Отклонить
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm h-8 px-2 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 hover:border-emerald-700"
                                title="Одобрить"
                                onClick={() => approveMutation.mutate(q.question_id)}
                                disabled={approveMutation.isPending}
                              >
                                Одобрить
                              </button>
                            </div>
                          ) : (
                            <>
                              {!showArchived && (
                                <button type="button" className="btn btn-ghost btn-sm h-8 w-8 p-0" aria-label={`Изменить вопрос ${q.question_id}`} onClick={(e) => { e.stopPropagation(); startEdit(q); }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!showArchived && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm h-8 w-8 p-0 text-indigo-500 hover:text-indigo-750"
                                  aria-label={`Обсудить вопрос ${q.question_id} с ИИ`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/ai", {
                                      state: {
                                        prefill: `Помоги доработать этот вопрос:\n\nТекст вопроса:\n${q.text}\n\nСложность: ${q.difficulty}\nТип: ${q.qtype}\n\nВарианты ответов:\n${q.options.map(opt => `${opt.option_number}. ${opt.text} ${opt.is_correct ? "(Правильный)" : ""}`).join("\n")}`,
                                        autoCreate: true,
                                      },
                                    });
                                  }}
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                </button>
                              )}
                              {!showArchived && (
                                <button type="button" className="btn btn-ghost btn-sm h-8 w-8 p-0 text-[var(--color-accent)]" aria-label={`Копировать вопрос ${q.question_id}`} onClick={(e) => { e.stopPropagation(); duplicateQuestion.mutate(q.question_id); }} disabled={duplicateQuestion.isPending}>
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {showArchived ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm h-8 px-2 text-emerald-600"
                                  aria-label={`Восстановить вопрос ${q.question_id}`}
                                  onClick={(e) => { e.stopPropagation(); restoreQuestion.mutate(q.question_id); }}
                                >
                                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Восстановить
                                </button>
                              ) : (
                                <button type="button" className="btn btn-ghost btn-sm h-8 w-8 p-0 text-[var(--color-danger)]" aria-label={`Удалить вопрос ${q.question_id}`} onClick={(e) => { e.stopPropagation(); setDeletingQuestion(q); }}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <QuestionEditorModal
        editor={editor}
        editingQuestion={editingQuestion}
        disciplines={disciplines.data ?? []}
        topics={editorTopics.data ?? []}
        imageFile={imageFile}
        imagePreviewUrl={imagePreviewUrl}
        imageError={imageError}
        removeExistingImage={removeExistingImage}
        saving={savingQuestion}
        imageInputRef={questionImageRef}
        onClose={closeEditor}
        onSave={saveEditor}
        onPickImage={pickQuestionImage}
        onResetImage={resetImageDraft}
        onRemoveExistingImage={() => setRemoveExistingImage(true)}
        onChange={setEditor}
        onUpdateOption={updateOption}
      />

      <Modal
        open={topicDraft !== null}
        onClose={() => setTopicDraft(null)}
        title={topicDraft?.topic ? "Изменить тему" : "Новая тема"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTopicDraft(null)}>Отмена</Button>
            <Button loading={saveTopic.isPending} disabled={!topicDraft?.name.trim()} onClick={() => saveTopic.mutate()}>
              Сохранить
            </Button>
          </>
        }
      >
        {topicDraft && (
          <div className="space-y-3">
            <Field label="Название" required>
              <Input value={topicDraft.name} onChange={(e) => setTopicDraft({ ...topicDraft, name: e.target.value })} />
            </Field>
            <Field label="Описание">
              <Textarea rows={3} value={topicDraft.description} onChange={(e) => setTopicDraft({ ...topicDraft, description: e.target.value })} />
            </Field>
            <Field label="Порядок">
              <Input type="number" min={0} value={topicDraft.sort_order} onChange={(e) => setTopicDraft({ ...topicDraft, sort_order: Number(e.target.value) || 100 })} />
            </Field>
            <Field label="Изображение">
              <input
                ref={topicImageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => setTopicDraft({ ...topicDraft, file: e.target.files?.[0] ?? null })}
              />
              <div className="space-y-2">
                {topicDraft.topic?.image && !topicDraft.file && (
                  <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-2">
                    <ProtectedImage src={topicDraft.topic.image.url} alt="" className="max-h-40 w-full object-contain rounded bg-[var(--color-bg-elevated)]" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => topicImageRef.current?.click()}>
                    <ImageIcon className="w-4 h-4 mr-1" />
                    {topicDraft.file ? topicDraft.file.name : topicDraft.topic?.image ? "Заменить файл" : "Выбрать файл"}
                  </button>
                  {topicDraft.topic?.image && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-[var(--color-danger)]"
                      onClick={() => deleteTopicImage.mutate(topicDraft.topic!.topic_id)}
                      disabled={deleteTopicImage.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Удалить изображение
                    </button>
                  )}
                </div>
              </div>
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={topicTest !== null}
        onClose={() => { setTopicTest(null); setGroupRules([]); }}
        title={topicTest ? `Тест по теме: ${topicTest.topic.name}` : "Тест по теме"}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setTopicTest(null); setGroupRules([]); }}>Отмена</Button>
            <Button
              loading={saveTopicTest.isPending}
              onClick={() => topicTest && saveTopicTest.mutate({ topicId: topicTest.topic.topic_id, payload: topicTest.values, rules: groupRules })}
            >
              Сохранить
            </Button>
          </>
        }
      >
        {topicTest && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={topicTest.values.is_enabled} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, is_enabled: e.target.checked } })} />
              Тест по теме включен
            </label>
            <Field label="Вопросов">
              <Input type="number" min={1} max={2000} value={topicTest.values.question_count} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, question_count: Number(e.target.value) || 1 } })} />
            </Field>
            <Field label="Минут">
              <Input type="number" min={1} max={240} value={topicTest.values.time_limit_minutes} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, time_limit_minutes: Number(e.target.value) || 20 } })} />
            </Field>
            <Field label="Попыток">
              <Input type="number" min={0} max={100} value={topicTest.values.attempts_allowed} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, attempts_allowed: Number(e.target.value) || 0 } })} />
            </Field>
            <Field label={passingScoreLabel(topicTest.values.grade_scale)}>
              <Input
                type="number"
                min={0}
                max={passingScoreMax(topicTest.values.grade_scale)}
                value={
                  topicTest.values.passing_score_percent == null
                    ? ""
                    : percentToScaleValue(topicTest.values.passing_score_percent, topicTest.values.grade_scale)
                }
                onChange={(e) =>
                  setTopicTest({
                    ...topicTest,
                    values: {
                      ...topicTest.values,
                      passing_score_percent:
                        e.target.value === "" ? null : scaleValueToPercent(Number(e.target.value), topicTest.values.grade_scale),
                    },
                  })
                }
              />
            </Field>
            <Field label="Задержка попыток (мин)">
              <Input type="number" min={0} value={topicTest.values.attempt_delay_minutes ?? ""} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, attempt_delay_minutes: e.target.value === "" ? null : Number(e.target.value) } })} />
            </Field>
            <Field label="Метод оценивания">
              <select className="input w-full" value={topicTest.values.grading_method ?? "best"} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, grading_method: e.target.value as any } })}>
                <option value="best">Лучшая попытка</option>
                <option value="last">Последняя попытка</option>
                <option value="average">Средняя оценка</option>
                <option value="first">Первая попытка</option>
              </select>
            </Field>
            <Field label="Тип оценки за тест">
              <select className="input w-full" value={topicTest.values.grade_scale ?? "5_point"} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, grade_scale: e.target.value } })}>
                <option value="5_point">Пятибалльная (1 - кол, 2 - неуд, 3 - удовл, 4 - хор, 5 - отл)</option>
                <option value="10_point">Десятибалльная (1-10)</option>
                <option value="percent">Проценты</option>
              </select>
            </Field>
            <Field label="Доступен с">
              <Input type="datetime-local" value={toLocalInput(topicTest.values.available_from)} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, available_from: fromLocalInput(e.target.value) } })} />
            </Field>
            <Field label="Доступен до">
              <Input type="datetime-local" value={toLocalInput(topicTest.values.available_until)} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, available_until: fromLocalInput(e.target.value) } })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={topicTest.values.shuffle_seed} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, shuffle_seed: e.target.checked } })} />
              Перемешивать
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={topicTest.values.show_correct_after_finish} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, show_correct_after_finish: e.target.checked } })} />
              Показывать ответы
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={topicTest.values.show_question_points !== false} onChange={(e) => setTopicTest({ ...topicTest, values: { ...topicTest.values, show_question_points: e.target.checked } })} />
              Показывать баллы
            </label>

            {groupRules && groupRules.length > 0 && (
              <div className="sm:col-span-2 border-t border-[var(--color-border)] pt-4 mt-2">
                <h3 className="font-semibold text-sm text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[var(--color-accent)]" />
                  Сроки доступности по группам
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  Если даты не заданы, применяются общие настройки доступности темы выше.
                </p>
                <div className="space-y-3">
                  {groupRules.map((rule, index) => (
                    <div key={rule.group_id} className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-muted)]/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-[var(--color-text-secondary)]">
                          Группа: <strong className="text-[var(--color-text-primary)]">{rule.group_name}</strong>
                        </span>
                        {(rule.available_from || rule.available_until) && (
                          <button
                            type="button"
                            className="text-[var(--color-danger)] text-xs hover:underline flex items-center gap-1"
                            onClick={() => {
                              const newRules = [...groupRules];
                              newRules[index] = { ...rule, available_from: null, available_until: null };
                              setGroupRules(newRules);
                            }}
                          >
                            Сбросить даты
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Доступен с">
                          <Input
                            type="datetime-local"
                            value={toLocalInput(rule.available_from)}
                            onChange={(e) => {
                              const newRules = [...groupRules];
                              newRules[index] = { ...rule, available_from: fromLocalInput(e.target.value) };
                              setGroupRules(newRules);
                            }}
                          />
                        </Field>
                        <Field label="Доступен до">
                          <Input
                            type="datetime-local"
                            value={toLocalInput(rule.available_until)}
                            onChange={(e) => {
                              const newRules = [...groupRules];
                              newRules[index] = { ...rule, available_until: fromLocalInput(e.target.value) };
                              setGroupRules(newRules);
                            }}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={bulkActionConfirm !== null}
        onClose={() => setBulkActionConfirm(null)}
        title={
          bulkActionConfirm?.type === "archive"
            ? "Архивировать вопросы?"
            : bulkActionConfirm?.type === "restore"
              ? "Восстановить вопросы?"
              : bulkActionConfirm?.type === "topic"
                ? "Перенести вопросы в тему?"
                : bulkActionConfirm?.type === "difficulty"
                  ? "Изменить сложность вопросов?"
                  : "Добавить теги к вопросам?"
        }
        description={
          bulkActionConfirm?.type === "tags" ? (
            <div className="space-y-2 text-left">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Введите теги через запятую (будут добавлены ко всем выбранным вопросам):
              </p>
              <input
                type="text"
                className="input w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm"
                placeholder="например: sql, теория"
                value={bulkTagsInput}
                onChange={(e) => setBulkTagsInput(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            bulkActionConfirm
              ? `Действие затронет выбранные вопросы в количестве: ${bulkActionConfirm.ids.length} шт.`
              : undefined
          )
        }
        confirmLabel={
          bulkActionConfirm?.type === "archive"
            ? "Архивировать"
            : bulkActionConfirm?.type === "restore"
              ? "Восстановить"
              : bulkActionConfirm?.type === "topic"
                ? "Перенести"
                : bulkActionConfirm?.type === "difficulty"
                  ? "Применить"
                  : "Добавить"
        }
        tone={bulkActionConfirm?.type === "archive" ? "danger" : "primary"}
        loading={
          bulkArchiveQuestions.isPending ||
          bulkChangeTopic.isPending ||
          bulkChangeDifficulty.isPending ||
          bulkAddTags.isPending
        }
        onConfirm={async () => {
          if (!bulkActionConfirm) return;
          const { type, ids, topicId, difficulty } = bulkActionConfirm;
          setBulkActionConfirm(null);
          if (type === "archive") {
            await bulkArchiveQuestions.mutateAsync({ ids, archived: true });
          } else if (type === "restore") {
            await bulkArchiveQuestions.mutateAsync({ ids, archived: false });
          } else if (type === "topic") {
            await bulkChangeTopic.mutateAsync({ ids, topicId: topicId ?? null });
          } else if (type === "difficulty") {
            await bulkChangeDifficulty.mutateAsync({ ids, difficulty: difficulty! });
          } else if (type === "tags") {
            const tagsList = bulkTagsInput.split(",").map(t => t.trim()).filter(Boolean);
            await bulkAddTags.mutateAsync({ ids, tags: tagsList });
            setBulkTagsInput("");
          }
        }}
      />


      <ConfirmModal
        open={deletingQuestion !== null}
        onClose={() => setDeletingQuestion(null)}
        title="Удалить вопрос?"
        description={deletingQuestion ? `Вопрос «${deletingQuestion.text}» будет удалён из банка.` : undefined}
        confirmLabel="Удалить"
        loading={deleteQuestion.isPending}
        onConfirm={confirmDeleteQuestion}
      />

      <ConfirmModal
        open={confirmingDeleteAll}
        onClose={() => setConfirmingDeleteAll(false)}
        title="Удалить все вопросы?"
        description={
          questionRows.length === 0
            ? "Нет видимых вопросов."
            : `Будут архивированы все ${questionRows.length} вопросов в выбранном срезе (дисциплина / тема / поиск). Действие можно отменить, восстановив каждый из архива — но удобнее сначала проверить фильтр.`
        }
        confirmLabel={`Удалить ${questionRows.length}`}
        loading={bulkArchiveQuestions.isPending}
        onConfirm={() => {
          setConfirmingDeleteAll(false);
          if (!questionRows.length) return;
          bulkArchiveQuestions.mutate({ ids: questionRows.map((q) => q.question_id), archived: true });
        }}
      />

      <ConfirmModal
        open={deletingTopic !== null}
        onClose={() => setDeletingTopic(null)}
        title="Удалить тему?"
        description={deletingTopic ? `Тема «${deletingTopic.name}» будет архивирована. Если в теме есть вопросы, сервер отклонит удаление. В течение 5 секунд удаление можно отменить.` : undefined}
        confirmLabel="Удалить"
        loading={deleteTopic.isPending}
        onConfirm={() => {
          const target = deletingTopic;
          setDeletingTopic(null);
          if (!target) return;
          const disciplineId = selectedDisciplineId;
          deleteTopic.mutate(target.topic_id, {
            onSuccess: () => {
              if (disciplineId == null) return;
              pushToast("success", `Тема «${target.name}» архивирована`, 5000, {
                label: "Отменить",
                title: "Восстановить тему",
                onClick: async () => {
                  await restoreTopic.mutateAsync(target.topic_id);
                },
              });
            },
          });
        }}
      />

      <ConfirmModal
        open={archivingDiscipline !== null}
        onClose={() => setArchivingDiscipline(null)}
        title="Архивировать дисциплину?"
        description={archivingDiscipline ? `Дисциплина «${archivingDiscipline.name}» исчезнет из активного банка вопросов. В течение 5 секунд архивацию можно отменить.` : undefined}
        confirmLabel="Архивировать"
        loading={archiveDiscipline.isPending}
        onConfirm={() => {
          const target = archivingDiscipline;
          setArchivingDiscipline(null);
          if (!target) return;
          archiveDiscipline.mutate(target.discipline_id, {
            onSuccess: () => {
              pushToast("success", `Дисциплина «${target.name}» архивирована`, 5000, {
                label: "Отменить",
                title: "Восстановить дисциплину",
                onClick: async () => {
                  await restoreDiscipline.mutateAsync(target.discipline_id);
                },
              });
            },
          });
        }}
      />

      <AiGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        initialDisciplineId={selectedDisciplineId}
        initialTopicId={typeof selectedTopicId === "number" ? selectedTopicId : null}
        onSuccess={(taskId, count) => {
          setShowPendingAI(true);
          setShowArchived(false);
          setSelectedTopicId("all");
          qc.invalidateQueries({ queryKey: ["v2", "questions", "pending", selectedDisciplineId] });
        }}
      />
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1.5">
      <div className="font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</div>
      <div className="text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}

function QuestionQualityPanel({
  report,
  loading,
  error,
  filter,
  onFilterChange,
  items,
  onEditQuestion,
}: {
  report: QuestionQualityReportOut | undefined;
  loading: boolean;
  error: string | null;
  filter: QualityFilter;
  onFilterChange: (filter: QualityFilter) => void;
  items: QuestionQualityItemOut[];
  onEditQuestion: (item: QuestionQualityItemOut) => void;
}) {
  const summary = report?.summary;
  const hasIssues = (summary?.questions_with_issues ?? 0) > 0;
  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border",
              hasIssues
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
            )}>
              {hasIssues ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">Качество вопросов</div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                {loading
                  ? "Проверка банка вопросов..."
                  : error
                    ? error
                    : hasIssues
                      ? "Найдены вопросы, которые стоит исправить перед публикацией тестов."
                      : "В выбранном срезе критичных проблем не найдено."}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[28rem]">
            <QualityMetric label="проверено" value={summary?.checked_questions ?? 0} />
            <QualityMetric label="с проблемами" value={summary?.questions_with_issues ?? 0} />
            <QualityMetric label="ошибок" value={summary?.severity_counts?.error ?? 0} tone="danger" />
            <QualityMetric label="дубликатов" value={summary?.duplicate_groups ?? 0} />
          </div>
        </div>

        {loading && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        )}

        {!loading && !error && report && (
          <>
            <div className="flex flex-wrap gap-2">
              {QUALITY_FILTERS.map((item) => {
                const count = item.code === "all"
                  ? report.summary.questions_with_issues
                  : report.summary.issue_counts[item.code] ?? 0;
                return (
                  <button
                    key={item.code}
                    type="button"
                    className={cn("btn btn-sm", filter === item.code ? "btn-primary" : "btn-ghost")}
                    onClick={() => onFilterChange(item.code)}
                  >
                    {item.label}
                    <span className="ml-1 tabular-nums text-xs opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>

            {items.length === 0 ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                По выбранному типу проблем ничего не найдено.
              </div>
            ) : (
              <div className="grid gap-2">
                {items.slice(0, 6).map((item) => (
                  <div key={item.question_id} className="rounded-md border border-[var(--color-border)] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-[var(--color-text-muted)]">#{item.question_id}</span>
                          <Badge tone="neutral">{QUESTION_TYPE_LABELS[item.qtype]?.short ?? item.qtype}</Badge>
                          <span className="text-xs text-[var(--color-text-muted)]">{item.topic_name ?? "Без темы"}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm text-[var(--color-text-primary)]">{item.text}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.issues.map((issue, index) => (
                            <span
                              key={`${issue.code}-${index}`}
                              className={cn(
                                "inline-flex items-center rounded-md border px-2 py-0.5 text-xs",
                                issue.severity === "error"
                                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
                              )}
                              title={issue.message}
                            >
                              {QUALITY_ISSUE_LABELS[issue.code] ?? issue.code}: {issue.message}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        iconLeft={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => onEditQuestion(item)}
                      >
                        Исправить
                      </Button>
                    </div>
                  </div>
                ))}
                {items.length > 6 && (
                  <div className="text-xs text-[var(--color-text-muted)]">
                    Показано 6 из {items.length}. Уточните фильтр проблемы или поиск в таблице.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function QualityMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2">
      <div className={cn(
        "text-lg font-semibold tabular-nums",
        tone === "danger" && value > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]",
      )}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}

type TopicChipActions =
  | {
      topic: DisciplineTopicOut;
      onEdit: () => void;
      onSettings: () => void;
      onDelete: () => void;
      onRestore: () => void;
      archived?: boolean;
    }
  | {
      topic?: undefined;
      onEdit?: undefined;
      onSettings?: undefined;
      onDelete?: undefined;
      onRestore?: undefined;
      archived?: boolean;
    };

function TopicChip(
  props: {
    active: boolean;
    title: string;
    count: number;
    imageUrl?: string | null;
    testEnabled?: boolean;
    onClick: () => void;
  } & TopicChipActions,
) {
  const { active, title, count, imageUrl, testEnabled, onClick, topic: t, onEdit, onSettings, onDelete, onRestore, archived } = props;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`min-w-[210px] max-w-[280px] rounded-md border px-3 py-2 text-left shrink-0 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"} ${archived ? "opacity-80" : ""}`}
    >
      <div className="flex gap-2 items-start">
        <div className="w-9 h-9 rounded bg-[var(--color-bg-muted)] overflow-hidden shrink-0 grid place-items-center">
          {imageUrl ? <ProtectedImage src={imageUrl} alt="" className="w-full h-full object-cover" /> : <BookOpen className="w-4 h-4 text-[var(--color-text-muted)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <div className="text-sm font-medium truncate" title={title}>{title}</div>
            {archived && <Badge tone="warning">архив</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Badge tone="neutral">{count}</Badge>
            {testEnabled != null && <Badge tone={testEnabled ? "success" : "neutral"}>{testEnabled ? "тест" : "выкл"}</Badge>}
          </div>
        </div>
      </div>
      {t && (
        <div className={`mt-2 grid gap-1 ${archived ? "grid-cols-2" : "grid-cols-3"}`}>
          {!archived && (
            <button
              type="button"
              title={`Изменить тему «${t.name}»`}
              aria-label={`Изменить тему ${t.name}`}
              className="inline-flex items-center justify-center gap-1 h-7 rounded text-xs font-medium border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-muted)] transition"
              onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            >
              <Pencil className="w-3.5 h-3.5" /> Изменить
            </button>
          )}
          {!archived && (
            <button
              type="button"
              title="Настройки теста"
              aria-label={`Настройки теста темы ${t.name}`}
              className="inline-flex items-center justify-center gap-1 h-7 rounded text-xs font-medium border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-muted)] transition"
              onClick={(e) => { e.stopPropagation(); onSettings?.(); }}
            >
              <Settings className="w-3.5 h-3.5" /> Тест
            </button>
          )}
          <button
            type="button"
            title={archived ? `Восстановить тему «${t.name}»` : `Удалить тему «${t.name}»`}
            aria-label={archived ? `Восстановить тему ${t.name}` : `Удалить тему ${t.name}`}
            className={`inline-flex items-center justify-center gap-1 h-7 rounded text-xs font-medium border transition ${
              archived
                ? "border-emerald-500/40 text-emerald-600 bg-[var(--color-bg-elevated)] hover:bg-emerald-500/10"
                : "border-[var(--color-danger)]/40 text-[var(--color-danger)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-danger-bg)]"
            }`}
            onClick={(e) => { e.stopPropagation(); archived ? onRestore?.() : onDelete?.(); }}
          >
            {archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            {archived ? "Восстановить" : "Удалить"}
          </button>
        </div>
      )}
    </div>
  );
}

function AiHelperButtons({ editor, onChange }: { editor: QuestionPayload; onChange: (p: QuestionPayload) => void; }) {
  const [loading, setLoading] = useState<string | null>(null);
  const pushToast = useToasts((s) => s.push);

  const handleGenerateOptions = async () => {
    if (!editor.text) return pushToast({ tone: "warning", title: "Введите текст вопроса" });
    setLoading("options");
    try {
      const targetQtype = ["single", "multi"].includes(editor.qtype) ? editor.qtype : "single";
      const res = await editorGenerateOptions(editor.text, targetQtype);
      onChange({ 
        ...editor, 
        qtype: targetQtype,
        options: res.options.map((o, i) => ({ option_number: i + 1, text: o.text, is_correct: o.is_correct, match_left: null, match_right: null, correct_position: null })) 
      });
      pushToast({ tone: "success", title: "Варианты сгенерированы" });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка", body: errorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const handleWriteCorrectAnswer = async () => {
    if (!editor.text) return pushToast({ tone: "warning", title: "Введите текст вопроса" });
    setLoading("correct_answer");
    try {
      const optionsText = editor.options?.map(o => o.text) || [];
      const res = await editorWriteCorrectAnswer(editor.text, editor.qtype, optionsText);
      const nextEditor = { ...editor };
      
      if (res.explanation && !nextEditor.explanation) {
        nextEditor.explanation = res.explanation;
      }
      
      if (["short", "numeric"].includes(editor.qtype)) {
        nextEditor.short_pattern = res.correct_answer;
        nextEditor.options = [{
          option_number: 1,
          text: res.correct_answer,
          is_correct: true,
          match_left: null,
          match_right: null,
          correct_position: null
        }];
      } else if (editor.qtype === "text") {
        nextEditor.acceptable_answers = [res.correct_answer];
      } else if (editor.qtype === "bool") {
        const isTrue = res.correct_answer.toLowerCase() === "true" || res.correct_answer === "1";
        nextEditor.correct_bool = isTrue;
      } else if (["single", "multi"].includes(editor.qtype)) {
        if (nextEditor.options && nextEditor.options.length > 0) {
          const matchText = res.correct_answer.toLowerCase().trim();
          let matched = false;
          nextEditor.options = nextEditor.options.map(o => {
            const isMatch = o.text.toLowerCase().trim().includes(matchText) || matchText.includes(o.text.toLowerCase().trim());
            if (isMatch) matched = true;
            return {
              ...o,
              is_correct: editor.qtype === "single" ? isMatch : (o.is_correct || isMatch)
            };
          });
          if (!matched && editor.qtype === "single") {
            nextEditor.options[0].is_correct = true;
          }
        } else {
          nextEditor.options = [{
            option_number: 1,
            text: res.correct_answer,
            is_correct: true,
            match_left: null,
            match_right: null,
            correct_position: null
          }];
        }
      }
      
      onChange(nextEditor);
      pushToast({ tone: "success", title: "Правильный ответ записан" });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка", body: errorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const handleRephrase = async () => {
    if (!editor.text) return;
    setLoading("rephrase");
    try {
      const res = await editorRephraseQuestion(editor.text);
      onChange({ ...editor, text: res.text });
      pushToast({ tone: "success", title: "Переформулировано" });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка", body: errorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const handleExplain = async () => {
    if (!editor.text) return;
    let context = "";
    if (editor.options?.length) {
      context = editor.options.filter(o => o.is_correct).map(o => o.text).join(", ");
    } else if (editor.acceptable_answers?.length) {
      context = editor.acceptable_answers.join(", ");
    }
    setLoading("explain");
    try {
      const res = await editorExplainQuestion(editor.text, context || "Нет правильных ответов");
      onChange({ ...editor, explanation: res.explanation });
      pushToast({ tone: "success", title: "Пояснение сгенерировано" });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка", body: errorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const handleComplexity = async () => {
    if (!editor.text) return;
    setLoading("complexity");
    try {
      const res = await editorCheckComplexity(editor.text);
      onChange({ ...editor, difficulty: res.complexity });
      pushToast({ tone: "success", title: "Сложность оценена", body: `Сложность: ${res.complexity}. ${res.reason}` });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Ошибка", body: errorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2 bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-md border border-indigo-100 dark:border-indigo-800/50">
      <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1 mr-2">
        <Sparkles className="w-3.5 h-3.5" /> AI-помощник
      </div>
      <Button size="sm" variant="secondary" onClick={handleRephrase} disabled={!!loading} loading={loading === "rephrase"}>
        Переформулировать
      </Button>
      {["single", "multi", "short", "numeric", "text"].includes(editor.qtype) && (
        <Button size="sm" variant="secondary" onClick={handleGenerateOptions} disabled={!!loading} loading={loading === "options"}>
          Составить варианты ответов
        </Button>
      )}
      {["short", "numeric", "text", "bool", "single", "multi"].includes(editor.qtype) && (
        <Button size="sm" variant="secondary" onClick={handleWriteCorrectAnswer} disabled={!!loading} loading={loading === "correct_answer"}>
          Написать правильный ответ
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={handleExplain} disabled={!!loading} loading={loading === "explain"}>
        Написать пояснение
      </Button>
      <Button size="sm" variant="secondary" onClick={handleComplexity} disabled={!!loading} loading={loading === "complexity"}>
        Оценить сложность
      </Button>
    </div>
  );
}

function QuestionEditorModal({
  editor,
  editingQuestion,
  disciplines,
  topics,
  imageFile,
  imagePreviewUrl,
  imageError,
  removeExistingImage,
  saving,
  imageInputRef,
  onClose,
  onSave,
  onPickImage,
  onResetImage,
  onRemoveExistingImage,
  onChange,
  onUpdateOption,
}: {
  editor: QuestionPayload | null;
  editingQuestion: QuestionWithType | null;
  disciplines: QuestionBankDisciplineOut[];
  topics: DisciplineTopicOut[];
  imageFile: File | null;
  imagePreviewUrl: string | null;
  imageError: string | null;
  removeExistingImage: boolean;
  saving: boolean;
  imageInputRef: RefObject<HTMLInputElement>;
  onClose: () => void;
  onSave: () => void;
  onPickImage: (file: File | undefined) => void;
  onResetImage: () => void;
  onRemoveExistingImage: () => void;
  onChange: (payload: QuestionPayload | null) => void;
  onUpdateOption: (i: number, patch: Partial<QuestionPayload["options"][number]>) => void;
}) {
  // Persisted toggle: показывать ли колонку предпросмотра. Скрытие отдаёт всю
  // ширину формы и устраняет тесноту/наслаивание в узком модальном окне.
  const [showPreview, setShowPreview] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("qb:showPreview") !== "0";
  });
  const togglePreview = () => {
    setShowPreview((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("qb:showPreview", next ? "1" : "0");
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  };

  // Persist the height the user gives the «Текст вопроса» textarea by dragging
  // its resize handle, restoring it the next time the editor opens.
  const isOpen = editor !== null;
  const questionTextRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const el = questionTextRef.current;
    if (!el) return;
    const saved = window.localStorage.getItem("qb:questionTextHeight");
    if (saved) el.style.height = saved;
    const ro = new ResizeObserver(() => {
      if (el.style.height) {
        try {
          window.localStorage.setItem("qb:questionTextHeight", el.style.height);
        } catch {
          /* ignore */
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  return (
    <Modal
      open={editor !== null}
      onClose={onClose}
      title={editingQuestion ? "Изменить вопрос" : "Новый вопрос"}
      size={showPreview ? "xl" : "lg"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} iconLeft={<X className="w-4 h-4" />} disabled={saving}>Отмена</Button>
          <Button loading={saving} disabled={!editor?.text.trim()} onClick={onSave}>{editingQuestion ? "Сохранить" : "Создать"}</Button>
        </>
      }
    >
      {editor && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              onClick={togglePreview}
            >
              {showPreview ? "Скрыть предпросмотр" : "Показать предпросмотр"}
            </Button>
          </div>
          <div className={cn("grid grid-cols-1 gap-6", showPreview && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
          <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Дисциплина">
              <select
                className="input pr-8"
                value={editor.discipline_id}
                onChange={(e) => onChange({ ...editor, discipline_id: Number(e.target.value), topic_id: null })}
              >
                {disciplines.map((d) => <option key={d.discipline_id} value={d.discipline_id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Тема">
              <select className="input pr-8" value={editor.topic_id ?? "none"} onChange={(e) => onChange({ ...editor, topic_id: e.target.value === "none" ? null : Number(e.target.value) })}>
                <option value="none">Без темы</option>
                {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Тип">
              <Select
                value={editor.qtype}
                onChange={(e) => {
                  const t = e.target.value as QuestionType;
                  onChange({ ...blankEditor(editor.discipline_id, t, editor.topic_id ?? null), tag_ids: editor.tag_ids });
                }}
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABELS[t].full}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Текст вопроса" required>
            <Textarea ref={questionTextRef} rows={3} className="resize-y" value={editor.text} onChange={(e) => onChange({ ...editor, text: e.target.value })} />
          </Field>
          
          <AiHelperButtons editor={editor} onChange={onChange} />

          <Field label="Изображение">
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
            {imagePreviewUrl ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-3">
                <img src={imagePreviewUrl} alt="" className="max-h-56 w-full object-contain rounded bg-[var(--color-bg-elevated)]" />
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                  <span className="truncate">{imageFile?.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm text-[var(--color-danger)]" onClick={onResetImage}><Trash2 className="w-3.5 h-3.5 mr-1" />Удалить</button>
                </div>
              </div>
            ) : editingQuestion?.image && !removeExistingImage ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-3">
                <ProtectedImage src={editingQuestion.image.url} alt="" className="max-h-56 w-full object-contain rounded bg-[var(--color-bg-elevated)]" />
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                  <span className="truncate">{editingQuestion.image.original_name ?? "Изображение"}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => imageInputRef.current?.click()}>Заменить</button>
                    <button type="button" className="btn btn-ghost btn-sm text-[var(--color-danger)]" onClick={onRemoveExistingImage}><Trash2 className="w-3.5 h-3.5 mr-1" />Удалить</button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className="w-full min-h-24 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-4 text-sm text-[var(--color-text-secondary)] flex items-center justify-center gap-2 hover:border-[var(--color-border-strong)]" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="w-4 h-4" />Выбрать PNG, JPEG или WebP
              </button>
            )}
            {imageError && <p className="mt-1 text-xs text-[var(--color-danger)]">{imageError}</p>}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Сложность (1-5)">
              <Input type="number" min={1} max={5} value={editor.difficulty} onChange={(e) => onChange({ ...editor, difficulty: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
            </Field>
            {editor.qtype === "short" && (
              <Field label="Regex pattern" hint="Например, ^primary$">
                <Input value={editor.short_pattern ?? ""} onChange={(e) => onChange({ ...editor, short_pattern: e.target.value })} />
              </Field>
            )}
            {editor.qtype === "numeric" && (
              <Field label="Tolerance ±" hint="Допустимая погрешность">
                <Input type="number" step="any" value={editor.numeric_tolerance ?? 0} onChange={(e) => onChange({ ...editor, numeric_tolerance: Number(e.target.value) || 0 })} />
              </Field>
            )}
          </div>

          {editor.qtype === "text" && (
            <TextAnswerEditor editor={editor} onChange={onChange} />
          )}

          {editor.qtype === "order" && (
            <OrderEditor editor={editor} onChange={onChange} />
          )}

          {editor.qtype === "bool" && (
            <BoolEditor editor={editor} onChange={onChange} />
          )}

          {editor.qtype === "cloze" && (
            <ClozeEditor editor={editor} onChange={onChange} />
          )}

          {editor.qtype === "file_upload" && (
            <FileUploadEditor editor={editor} onChange={onChange} />
          )}

          <Field label="Пояснение к правильному ответу" hint="Студент увидит это после завершения теста (если разрешено настройками)">
            <Textarea rows={2} className="resize-y" value={editor.explanation ?? ""} onChange={(e) => onChange({ ...editor, explanation: e.target.value })} />
          </Field>

          {!["text", "order", "bool", "cloze", "file_upload"].includes(editor.qtype) && (
          <div>
            <div className="label">{editor.qtype === "match" ? "Пары (left/right)" : `Варианты (${editor.options.length}/4)`}</div>
            <div className="space-y-2">
              {editor.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  {editor.qtype === "match" ? (
                    <>
                      <span className="w-6 text-center font-semibold text-xs text-[var(--color-text-muted)]">{i + 1}</span>
                      <Input placeholder="left" value={o.match_left ?? ""} onChange={(e) => onUpdateOption(i, { match_left: e.target.value, text: e.target.value })} />
                      <Input placeholder="right" value={o.match_right ?? ""} onChange={(e) => onUpdateOption(i, { match_right: e.target.value })} />
                      <button type="button" className="btn btn-ghost h-9 w-9 p-0 text-[var(--color-danger)]" onClick={() => onChange({ ...editor, options: editor.options.filter((_, ix) => ix !== i) })} aria-label="Удалить пару"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <span className="w-6 text-center font-semibold text-xs text-[var(--color-text-muted)]">{o.option_number}</span>
                      <Input placeholder={`Вариант ${o.option_number}`} value={o.text} onChange={(e) => onUpdateOption(i, { text: e.target.value })} />
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <input
                          type={editor.qtype === "multi" ? "checkbox" : "radio"}
                          name="correct"
                          checked={o.is_correct}
                          onChange={() => {
                            const opts = editor.qtype === "multi"
                              ? editor.options.map((oo, ix) => (ix === i ? { ...oo, is_correct: !oo.is_correct } : oo))
                              : editor.options.map((oo, ix) => ({ ...oo, is_correct: ix === i }));
                            onChange({ ...editor, options: opts });
                          }}
                        />
                        верный
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
            {editor.qtype !== "match" && editor.options.length < 4 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                iconLeft={<Plus className="w-3.5 h-3.5" />}
                onClick={() => onChange({
                  ...editor,
                  options: [...editor.options, { option_number: editor.options.length + 1, text: "", is_correct: false, match_left: null, match_right: null }],
                })}
              >
                Добавить вариант
              </Button>
            )}
          </div>
          )}
          </div>
          {showPreview && (
            <div className="sticky top-0 self-start min-w-0">
              <QuestionPreview
                editor={editor}
                imagePreviewUrl={imagePreviewUrl || (editingQuestion?.image?.url ?? null)}
              />
            </div>
          )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function TextAnswerEditor({ editor, onChange }: { editor: QuestionPayload; onChange: (p: QuestionPayload) => void }) {
  const answers = editor.acceptable_answers ?? [""];
  return (
    <div className="space-y-3">
      <Field label="Эталонные ответы" hint="Один из них должен совпасть с ответом студента">
        <div className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder={`Ответ ${i + 1}`}
                value={a}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  onChange({ ...editor, acceptable_answers: next });
                }}
              />
              <button
                type="button"
                className="btn btn-ghost h-9 w-9 p-0 text-[var(--color-danger)]"
                onClick={() => onChange({ ...editor, acceptable_answers: answers.filter((_, ix) => ix !== i) })}
                aria-label="Удалить эталон"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          iconLeft={<Plus className="w-3.5 h-3.5" />}
          onClick={() => onChange({ ...editor, acceptable_answers: [...answers, ""] })}
        >
          Добавить ещё эталон
        </Button>
      </Field>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!editor.case_sensitive}
            onChange={(e) => onChange({ ...editor, case_sensitive: e.target.checked })}
          />
          учитывать регистр
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={editor.trim_whitespace !== false}
            onChange={(e) => onChange({ ...editor, trim_whitespace: e.target.checked })}
          />
          игнорировать крайние пробелы
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={editor.normalize_universal !== false}
            onChange={(e) => onChange({ ...editor, normalize_universal: e.target.checked })}
          />
          нормализовать кавычки и ё/е
        </label>
      </div>
      <Field label="Режим ответа">
        <Select
          value={editor.text_mode ?? "string"}
          onChange={(e) => onChange({ ...editor, text_mode: e.target.value as "string" | "number" })}
        >
          <option value="string">Строка / слово</option>
          <option value="number">Число</option>
        </Select>
      </Field>
      {editor.text_mode === "number" && (
        <Field label="Допуск (numeric_tolerance)" hint="± от эталона">
          <Input
            type="number"
            step="any"
            value={editor.numeric_tolerance ?? 0}
            onChange={(e) => onChange({ ...editor, numeric_tolerance: Number(e.target.value) || 0 })}
          />
        </Field>
      )}
    </div>
  );
}

function OrderEditor({ editor, onChange }: { editor: QuestionPayload; onChange: (p: QuestionPayload) => void }) {
  function move(from: number, to: number) {
    if (to < 0 || to >= editor.options.length) return;
    const opts = [...editor.options];
    const [taken] = opts.splice(from, 1);
    opts.splice(to, 0, taken);
    onChange({ ...editor, options: opts.map((o, ix) => ({ ...o, correct_position: ix + 1 })) });
  }
  function setText(i: number, text: string) {
    onChange({ ...editor, options: editor.options.map((o, ix) => ix === i ? { ...o, text } : o) });
  }
  function add() {
    const i = editor.options.length;
    onChange({
      ...editor,
      options: [
        ...editor.options,
        { option_number: i + 1, text: "", is_correct: false, correct_position: i + 1 },
      ],
    });
  }
  function remove(i: number) {
    const opts = editor.options.filter((_, ix) => ix !== i);
    onChange({ ...editor, options: opts.map((o, ix) => ({ ...o, correct_position: ix + 1 })) });
  }
  return (
    <div className="space-y-2">
      <div className="label">Варианты в правильном порядке (сверху вниз). Всего: {editor.options.length}/15.</div>
      <div className="space-y-2">
        {editor.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-2">
            <span className="w-8 text-center font-semibold text-xs">{i + 1}</span>
            <Input
              placeholder={`Вариант ${i + 1}`}
              value={o.text}
              onChange={(e) => setText(i, e.target.value)}
            />
            <button type="button" className="btn btn-ghost h-9 px-2" onClick={() => move(i, i - 1)} aria-label="Вверх">↑</button>
            <button type="button" className="btn btn-ghost h-9 px-2" onClick={() => move(i, i + 1)} aria-label="Вниз">↓</button>
            <button type="button" className="btn btn-ghost h-9 w-9 p-0 text-[var(--color-danger)]" onClick={() => remove(i)} aria-label="Удалить вариант"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {editor.options.length < 4 && <div className="text-xs text-[var(--color-danger)]">Минимум 4 варианта.</div>}
        {editor.options.length < 15 && (
          <Button variant="ghost" size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={add}>
            Добавить вариант
          </Button>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs mt-2">
        <input
          type="checkbox"
          checked={!!editor.allow_partial}
          onChange={(e) => onChange({ ...editor, allow_partial: e.target.checked })}
        />
        Частичный балл (за правильно расставленные позиции)
      </label>
    </div>
  );
}

function BoolEditor({ editor, onChange }: { editor: QuestionPayload; onChange: (p: QuestionPayload) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Правильный ответ">
        <div className="flex items-center gap-2">
          <Button
            variant={editor.correct_bool === true ? "primary" : "secondary"}
            size="sm"
            onClick={() => onChange({ ...editor, correct_bool: true })}
          >
            Верно
          </Button>
          <Button
            variant={editor.correct_bool === false ? "primary" : "secondary"}
            size="sm"
            onClick={() => onChange({ ...editor, correct_bool: false })}
          >
            Неверно
          </Button>
        </div>
      </Field>
      <Field label="Пояснение после ответа (необязательно)">
        <Textarea
          rows={2}
          value={editor.explanation ?? ""}
          onChange={(e) => onChange({ ...editor, explanation: e.target.value })}
        />
      </Field>
    </div>
  );
}

function FileUploadEditor({ editor, onChange }: { editor: QuestionPayload; onChange: (p: QuestionPayload) => void }) {
  const allowedText = (editor.file_allowed_types ?? []).join(", ");
  
  const handleAllowedTypesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onChange({ ...editor, file_allowed_types: list });
  };

  return (
    <div className="space-y-4 p-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]">
      <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Настройки загрузки файлов</h3>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Максимальное количество файлов">
          <Input
            type="number"
            min={1}
            max={10}
            value={editor.file_max_count ?? 1}
            onChange={(e) => onChange({ ...editor, file_max_count: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Максимальный размер файла (МБ)">
          <Input
            type="number"
            min={1}
            value={Math.round((editor.file_max_size_bytes ?? 10485760) / 1024 / 1024)}
            onChange={(e) => onChange({ ...editor, file_max_size_bytes: (Number(e.target.value) || 1) * 1024 * 1024 })}
          />
        </Field>
      </div>

      <Field label="Разрешённые расширения" hint="Через запятую, например: .pdf, .zip, .docx, .py. Оставьте пустым для стандартного списка форматов.">
        <Input
          placeholder=".pdf, .zip, .docx, .py"
          value={allowedText}
          onChange={handleAllowedTypesChange}
        />
      </Field>
    </div>
  );
}

function ClozeBlankField({
  blank,
  onChange,
  onRemove,
}: {
  blank: ClozeBlankIn;
  onChange: (b: ClozeBlankIn) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Пропуск {blank.index}</div>
        <button
          type="button"
          className="btn btn-ghost h-8 px-2 text-[var(--color-danger)]"
          onClick={onRemove}
          aria-label="Удалить пропуск"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Удалить
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={`kind-${blank.index}`}
            checked={blank.kind === "select"}
            onChange={() => onChange({
              ...blank,
              kind: "select",
              options: blank.options ?? ["", ""],
              correct_index: blank.correct_index ?? 0,
              acceptable_answers: null,
            })}
          />
          выпадающий список
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={`kind-${blank.index}`}
            checked={blank.kind === "input"}
            onChange={() => onChange({
              ...blank,
              kind: "input",
              options: null,
              correct_index: null,
              acceptable_answers: blank.acceptable_answers ?? [""],
            })}
          />
          свободный ввод
        </label>
      </div>
      {blank.kind === "select" && (
        <>
          <Field label="Варианты" hint="Один из них будет помечен как правильный">
            <div className="space-y-2">
              {(blank.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap w-32">
                    <input
                      type="radio"
                      name={`correct-${blank.index}`}
                      checked={blank.correct_index === i}
                      onChange={() => onChange({ ...blank, correct_index: i })}
                    />
                    правильный
                  </label>
                  <Input
                    placeholder={`Вариант ${i + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const next = [...(blank.options ?? [])];
                      next[i] = e.target.value;
                      onChange({ ...blank, options: next });
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 p-0 text-[var(--color-danger)]"
                    onClick={() => {
                      const next = (blank.options ?? []).filter((_, ix) => ix !== i);
                      const newCorrect = Math.min(blank.correct_index ?? 0, Math.max(0, next.length - 1));
                      onChange({ ...blank, options: next, correct_index: newCorrect });
                    }}
                    aria-label="Удалить вариант"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => onChange({ ...blank, options: [...(blank.options ?? []), ""] })}
            >
              Добавить вариант
            </Button>
          </Field>
        </>
      )}
      {blank.kind === "input" && (
        <Field label="Эталонные ответы" hint="Любой из них принимается">
          <div className="space-y-2">
            {(blank.acceptable_answers ?? [""]).map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder={`Ответ ${i + 1}`}
                  value={a}
                  onChange={(e) => {
                    const next = [...(blank.acceptable_answers ?? [])];
                    next[i] = e.target.value;
                    onChange({ ...blank, acceptable_answers: next });
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost h-9 w-9 p-0 text-[var(--color-danger)]"
                  onClick={() => onChange({
                    ...blank,
                    acceptable_answers: (blank.acceptable_answers ?? []).filter((_, ix) => ix !== i),
                  })}
                  aria-label="Удалить эталон"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => onChange({ ...blank, acceptable_answers: [...(blank.acceptable_answers ?? [""]), ""] })}
            >
              Добавить эталон
            </Button>
          </div>
        </Field>
      )}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!blank.case_sensitive}
            onChange={(e) => onChange({ ...blank, case_sensitive: e.target.checked })}
          />
          регистр важен
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={blank.trim_whitespace !== false}
            onChange={(e) => onChange({ ...blank, trim_whitespace: e.target.checked })}
          />
          игнорировать пробелы
        </label>
      </div>
    </div>
  );
}

function ClozeEditor({ editor, onChange }: { editor: QuestionPayload; onChange: (p: QuestionPayload) => void }) {
  const blanks = (editor.cloze_blanks ?? []).sort((a, b) => a.index - b.index);
  const lastIdx = blanks.length ? Math.max(...blanks.map(b => b.index)) : 0;
  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--color-text-muted)]">
        В тексте вопроса поставьте плейсхолдеры <code className="font-mono">{`{{blank:1}}`}</code>, <code className="font-mono">{`{{blank:2}}`}</code>, …
        Допускается до 3 пропусков.
      </div>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<Plus className="w-3.5 h-3.5" />}
        disabled={blanks.length >= 3}
        onClick={() => onChange({
          ...editor,
          cloze_blanks: [
            ...blanks,
            {
              index: lastIdx + 1,
              kind: "select",
              options: ["", ""],
              correct_index: 0,
              acceptable_answers: null,
              case_sensitive: false,
              trim_whitespace: true,
              normalize_universal: true,
            },
          ],
        })}
      >
        Добавить пропуск ({blanks.length}/3)
      </Button>
      <div className="space-y-2">
        {blanks.map((b, i) => (
          <ClozeBlankField
            key={b.index}
            blank={b}
            onChange={(updated) => {
              const next = blanks.map((orig, ix) => ix === i ? updated : orig);
              onChange({ ...editor, cloze_blanks: next });
            }}
            onRemove={() => onChange({ ...editor, cloze_blanks: blanks.filter((_, ix) => ix !== i) })}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs mt-2">
        <input
          type="checkbox"
          checked={!!editor.allow_partial}
          onChange={(e) => onChange({ ...editor, allow_partial: e.target.checked })}
        />
        Частичный балл (за правильно заполненные пропуски)
      </label>
    </div>
  );
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function passingScoreLabel(scale: string | null | undefined): string {
  if (scale === "5_point") return "Проходной балл (5-балльная)";
  if (scale === "10_point") return "Проходной балл (10-балльная)";
  return "Проходной балл (%)";
}

function passingScoreMax(scale: string | null | undefined): number {
  if (scale === "5_point") return 5;
  if (scale === "10_point") return 10;
  return 100;
}
