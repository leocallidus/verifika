import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Flag, ListTodo, Timer as TimerIcon, X } from "lucide-react";
import { API_URL, api, errorMessage, getToken } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { AppShell } from "../../components/AppShell";
import { Timer } from "../../components/Timer";
import { ConfirmModal } from "../../components/ConfirmModal";
import { pluralizeRu } from "../../lib/plural-ru";
import { QuestionCard } from "../../components/QuestionCard";
import { QuestionTypeBadge } from "../../components/QuestionTypeBadge";
import { QuestionMap } from "../../components/student/QuestionMap";
import { TestHeader } from "../../components/student/TestHeader";
import { SaveIndicator } from "../../components/student/SaveIndicator";
import { AttemptReviewPage } from "../../components/student/AttemptReviewPage";
import {
  BoolCard,
  ClozeCard,
  MatchCard,
  MultiCard,
  NumericCard,
  OrderCard,
  ShortAnswerCard,
  TextCard,
  FileUploadCard,
} from "../../components/QuestionTypeCards";
import { useTestSession } from "../../store/test-session";
import type {
  AnswerIn,
  FinishOut,
  ResumeOut,
} from "../../types/api";
import { isTauri, tauriCommands, tauriEvents } from "../../lib/tauri";

import type React from "react";

export interface UploadedFileInfo {
  upload_id: number;
  original_name: string;
  size_bytes: number;
  uploaded_at: string;
}


type Answer =
  | { kind: "single"; optionId: number }
  | { kind: "multi"; optionIds: number[] }
  | { kind: "short"; text: string }
  | { kind: "numeric"; value: number | null }
  | { kind: "match"; value: Record<string, string> }
  | { kind: "text"; text: string }
  | { kind: "bool"; value: boolean | null }
  | { kind: "order"; optionIds: number[] }
  | { kind: "cloze"; values: Record<string, string> }
  | { kind: "file_upload"; uploadIds: number[] };


type PendingLeaveAction = {
  run: () => void;
};

type TestGuardHistoryState = Record<string, unknown> & {
  idx?: number;
  stsTestGuard?: "base" | "trap";
  stsTestSessionId?: number;
  stsTestBaseIdx?: number;
};

function isSelectLikeElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'select, [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]',
    ),
  );
}

export default function TestRunner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sid = Number(sessionId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";
  const previewTopicId = searchParams.get("topic_id") ? Number(searchParams.get("topic_id")) : null;
  const previewDisciplineId = searchParams.get("discipline_id") ? Number(searchParams.get("discipline_id")) : null;

  const {
    started,
    currentIndex,
    answers,
    setStarted,
    setAnswer,
    goNext,
    goPrev,
    goTo,
    reset,
  } = useTestSession();
  const [answerExtras, setAnswerExtras] = useState<Record<number, Answer>>({});
  const [uploadState, setUploadState] = useState<Record<number, UploadedFileInfo[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "pending" | "error">("idle");
  const [finishOpen, setFinishOpen] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState<PendingLeaveAction | null>(null);
  const [leaveConfirming, setLeaveConfirming] = useState(false);
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [mapOpen, setMapOpen] = useState(false);
  const lastSavedRef = useRef("");
  const lastLocalSnapshotRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const allowLeaveRef = useRef(false);
  const leavePromptRef = useRef<PendingLeaveAction | null>(null);
  const [view, setView] = useState<"testing" | "review">("testing");
  const [visitedQuestions, setVisitedQuestions] = useState<Set<number>>(new Set());

  const questionMapItems = useMemo(() => {
    if (!started) return [];
    return started.questions.map((item) => {
      const qid = item.question_id;
      const extra = answerExtras[qid];
      const answered = !!(
        answers[qid] != null ||
        (extra?.kind === "multi" && extra.optionIds.length > 0) ||
        (extra?.kind === "short" && extra.text.trim()) ||
        (extra?.kind === "numeric" && extra.value != null) ||
        (extra?.kind === "match" && Object.keys(extra.value).length > 0) ||
        (extra?.kind === "text" && extra.text.trim()) ||
        (extra?.kind === "bool" && extra.value != null) ||
        (extra?.kind === "order" && extra.optionIds.length > 0) ||
        (extra?.kind === "cloze" && Object.values(extra.values).some((x) => x?.trim())) ||
        (extra?.kind === "file_upload" && extra.uploadIds.length > 0)
      );
      return {
        id: qid,
        answered,
        visited: visitedQuestions.has(qid),
        flagged: !!flagged[qid],
      };
    });
  }, [started, answers, answerExtras, visitedQuestions, flagged]);

  // Proctoring States
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraLoading, setCameraLoading] = useState(false);


  const resume = useQuery<ResumeOut>({
    queryKey: ["test-runner", sid, isPreview, previewTopicId, previewDisciplineId],
    queryFn: () => {
      if (isPreview) {
        if (previewTopicId != null && !isNaN(previewTopicId)) {
          return api.get<ResumeOut>(`/api/v2/teacher/topics/${previewTopicId}/preview`).then((r) => r.data);
        } else if (previewDisciplineId != null && !isNaN(previewDisciplineId)) {
          return api.get<ResumeOut>(`/api/v2/teacher/disciplines/${previewDisciplineId}/preview`).then((r) => r.data);
        }
      }
      return api.get<ResumeOut>(`/api/student/sessions/${sid}/resume`).then((r) => r.data);
    },
    enabled: isPreview ? (previewTopicId != null || previewDisciplineId != null) : Number.isFinite(sid) && sid > 0,
  });

  useEffect(() => () => reset(), [reset]);

  useEffect(() => {
    if (resume.data && (!started || started.session_id !== resume.data.session_id)) {
      setStarted({
        session_id: resume.data.session_id,
        started_at: resume.data.started_at,
        time_limit_minutes: resume.data.time_limit_minutes,
        expires_at: resume.data.expires_at,
        questions: resume.data.questions,
        topic_metadata: resume.data.topic_metadata,
      });
      const initialSingle: Record<number, number> = {};
      const initialExtras: Record<number, Answer> = {};
      for (const [qid, oid] of Object.entries(resume.data.saved_answers ?? {})) {
        initialSingle[Number(qid)] = Number(oid);
      }
      const savedExtras = resume.data.saved_extras || {};
      for (const q of resume.data.questions) {
        const qid = q.question_id;
        const meta = savedExtras[qid];
        const qtype = q.qmeta?.qtype ?? q.qtype ?? "single";
        if (qtype === "short" && meta?.short != null) {
          initialExtras[qid] = { kind: "short", text: meta.short };
        } else if (qtype === "numeric" && meta?.numeric != null) {
          initialExtras[qid] = { kind: "numeric", value: Number(meta.numeric) };
        } else if (qtype === "match" && Array.isArray(meta?.match)) {
          const value: Record<string, string> = {};
          const pairs = (q.qmeta?.match_pairs ?? []) as Array<{ left: string; right: string }>;
          const submitted = (meta!.match as Array<{ left: string; right: string }>) ?? [];
          for (const p of pairs) {
            const found = submitted.find((s) => s.left === p.left);
            if (found) value[p.left] = found.right;
          }
          initialExtras[qid] = { kind: "match", value };
        } else if (qtype === "multi" && Array.isArray(meta?.match)) {
          initialExtras[qid] = { kind: "multi", optionIds: meta!.match as unknown as number[] };
        } else if (qtype === "text" && typeof meta?.short === "string") {
          initialExtras[qid] = { kind: "text", text: meta!.short as string };
        } else if (qtype === "bool") {
          const raw = meta?.short as string | undefined;
          if (raw === "true" || raw === "false") {
            initialExtras[qid] = { kind: "bool", value: raw === "true" };
          }
        } else if (qtype === "order" && typeof meta?.short === "string") {
          const ids = (meta!.short as string)
            .split(",")
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x));
          initialExtras[qid] = { kind: "order", optionIds: ids };
        } else if (qtype === "cloze" && typeof meta?.short === "string") {
          try {
            const parsed = JSON.parse(meta!.short as string);
            if (parsed && typeof parsed === "object") {
              initialExtras[qid] = { kind: "cloze", values: parsed as Record<string, string> };
            }
          } catch { /* ignore */ }
        } else if (qtype === "file_upload" && Array.isArray(meta?.files)) {
          initialExtras[qid] = { kind: "file_upload", uploadIds: meta.files.map((f: any) => f.upload_id) };
          setUploadState((prev) => ({ ...prev, [qid]: meta.files as UploadedFileInfo[] }));
        }
      }
      const pendingDraft = localStorage.getItem(`sts-pending-${sid}`);
      if (pendingDraft) {
        try {
          const pendingAnswers = JSON.parse(pendingDraft) as AnswerIn[];
          const questionTypeById = new Map(
            resume.data.questions.map((question) => [
              question.question_id,
              question.qmeta?.qtype ?? question.qtype ?? "single",
            ]),
          );
          for (const ans of pendingAnswers) {
            const qid = ans.question_id;
            const qtype = questionTypeById.get(qid);
            if (!qtype) continue;
            if (qtype === "single" && ans.chosen_option_id != null) {
              initialSingle[qid] = ans.chosen_option_id;
            } else if (qtype === "multi" && Array.isArray(ans.match_answer)) {
              initialExtras[qid] = { kind: "multi", optionIds: ans.match_answer as unknown as number[] };
            } else if (qtype === "short" && typeof ans.short_answer === "string") {
              initialExtras[qid] = { kind: "short", text: ans.short_answer };
            } else if (qtype === "numeric" && ans.numeric_answer != null) {
              initialExtras[qid] = { kind: "numeric", value: Number(ans.numeric_answer) };
            } else if (qtype === "match" && Array.isArray(ans.match_answer)) {
              const value: Record<string, string> = {};
              for (const item of ans.match_answer as Array<{ left: string; right: string }>) {
                if (item.left) value[item.left] = item.right;
              }
              initialExtras[qid] = { kind: "match", value };
            } else if (qtype === "text" && typeof ans.text_answer === "string") {
              initialExtras[qid] = { kind: "text", text: ans.text_answer };
            } else if (qtype === "bool" && typeof ans.bool_answer === "boolean") {
              initialExtras[qid] = { kind: "bool", value: ans.bool_answer };
            } else if (qtype === "order" && Array.isArray(ans.order_answer)) {
              initialExtras[qid] = { kind: "order", optionIds: ans.order_answer };
            } else if (qtype === "cloze" && ans.cloze_answer && typeof ans.cloze_answer === "object") {
              initialExtras[qid] = { kind: "cloze", values: ans.cloze_answer as Record<string, string> };
            }
          }
          setSaveState("pending");
        } catch { /* ignore corrupt local draft */ }
      }
      useTestSession.setState({ answers: initialSingle });
      setAnswerExtras(initialExtras);
      
      // Initialize visited questions
      const initialVisited = new Set<number>();
      if (resume.data.questions && resume.data.questions.length > 0) {
        initialVisited.add(resume.data.questions[0].question_id);
      }
      for (const q of resume.data.questions) {
        const qid = q.question_id;
        const hasAns =
          initialSingle[qid] != null ||
          initialExtras[qid] != null;
        if (hasAns) {
          initialVisited.add(qid);
        }
      }
      setVisitedQuestions(initialVisited);

      const savedFlags = localStorage.getItem(`sts-flags-${sid}`);
      if (savedFlags) {
        try {
          setFlagged(JSON.parse(savedFlags));
        } catch {}
      }
    }
  }, [resume.data, started, setStarted]);

  useEffect(() => {
    localStorage.setItem(`sts-flags-${sid}`, JSON.stringify(flagged));
  }, [flagged, sid]);

  // Add current question to visited
  useEffect(() => {
    if (started?.questions[currentIndex]) {
      const qid = started.questions[currentIndex].question_id;
      setVisitedQuestions((prev) => {
        if (prev.has(qid)) return prev;
        const next = new Set(prev);
        next.add(qid);
        return next;
      });
    }
  }, [currentIndex, started]);

  const proctorLevel = isPreview ? 0 : (resume.data?.proctor_min_level ?? 0);

  const setupFinishedRef = useRef(false);
  if (proctorLevel < 2) {
    setupFinishedRef.current = true;
  } else if (isFullscreen && hasCameraPermission === true) {
    setupFinishedRef.current = true;
  }
  const isPreparedRef = setupFinishedRef;
  const selectInteractionUntilRef = useRef(0);

  const startCamera = async () => {
    if (cameraLoading) return;
    setCameraLoading(true);
    try {
      if (!navigator.mediaDevices) {
        setHasCameraPermission(true);
        pushToast("warning", "Интерфейс веб-камеры недоступен. Тест запущен без фотофиксации.");
        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "no_webcam_device",
          metadata: { info: "navigator.mediaDevices is undefined (insecure context?)" },
        });
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const hasVideoInput = devices.some((d) => d.kind === "videoinput");
      if (!hasVideoInput) {
        setHasCameraPermission(true);
        pushToast("warning", "Веб-камера не обнаружена. Тест запущен в режиме без фотофиксации.");
        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "no_webcam_device",
          metadata: { info: "No webcam device detected on student machine" },
        });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setHasCameraPermission(true); // Always allow test start
      const isDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      if (isDenied) {
        pushToast("warning", "Доступ к веб-камере отклонен. Тест запущен без фотофиксации (предупреждение отправлено преподавателю).");
        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "no_webcam_device",
          metadata: { info: `Webcam permission denied: ${err.name} - ${err.message}` },
        });
      } else {
        pushToast("warning", `Не удалось получить доступ к камере (${err.name || "ошибка"}). Тест запущен без фотофиксации.`);
        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "no_webcam_device",
          metadata: { info: `Webcam error: ${err.name} - ${err.message}` },
        });
      }
    } finally {
      setCameraLoading(false);
    }
  };

  const captureSnapshot = async () => {
    if (!videoRef.current || !cameraStream) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const formData = new FormData();
      formData.append("file", blob, `webcam_session_${sid}.jpg`);
      try {
        await api.post(`/api/student/sessions/${sid}/webcam-snapshot`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch (err) {
        console.error("Webcam snapshot upload failed:", err);
      }
    }, "image/jpeg", 0.75);
  };

  const enterFullscreen = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      void el.requestFullscreen().catch(console.error);
    } else if ((el as any).webkitRequestFullscreen) {
      void (el as any).webkitRequestFullscreen();
    }
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Request camera automatically when test starts
  useEffect(() => {
    if (started && proctorLevel >= 2) {
      void startCamera();
    }
  }, [started, proctorLevel]);

  // 1. Visibility & Blur tracking (Level >= 1)
  useEffect(() => {
    if (proctorLevel < 1 || !started) return;

    let blurTime = 0;
    let isInteractingWithSelect = false;
    let selectInteractionTimer: number | undefined;

    const markSelectInteraction = () => {
      isInteractingWithSelect = true;
      selectInteractionUntilRef.current = Date.now() + 1200;
      if (selectInteractionTimer !== undefined) {
        window.clearTimeout(selectInteractionTimer);
      }
      selectInteractionTimer = window.setTimeout(() => {
        const activeEl = document.activeElement;
        if (!isSelectLikeElement(activeEl)) {
          isInteractingWithSelect = false;
        }
      }, 1200);
    };

    const handleSelectFocus = (e: FocusEvent) => {
      if (isSelectLikeElement(e.target)) {
        markSelectInteraction();
      }
    };

    const handleSelectBlur = () => {
      setTimeout(() => {
        if (!isSelectLikeElement(document.activeElement)) {
          isInteractingWithSelect = false;
        }
      }, 100);
    };

    const handleSelectPointer = (e: Event) => {
      if (isSelectLikeElement(e.target)) {
        markSelectInteraction();
      }
    };

    const handleSelectKeyDown = (e: KeyboardEvent) => {
      if (
        isSelectLikeElement(e.target) &&
        ["ArrowDown", "ArrowUp", "Enter", " ", "Spacebar", "F4"].includes(e.key)
      ) {
        markSelectInteraction();
      }
    };

    const handleBlur = () => {
      if (!isPreparedRef.current) return;

      // Ignore blur when interacting with dropdown lists
      if (document.visibilityState !== "hidden") {
        if (
          isInteractingWithSelect ||
          selectInteractionUntilRef.current > Date.now() ||
          isSelectLikeElement(document.activeElement)
        ) {
          return;
        }
      }

      blurTime = Date.now();
      void api.post(`/api/student/sessions/${sid}/proctor-events`, {
        event_type: "tab_blur",
        metadata: { info: "Window lost focus" },
      });
      pushToast("warning", "Внимание: вы вышли из фокуса вкладки теста! Нарушение зафиксировано.");
    };

    const handleFocus = () => {
      if (!isPreparedRef.current) return;
      if (blurTime > 0) {
        const away = Math.round((Date.now() - blurTime) / 1000);
        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "tab_focus",
          metadata: { seconds_away: away },
        });
        blurTime = 0;
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("pointerdown", handleSelectPointer, true);
    document.addEventListener("mousedown", handleSelectPointer, true);
    document.addEventListener("keydown", handleSelectKeyDown, true);
    document.addEventListener("focusin", handleSelectFocus, true);
    document.addEventListener("focusout", handleSelectBlur, true);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleBlur();
      } else {
        handleFocus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (selectInteractionTimer !== undefined) {
        window.clearTimeout(selectInteractionTimer);
      }
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("pointerdown", handleSelectPointer, true);
      document.removeEventListener("mousedown", handleSelectPointer, true);
      document.removeEventListener("keydown", handleSelectKeyDown, true);
      document.removeEventListener("focusin", handleSelectFocus, true);
      document.removeEventListener("focusout", handleSelectBlur, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [proctorLevel, started, sid]);

  // 2. Keyboard combination blocking & copy/paste/middle-click block (Level 2)
  useEffect(() => {
    if (proctorLevel < 2 || !started) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPreparedRef.current) return;
      const key = e.key.toLowerCase();
      const isCtrl = e.ctrlKey || e.metaKey;

      const isCopy = isCtrl && key === "c";
      const isPaste = isCtrl && key === "v";
      const isSource = isCtrl && key === "u";
      const isF12 = e.key === "F12";
      const isPrintScreen = e.key === "PrintScreen" || e.key === "Snapshot";

      if (isCopy || isPaste || isSource || isF12 || isPrintScreen) {
        e.preventDefault();
        e.stopPropagation();

        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "key_violation",
          metadata: { key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey },
        });

        pushToast("warning", "Сочетание клавиш заблокировано системой прокторинга.");
        void captureSnapshot();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isPreparedRef.current) return;
      e.preventDefault();
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (!isPreparedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      pushToast("warning", "Вставка заблокирована системой прокторинга.");
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (!isPreparedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      pushToast("warning", "Копирование заблокировано системой прокторинга.");
    };

    const handleMiddleClick = (e: MouseEvent) => {
      if (!isPreparedRef.current) return;
      if (e.button === 1) { // Middle click
        e.preventDefault();
        e.stopPropagation();
        pushToast("warning", "Действие с колесиком мыши заблокировано системой прокторинга.");
      }
    };

    const handleSelectStart = (e: Event) => {
      if (!isPreparedRef.current) return;
      e.preventDefault();
    };

    const handleDragStart = (e: DragEvent) => {
      if (!isPreparedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      if (!isPreparedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      pushToast("warning", "Перетаскивание заблокировано системой прокторинга.");
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("mousedown", handleMiddleClick, true);
    document.addEventListener("mouseup", handleMiddleClick, true);
    document.addEventListener("click", handleMiddleClick, true);
    document.addEventListener("selectstart", handleSelectStart, true);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("drop", handleDrop, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("mousedown", handleMiddleClick, true);
      document.removeEventListener("mouseup", handleMiddleClick, true);
      document.removeEventListener("click", handleMiddleClick, true);
      document.removeEventListener("selectstart", handleSelectStart, true);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("drop", handleDrop, true);
    };
  }, [proctorLevel, started, sid, cameraStream]);

  // 3. Periodic webcam snapshots (Level 2)
  useEffect(() => {
    if (proctorLevel < 2 || !started || !cameraStream) return;

    const initialTimeout = setTimeout(() => {
      void captureSnapshot();
    }, 3000);

    const interval = setInterval(() => {
      void captureSnapshot();
    }, 120000); // 2 minutes

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [proctorLevel, started, cameraStream, sid]);

  // 4. Fullscreen lock & enforcement (Level 2)
  useEffect(() => {
    if (proctorLevel < 2 || !started) return;

    const handleFullscreenChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (started && !active && isPreparedRef.current) {
        void api.post(`/api/student/sessions/${sid}/proctor-events`, {
          event_type: "exit_fullscreen",
          metadata: { info: "Student exited fullscreen mode" },
        });
        pushToast("error", "Вы вышли из полноэкранного режима! Нарушение зафиксировано.");
        void captureSnapshot();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    setIsFullscreen(!!document.fullscreenElement);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [proctorLevel, started, sid, cameraStream, hasCameraPermission]);

  // 5. Tauri Focus events & Screenshot blocking (Level 2)
  useEffect(() => {
    if (!started || proctorLevel < 2) return;

    if (isTauri()) {
      void tauriCommands.setAntiScreenshot(true).catch(console.error);

      let unlistenLost: (() => void) | undefined;
      const setupTauriFocus = async () => {
        unlistenLost = await tauriEvents.onFocusLost(() => {
          if (!isPreparedRef.current) return;
          if (selectInteractionUntilRef.current > Date.now() || isSelectLikeElement(document.activeElement)) return;
          void api.post(`/api/student/sessions/${sid}/proctor-events`, {
            event_type: "app_minimized",
            metadata: { info: "Tauri window lost focus" },
          });
          pushToast("error", "Окно приложения потеряло фокус! Нарушение зафиксировано.");
          void captureSnapshot();
        });
      };
      void setupTauriFocus();

      // Linux screenshot tools check
      const linuxCheckInterval = setInterval(async () => {
        if (!isPreparedRef.current) return;
        try {
          const detected = await tauriCommands.detectScreenshotTools();
          if (detected) {
            void api.post(`/api/student/sessions/${sid}/proctor-events`, {
              event_type: "screenshot_tool_detected",
              metadata: { info: "Screenshot utility running in background" },
            });
            pushToast("error", "Обнаружена запущенная утилита скриншотов!");
            void captureSnapshot();
          }
        } catch (err) {
          console.error("detectScreenshotTools error:", err);
        }
      }, 10000);

      return () => {
        void tauriCommands.setAntiScreenshot(false).catch(console.error);
        if (unlistenLost) unlistenLost();
        clearInterval(linuxCheckInterval);
      };
    }
  }, [proctorLevel, started, sid, cameraStream]);

  // Stream re-attach to video elements
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, isFullscreen, hasCameraPermission]);


  const allAnswersPayload = useMemo(() => {
    const payload: AnswerIn[] = [];
    for (const [qid, oid] of Object.entries(answers)) {
      if (oid != null) payload.push({ question_id: Number(qid), chosen_option_id: oid as number });
    }
    for (const [qidStr, a] of Object.entries(answerExtras)) {
      const qid = Number(qidStr);
      if (a.kind === "multi") {
        if (a.optionIds.length > 0) payload.push({ question_id: qid, chosen_option_id: a.optionIds[0], match_answer: a.optionIds });
      } else if (a.kind === "short" && a.text.trim()) {
        payload.push({ question_id: qid, short_answer: a.text });
      } else if (a.kind === "numeric" && a.value != null) {
        payload.push({ question_id: qid, numeric_answer: a.value });
      } else if (a.kind === "match" && Object.keys(a.value).length > 0) {
        payload.push({ question_id: qid, match_answer: Object.entries(a.value).map(([left, right]) => ({ left, right })) });
      } else if (a.kind === "text" && a.text.trim()) {
        payload.push({ question_id: qid, text_answer: a.text });
      } else if (a.kind === "bool" && a.value != null) {
        payload.push({ question_id: qid, bool_answer: a.value });
      } else if (a.kind === "order" && a.optionIds.length > 0) {
        payload.push({ question_id: qid, order_answer: a.optionIds });
      } else if (a.kind === "cloze" && Object.values(a.values).some((x) => x?.trim())) {
        payload.push({ question_id: qid, cloze_answer: a.values });
      } else if (a.kind === "file_upload") {
        payload.push({ question_id: qid });
      }
    }
    return payload;
  }, [answerExtras, answers]);

  async function saveAnswersBatch(force = false) {
    if (!started) return;
    const serialized = JSON.stringify(allAnswersPayload);
    if (!force && serialized === lastSavedRef.current) return;
    const key = isPreview ? `sts-preview-pending` : `sts-pending-${sid}`;
    localStorage.setItem(key, serialized);
    lastLocalSnapshotRef.current = serialized;
    setSaveState("saving");
    if (isPreview) {
      lastSavedRef.current = serialized;
      setSaveState("saved");
      localStorage.removeItem(key);
      return;
    }
    try {
      await api.post(`/api/student/sessions/${sid}/answers`, { answers: allAnswersPayload });
      lastSavedRef.current = serialized;
      setSaveState("saved");
      localStorage.removeItem(key);
    } catch (e) {
      setSaveState("error");
      localStorage.setItem(key, serialized);
      throw e;
    }
  }

  const currentBrowserPath = () => window.location.pathname + window.location.search + window.location.hash;

  const navigateAfterLeavingTest = useCallback((to: string, fallbackReplace = false) => {
    const state = (window.history.state ?? {}) as TestGuardHistoryState;
    const currentIdx = typeof state.idx === "number" ? state.idx : null;
    const baseIdx = typeof state.stsTestBaseIdx === "number" ? state.stsTestBaseIdx : null;
    const hasTrap =
      state.stsTestGuard === "trap" &&
      state.stsTestSessionId === sid &&
      currentIdx != null &&
      baseIdx != null &&
      currentIdx > baseIdx;

    const targetUrl = new URL(to, window.location.origin);
    const targetPath = targetUrl.pathname + targetUrl.search + targetUrl.hash;
    const runNavigate = () => {
      if (currentBrowserPath() === targetPath) return;
      navigate(to);
    };

    if (hasTrap && baseIdx > 0) {
      let completed = false;
      let fallbackTimer: number | null = null;
      const finalize = () => {
        if (completed) return;
        completed = true;
        window.removeEventListener("popstate", finalize);
        if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
        runNavigate();
      };
      window.addEventListener("popstate", finalize);
      window.history.go(-2);
      fallbackTimer = window.setTimeout(finalize, 250);
      return;
    }

    navigate(to, { replace: fallbackReplace });
  }, [navigate, sid]);

  const requestLeave = useCallback((run: () => void) => {
    if (!started || allowLeaveRef.current) {
      run();
      return;
    }
    if (leavePromptRef.current) return;
    void saveAnswersBatch(true).catch(() => {});
    const prompt = { run };
    leavePromptRef.current = prompt;
    setLeavePrompt(prompt);
  }, [allAnswersPayload, sid, started]);

  const cancelLeave = useCallback(() => {
    leavePromptRef.current = null;
    setLeavePrompt(null);
  }, []);

  const confirmLeave = useCallback(async () => {
    const prompt = leavePromptRef.current;
    if (!prompt || leaveConfirming) return;
    setLeaveConfirming(true);
    try {
      allowLeaveRef.current = true;
      try {
        await saveAnswersBatch(true);
      } catch {
        // Autosave already keeps the latest local snapshot; explicit leave should still continue.
      }
      leavePromptRef.current = null;
      setLeavePrompt(null);
      window.setTimeout(prompt.run, 0);
    } finally {
      setLeaveConfirming(false);
    }
  }, [allAnswersPayload, leaveConfirming, sid, started]);

  useEffect(() => {
    if (!started) return;
    const serialized = JSON.stringify(allAnswersPayload);
    const key = isPreview ? `sts-preview-pending` : `sts-pending-${sid}`;
    if (serialized !== lastLocalSnapshotRef.current) {
      localStorage.setItem(key, serialized);
      lastLocalSnapshotRef.current = serialized;
    }
    if (serialized !== lastSavedRef.current) {
      setSaveState("saving");
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveAnswersBatch().catch(() => {});
    }, 500);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [allAnswersPayload, isPreview, sid, started]);

  useEffect(() => {
    const key = isPreview ? `sts-preview-pending` : `sts-pending-${sid}`;
    const pending = localStorage.getItem(key);
    if (pending) {
      lastLocalSnapshotRef.current = pending;
      if (pending !== lastSavedRef.current) setSaveState("pending");
    }
    const flush = async (keepalive = false) => {
      const currentPending = localStorage.getItem(key);
      if (currentPending == null) return;
      if (isPreview) {
        localStorage.removeItem(key);
        lastSavedRef.current = currentPending;
        lastLocalSnapshotRef.current = currentPending;
        setSaveState("saved");
        return;
      }
      try {
        setSaveState("saving");
        if (keepalive) {
          const token = getToken();
          const response = await fetch(`${API_URL}/api/student/sessions/${sid}/answers`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ answers: JSON.parse(currentPending) }),
            keepalive: true,
          });
          if (!response.ok) throw new Error(`autosave failed: ${response.status}`);
        } else {
          await api.post(`/api/student/sessions/${sid}/answers`, { answers: JSON.parse(currentPending) });
        }
        localStorage.removeItem(key);
        lastSavedRef.current = currentPending;
        lastLocalSnapshotRef.current = currentPending;
        setSaveState("saved");
      } catch {
        setSaveState("pending");
      }
    };
    void flush();
    const onOnline = () => void flush();
    const onPageHide = () => void flush(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sid]);

  useEffect(() => {
    if (!started || allowLeaveRef.current) return;

    const installGuardTrap = () => {
      const state = (window.history.state ?? {}) as TestGuardHistoryState;
      if (state.stsTestGuard === "trap" && state.stsTestSessionId === sid) return;

      const baseIdx =
        typeof state.stsTestBaseIdx === "number"
          ? state.stsTestBaseIdx
          : typeof state.idx === "number"
            ? state.idx
            : 0;
      const baseState: TestGuardHistoryState = {
        ...state,
        idx: baseIdx,
        stsTestGuard: "base",
        stsTestSessionId: sid,
        stsTestBaseIdx: baseIdx,
      };
      window.history.replaceState(baseState, "", window.location.href);
      window.history.pushState(
        {
          ...baseState,
          idx: baseIdx + 1,
          stsTestGuard: "trap",
        },
        "",
        window.location.href,
      );
    };

    installGuardTrap();

    const onPopState = () => {
      if (!started || allowLeaveRef.current) return;
      const state = (window.history.state ?? {}) as TestGuardHistoryState;
      const baseIdx =
        typeof state.stsTestBaseIdx === "number"
          ? state.stsTestBaseIdx
          : typeof state.idx === "number"
            ? state.idx
            : 0;
      window.history.pushState(
        {
          ...state,
          idx: baseIdx + 1,
          stsTestGuard: "trap",
          stsTestSessionId: sid,
          stsTestBaseIdx: baseIdx,
        },
        "",
        window.location.href,
      );
      requestLeave(() => {
        if (baseIdx > 0) {
          window.history.go(-2);
        } else {
          navigate("/student", { replace: true });
        }
      });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate, requestLeave, sid, started]);

  useEffect(() => {
    if (!started) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (
        allowLeaveRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor) {
        const anchorTarget = anchor.getAttribute("target");
        if (anchorTarget && anchorTarget !== "_self") return;
        if (anchor.hasAttribute("download")) return;

        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        const nextPath = url.pathname + url.search + url.hash;
        if (nextPath === currentBrowserPath()) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        requestLeave(() => navigateAfterLeavingTest(nextPath));
        return;
      }

      const menuButton = target.closest<HTMLButtonElement>('button[role="menuitem"]');
      if (menuButton?.textContent?.trim().includes("Выйти")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        requestLeave(() => window.setTimeout(() => menuButton.click(), 0));
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [navigateAfterLeavingTest, requestLeave, started]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!started || allowLeaveRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [started]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (isInput) return;

      if (e.key === "ArrowRight" && currentIndex < (started?.questions.length ?? 0) - 1) goNext();
      if (e.key === "ArrowLeft" && currentIndex > 0) goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, goNext, goPrev, started?.questions.length]);

  const finish = useMutation({
    mutationFn: async () => {
      await saveAnswersBatch(true);
      if (isPreview) {
        const payload = {
          topic_id: previewTopicId,
          discipline_id: previewDisciplineId,
          question_ids: started?.questions.map((q) => q.question_id) ?? [],
          answers: allAnswersPayload,
        };
        const res = await api.post<any>("/api/v2/teacher/test/preview-grade", payload);
        sessionStorage.setItem("preview-results", JSON.stringify(res.data));
        return res.data;
      } else {
        const res = await api.post<FinishOut>(`/api/student/sessions/${sid}/finish`);
        return res.data;
      }
    },
    onSuccess: async (data) => {
      const hasFileUpload = started?.questions.some((q) => (q.qmeta?.qtype ?? q.qtype) === "file_upload");
      if (hasFileUpload) {
        pushToast("success", "Тест завершён. Файловые ответы отправлены преподавателю на проверку.");
      } else {
        pushToast("success", "Тест завершён");
      }
      if (isPreview) {
        allowLeaveRef.current = true;
        navigate("/student/results/-1?preview=true", { replace: true });
      } else {
        await qc.invalidateQueries({ queryKey: ["student", "sessions"] });
        await qc.invalidateQueries({ queryKey: ["student", "disciplines"] });
        await qc.invalidateQueries({ queryKey: ["student", "dashboard"] });
        allowLeaveRef.current = true;
        navigateAfterLeavingTest(`/student/results/${sid}`, true);
      }
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  async function doFinish() {

    if (submitting) return;
    setSubmitting(true);
    try {
      await finish.mutateAsync();
    } finally {
      setSubmitting(false);
      setFinishOpen(false);
    }
  }

  if (resume.isLoading || (!started && !resume.isError)) {
    return (
      <AppShell>
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <Card className="text-center py-12">
            <div className="text-sm text-[var(--color-text-muted)]">Загрузка теста…</div>
          </Card>
        </section>
      </AppShell>
    );
  }
  if (resume.isError) {
    return (
      <AppShell>
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <Card className="text-center py-12">
            <div className="text-sm text-[var(--color-danger)] mb-4">{errorMessage(resume.error)}</div>
            <Button variant="secondary" onClick={() => navigate("/student")}>К дисциплинам</Button>
          </Card>
        </section>
      </AppShell>
    );
  }
  if (!started) {
    return (
      <AppShell>
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <Card className="text-center py-12">
            <div className="text-sm text-[var(--color-text-muted)]">Загрузка…</div>
          </Card>
        </section>
      </AppShell>
    );
  }

  const leaveConfirmModal = (
    <ConfirmModal
      open={!!leavePrompt}
      onClose={cancelLeave}
      title="Покинуть тест?"
      description="Попытка останется незавершённой. Последние ответы будут сохранены как черновик, но таймер теста продолжит идти."
      confirmLabel="Покинуть тест"
      cancelLabel="Остаться"
      tone="danger"
      loading={leaveConfirming}
      onConfirm={confirmLeave}
    />
  );

  const showBlockingOverlay = proctorLevel >= 2 && (!isFullscreen || !hasCameraPermission);

  if (started && showBlockingOverlay) {
    return (
      <AppShell>
        <section className="max-w-md mx-auto px-4 py-16">
          <Card className="p-8 text-center flex flex-col items-center gap-6 shadow-xl border border-[var(--color-border)]">
            <div className="w-16 h-16 rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center text-[var(--color-warning)] animate-pulse">
              <Flag className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Подготовка к прокторингу</h2>
              <p className="text-sm text-[var(--color-text-muted)] text-center">
                Этот тест защищен системой прокторинга. Для прохождения необходимо выдать доступ к веб-камере и запустить полноэкранный режим.
              </p>
            </div>
            <div className="w-full space-y-3">
              {!hasCameraPermission && (
                <Button variant="primary" className="w-full" onClick={startCamera} loading={cameraLoading}>
                  Предоставить доступ к камере
                </Button>
              )}
              {hasCameraPermission && !isFullscreen && (
                <Button variant="primary" className="w-full" onClick={enterFullscreen}>
                  Войти в полноэкранный режим
                </Button>
              )}
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => requestLeave(() => navigateAfterLeavingTest("/student", true))}
              >
                Вернуться в панель
              </Button>
            </div>
          </Card>
        </section>
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
        {leaveConfirmModal}
      </AppShell>
    );
  }


  const total = started.questions.length;
  const q = started.questions[currentIndex];
  const qtype = q.qmeta?.qtype ?? q.qtype ?? "single";
  const answeredCount =
    Object.keys(answers).length +
    Object.entries(answerExtras).filter(([, v]) => {
      switch (v.kind) {
        case "multi": return v.optionIds.length > 0;
        case "short": return v.text.trim().length > 0;
        case "numeric": return v.value != null;
        case "match": return Object.keys(v.value).length > 0;
        case "text": return v.text.trim().length > 0;
        case "bool": return v.value != null;
        case "order": return v.optionIds.length > 0;
        case "cloze": return Object.values(v.values).some((x) => !!x && x.trim().length > 0);
        case "file_upload": return v.uploadIds.length > 0;
        default: return false;
      }
    }).length;
  const unansweredCount = Math.max(0, total - answeredCount);
  const unansweredFileUploadCount = started
    ? started.questions.filter((fq) => {
        const fqtype = fq.qmeta?.qtype ?? fq.qtype;
        if (fqtype !== "file_upload") return false;
        const extra = answerExtras[fq.question_id];
        return !(extra?.kind === "file_upload" && extra.uploadIds.length > 0);
      }).length
    : 0;
  const currentAnswered = !!questionMapItems[currentIndex]?.answered;
  const currentFlagged = !!flagged[q.question_id];
  const progressPercent = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;

  function toggleFlag(questionId: number) {
    setFlagged((s) => ({ ...s, [questionId]: !s[questionId] }));
  }

  if (view === "review") {
    return (
      <AppShell
        rightSlot={
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <TimerIcon className="w-3.5 h-3.5" />
              {answeredCount}/{total}
            </span>
            <Timer expiresAtIso={started.expires_at} onExpire={() => doFinish()} />
          </div>
        }
      >
        <section className="no-copy max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-10 pb-28 sm:pb-10">
          <div className="md:hidden sticky top-14 z-30 -mx-4 mb-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur px-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium tabular-nums">Проверка {answeredCount}/{total}</span>
              <Timer expiresAtIso={started.expires_at} onExpire={() => doFinish()} size="sm" />
            </div>
          </div>
          <AttemptReviewPage
            disciplineTitle={resume.data?.topic_metadata?.discipline_title ?? started?.topic_metadata?.discipline_title ?? "Дисциплина"}
            topicTitle={resume.data?.topic_metadata?.topic_title ?? started?.topic_metadata?.topic_title ?? "Тема"}
            currentAttempt={started?.topic_metadata?.current_attempt}
            maxAttempts={started?.topic_metadata?.max_attempts}
            questions={started.questions}
            answers={answers}
            answerExtras={answerExtras}
            onJumpToQuestion={(idx) => {
              goTo(idx);
              setView("testing");
            }}
            onBackToTest={() => setView("testing")}
            onFinishTest={() => setFinishOpen(true)}
            expiresAtIso={started.expires_at}
            onTimeExpire={() => doFinish()}
          />
        </section>

        <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur px-3 pt-2 safe-bottom flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("testing")}
            className="btn btn-secondary btn-touch h-12 px-3"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад
          </button>
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            disabled={submitting}
            className="btn btn-primary btn-touch h-12 flex-1 bg-red-600 hover:bg-red-700 text-white text-base"
          >
            Отправить
          </button>
        </nav>

        {proctorLevel >= 2 && cameraStream && !showBlockingOverlay && (
          <div className="fixed bottom-4 right-4 z-50 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/90 backdrop-blur shadow-2xl w-36 h-28 flex flex-col pointer-events-none">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-20 object-cover bg-black"
            />
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                REC
              </span>
              <span>Прокторинг</span>
            </div>
          </div>
        )}

        <ConfirmModal
          open={finishOpen}
          onClose={() => setFinishOpen(false)}
          title="Подтверждение завершения"
          description={
            <span>
              После отправки изменить ответы будет невозможно.{" "}
              {unansweredCount > 0 && (
                <>Вы не ответили на {pluralizeRu(unansweredCount, "вопрос", "вопроса", "вопросов")}. </>
              )}
              {unansweredFileUploadCount > 0 && (
                <span className="text-[var(--color-warning)] font-medium">
                  Внимание: {pluralizeRu(unansweredFileUploadCount, "файловый вопрос", "файловых вопроса", "файловых вопросов")} без загруженных файлов — преподаватель увидит пустой ответ.{" "}
                </span>
              )}
              {unansweredCount === 0 && unansweredFileUploadCount === 0 && "Все вопросы отвечены. "}
              Уверены, что хотите завершить тест?
            </span>
          }
          confirmLabel="Отправить всё и завершить"
          cancelLabel="Отмена"
          tone="danger"
          loading={submitting}
          onConfirm={doFinish}
        />
        {leaveConfirmModal}
      </AppShell>
    );
  }

  return (
    <AppShell
      rightSlot={
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <TimerIcon className="w-3.5 h-3.5" />
            {answeredCount}/{total}
          </span>
          <SaveIndicator state={saveState} />
          <Timer expiresAtIso={started.expires_at} onExpire={() => doFinish()} />
        </div>
      }
    >
      <section className="no-copy max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-10 pb-32 sm:pb-10">
        <div className="md:hidden sticky top-14 z-30 -mx-3 mb-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="btn btn-secondary h-9 px-2.5"
              aria-label="Открыть карту вопросов"
            >
              <ListTodo className="w-4 h-4" />
              <span className="tabular-nums">{currentIndex + 1}/{total}</span>
            </button>
            <SaveIndicator state={saveState} />
            <Timer expiresAtIso={started.expires_at} onExpire={() => doFinish()} size="sm" />
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <TestHeader
          disciplineTitle={resume.data?.topic_metadata?.discipline_title ?? started?.topic_metadata?.discipline_title ?? "Дисциплина"}
          topicTitle={resume.data?.topic_metadata?.topic_title ?? started?.topic_metadata?.topic_title ?? "Тема"}
          currentAttempt={started?.topic_metadata?.current_attempt}
          maxAttempts={started?.topic_metadata?.max_attempts}
          currentIndex={currentIndex}
          total={total}
          answered={answeredCount}
          points={q.points}
          showPoints={started?.topic_metadata?.show_question_points !== false}
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <div
              onTouchStart={(e) => { touchStartRef.current = e.changedTouches[0]?.clientX ?? null; }}
              onTouchEnd={(e) => {
                const startX = touchStartRef.current;
                const endX = e.changedTouches[0]?.clientX ?? null;
                if (startX == null || endX == null) return;
                const dx = endX - startX;
                if (dx <= -40 && currentIndex < total - 1) goNext();
                if (dx >= 40 && currentIndex > 0) goPrev();
              }}
            >
              {qtype === "single" && (
                <QuestionCard
                  question={{ ...q, options: q.options }}
                  selectedOptionId={answers[q.question_id] ?? null}
                  onSelect={(oid) => setAnswer(q.question_id, oid)}
                />
              )}
              {qtype === "multi" && (
                <MultiCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  options={q.options}
                  selected={
                    answerExtras[q.question_id]?.kind === "multi"
                      ? (answerExtras[q.question_id] as { optionIds: number[] }).optionIds
                      : []
                  }
                  onSelect={(ids) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "multi", optionIds: ids } }))
                  }
                />
              )}
              {qtype === "short" && (
                <ShortAnswerCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  pattern={q.qmeta?.short_pattern ?? null}
                  value={
                    answerExtras[q.question_id]?.kind === "short"
                      ? (answerExtras[q.question_id] as { text: string }).text
                      : ""
                  }
                  onChange={(v) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "short", text: v } }))
                  }
                />
              )}
              {qtype === "numeric" && (
                <NumericCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  tolerance={q.qmeta?.numeric_tolerance ?? null}
                  value={
                    answerExtras[q.question_id]?.kind === "numeric"
                      ? (answerExtras[q.question_id] as { value: number | null }).value
                      : null
                  }
                  onChange={(v) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "numeric", value: v } }))
                  }
                />
              )}
              {qtype === "match" && (
                <MatchCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  pairs={(q.qmeta?.match_pairs ?? []) as Array<{ left: string; right: string }>}
                  value={
                    answerExtras[q.question_id]?.kind === "match"
                      ? (answerExtras[q.question_id] as { value: Record<string, string> }).value
                      : {}
                  }
                  onChange={(v) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "match", value: v } }))
                  }
                />
              )}
              {qtype === "text" && (
                <TextCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  mode={(q.qmeta?.text_mode as "string" | "number" | undefined) ?? "string"}
                  value={
                    answerExtras[q.question_id]?.kind === "text"
                      ? (answerExtras[q.question_id] as { text: string }).text
                      : ""
                  }
                  onChange={(v) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "text", text: v } }))
                  }
                />
              )}
              {qtype === "bool" && (
                <BoolCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  value={
                    answerExtras[q.question_id]?.kind === "bool"
                      ? (answerExtras[q.question_id] as { value: boolean | null }).value
                      : null
                  }
                  onChange={(v) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "bool", value: v } }))
                  }
                />
              )}
              {qtype === "order" && (
                <OrderCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  order={
                    answerExtras[q.question_id]?.kind === "order"
                      ? (answerExtras[q.question_id] as { optionIds: number[] }).optionIds
                      : []
                  }
                  options={(() => {
                    const meta = (q.qmeta?.options_meta ?? []) as Array<{
                      option_id: number;
                      text: string;
                      correct_position: number | null;
                      is_correct: boolean;
                    }>;
                    return meta.map((o) => ({
                      option_id: o.option_id,
                      text: o.text,
                      correct_position: o.correct_position,
                    }));
                  })()}
                  onChange={(next) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "order", optionIds: next } }))
                  }
                />
              )}
              {qtype === "cloze" && (
                <ClozeCard
                  questionId={q.question_id}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  blanks={(((q.qmeta?.cloze_blanks ?? []) as Array<{
                    index: number;
                    kind: "select" | "input";
                    options: string[] | null;
                  }>))}
                  values={
                    answerExtras[q.question_id]?.kind === "cloze"
                      ? (answerExtras[q.question_id] as { values: Record<string, string> }).values
                      : {}
                  }
                  onChange={(v) =>
                    setAnswerExtras((s) => ({ ...s, [q.question_id]: { kind: "cloze", values: v } }))
                  }
                />
              )}
              {qtype === "file_upload" && (
                <FileUploadCard
                  questionId={q.question_id}
                  sessionId={sid}
                  text={q.question_text}
                  imageUrl={q.image_url}
                  allowedTypes={q.qmeta?.file_allowed_types ?? null}
                  maxSizeBytes={q.qmeta?.file_max_size_bytes ?? 10485760}
                  maxCount={q.qmeta?.file_max_count ?? 1}
                  uploads={uploadState[q.question_id] ?? []}
                  onUploadsChange={(newUploads) => {
                    setUploadState((prev) => ({ ...prev, [q.question_id]: newUploads }));
                    setAnswerExtras((s) => ({
                      ...s,
                      [q.question_id]: { kind: "file_upload", uploadIds: newUploads.map((u) => u.upload_id) },
                    }));
                  }}
                  disabled={submitting}
                />
              )}
            </div>

            <div className="hidden md:flex justify-between gap-2 mt-6">
              <Button variant="ghost" iconLeft={<ArrowLeft className="w-4 h-4" />} onClick={goPrev} disabled={currentIndex === 0}>
                Назад
              </Button>
              <Button variant="ghost" iconLeft={<Flag className="w-4 h-4" />} onClick={() => toggleFlag(q.question_id)}>
                {flagged[q.question_id] ? "Снять флаг" : "Пометить"}
              </Button>
              {currentIndex < total - 1 ? (
                <Button variant="primary" iconRight={<ArrowRight className="w-4 h-4" />} onClick={goNext}>
                  Далее
                </Button>
              ) : (
                <Button
                  variant="primary"
                  loading={submitting}
                  iconLeft={<CheckCircle2 className="w-4 h-4" />}
                  onClick={() => setView("review")}
                  className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)]"
                >
                  Закончить попытку
                </Button>
              )}
            </div>
          </div>
          <div className="hidden lg:block space-y-4 sticky top-20 h-fit">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ListTodo className="w-4 h-4 text-[var(--color-accent)]" />
                <div className="font-medium">Карта вопросов</div>
              </div>
              <QuestionMap
                items={questionMapItems}
                currentIndex={currentIndex}
                onJump={goTo}
                showLegend={true}
              />
            </Card>
            <Button
              variant="secondary"
              className="w-full bg-red-500/10 border-red-500/20 text-[var(--color-danger)] hover:bg-red-500/20 font-semibold py-2.5"
              onClick={() => setView("review")}
              iconLeft={<Flag className="w-4 h-4" />}
            >
              Закончить попытку
            </Button>
          </div>
        </div>
      </section>

      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur px-3 pt-2 safe-bottom flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="btn btn-secondary btn-touch h-12 w-12 p-0 disabled:opacity-30"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => toggleFlag(q.question_id)}
          aria-pressed={currentFlagged}
          className={[
            "btn btn-touch h-12 w-12 p-0",
            currentFlagged
              ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/30"
              : "btn-secondary",
          ].join(" ")}
          aria-label={currentFlagged ? "Снять флаг" : "Пометить вопрос"}
        >
          <Flag className="w-5 h-5" />
        </button>
        {currentIndex < total - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="btn btn-primary btn-touch h-12 flex-1 text-base"
          >
            <span>{currentAnswered ? "Далее" : "Пропустить"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setView("review")}
            disabled={submitting}
            className="btn btn-primary btn-touch h-12 flex-1 bg-red-600 hover:bg-red-700 text-white text-base"
          >
            Закончить попытку
          </button>
        )}
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="btn btn-secondary btn-touch h-12 w-12 p-0"
          aria-label="Карта вопросов"
        >
          <ListTodo className="w-5 h-5" />
        </button>
      </nav>
      {mapOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Закрыть карту вопросов"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMapOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-xl border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 safe-bottom shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="font-semibold text-base">Карта вопросов</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Отвечено {answeredCount} из {total}</div>
              </div>
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="btn btn-ghost h-10 w-10 p-0"
                aria-label="Закрыть карту"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <QuestionMap
              items={questionMapItems}
              currentIndex={currentIndex}
              onJump={(idx) => { goTo(idx); setMapOpen(false); }}
              showLegend={true}
              size="lg"
            />
            <Button
              variant="secondary"
              className="w-full mt-4 bg-red-500/10 border-red-500/20 text-[var(--color-danger)] hover:bg-red-500/20 font-semibold"
              onClick={() => { setView("review"); setMapOpen(false); }}
              iconLeft={<Flag className="w-4 h-4" />}
            >
              Закончить попытку
            </Button>
          </div>
        </div>
      )}
      {proctorLevel >= 2 && cameraStream && !showBlockingOverlay && (
        <div className="fixed bottom-4 right-4 z-50 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/90 backdrop-blur shadow-2xl w-36 h-28 flex flex-col pointer-events-none">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-20 object-cover bg-black"
          />
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
            <span>Прокторинг</span>
          </div>
        </div>
      )}
      {leaveConfirmModal}
    </AppShell>
  );

}


function qtypeLabel(t: string) {
  // Полный список поддерживаемых русских лейблов в QUESTION_TYPE_LABELS,
  // здесь — резервная функция для случаев, когда лейбл приходит извне (например, из query-параметра).
  switch (t) {
    case "single": return "Один правильный";
    case "multi": return "Несколько правильных";
    case "short": return "Короткий ответ";
    case "numeric": return "Числовой ответ";
    case "match": return "Сопоставление пар";
    case "text": return "Слово / число";
    case "order": return "Расставить по порядку";
    case "bool": return "Верно / Неверно";
    case "cloze": return "Пропущенное слово";
    default: return t;
  }
}
