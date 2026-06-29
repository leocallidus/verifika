import { BookOpen, Calendar, HelpCircle, Clock, AlertTriangle, RefreshCw, BarChart2, Play } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatGrade } from "../../utils/grade";
import type { StudentTopicDetailOut } from "../../types/api";

interface TestStartConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  topic: StudentTopicDetailOut;
  disciplineTitle: string;
  currentAttempt: number;
  loading: boolean;
}

export function TestStartConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  topic,
  disciplineTitle,
  currentAttempt,
  loading,
}: TestStartConfirmModalProps) {
  const timeLimit = topic.time_limit_minutes;
  const attemptsAllowed = topic.attempts_allowed;
  const passingScore = topic.passing_score_percent;

  const fmtDate = (dt: string | null) => {
    return dt ? new Date(dt).toLocaleString("ru-RU") : "—";
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Подтверждение начала теста"
      size="md"
    >
      <div className="space-y-4">
        {/* Discipline and Topic */}
        <div className="rounded-lg bg-[var(--color-bg-muted)] p-3.5 space-y-1">
          <div className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wider">
            Дисциплина
          </div>
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
            {disciplineTitle}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wider mt-2.5">
            Тема
          </div>
          <div className="text-sm font-semibold text-[var(--color-accent)]">
            {topic.name}
          </div>
        </div>

        {/* Test specifications */}
        <div className="border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)] text-sm">
          <div className="flex justify-between p-3">
            <span className="text-[var(--color-text-muted)] flex items-center gap-2">
              <HelpCircle className="w-4 h-4" /> Количество вопросов
            </span>
            <span className="font-semibold">{topic.question_count}</span>
          </div>

          <div className="flex justify-between p-3">
            <span className="text-[var(--color-text-muted)] flex items-center gap-2">
              <Clock className="w-4 h-4" /> Ограничение по времени
            </span>
            <span className="font-semibold">
              {timeLimit && timeLimit > 0 ? `${timeLimit} минут` : "Без ограничения"}
            </span>
          </div>

          <div className="flex justify-between p-3">
            <span className="text-[var(--color-text-muted)] flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Попытка
            </span>
            <span className="font-semibold">
              {attemptsAllowed && attemptsAllowed > 0
                ? `${currentAttempt} из ${attemptsAllowed}`
                : `${currentAttempt} (без ограничений)`}
            </span>
          </div>

          <div className="flex justify-between p-3">
            <span className="text-[var(--color-text-muted)] flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Проходной балл
            </span>
            <span className="font-semibold">
              {passingScore && passingScore > 0 ? formatGrade(passingScore, topic.grade_scale).value : "Не задан"}
            </span>
          </div>

          <div className="flex justify-between p-3">
            <span className="text-[var(--color-text-muted)] flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Порядок вопросов
            </span>
            <span className="font-semibold">
              {topic.shuffle_questions ? "Случайный" : "По порядку"}
            </span>
          </div>

          <div className="flex justify-between p-3">
            <span className="text-[var(--color-text-muted)] flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Показ ответов
            </span>
            <span className={topic.show_correct_after_finish ? "font-semibold text-[var(--color-success)]" : "font-semibold"}>
              {topic.show_correct_after_finish ? "После завершения" : "Скрыт"}
            </span>
          </div>
        </div>

        {/* Warning notification */}
        <div className="rounded-lg bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 dark:border-red-500/30 p-3.5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--color-danger)] shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--color-danger)] leading-relaxed">
            <strong>Внимание:</strong> После подтверждения начала теста запустится таймер, который <strong>нельзя поставить на паузу</strong> или остановить. Убедитесь, что у вас стабильное подключение к Интернету.
          </div>
        </div>

        {/* Modal actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button
            type="button"
            loading={loading}
            onClick={onConfirm}
            className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)]"
            iconLeft={<Play className="w-4 h-4" />}
          >
            Начать тестирование
          </Button>
        </div>
      </div>
    </Modal>
  );
}
