import { ChevronRight, GraduationCap, AlertTriangle, ArrowLeft, Send } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Timer } from "../Timer";
import type { TestStartQuestion } from "../../types/api";

interface AttemptReviewPageProps {
  disciplineTitle: string;
  topicTitle: string;
  currentAttempt?: number | null;
  maxAttempts?: number | null;
  questions: TestStartQuestion[];
  answers: Record<number, any>; // maps question.id to answer
  answerExtras: Record<number, any>;
  onJumpToQuestion: (index: number) => void;
  onBackToTest: () => void;
  onFinishTest: () => void;
  expiresAtIso: string;
  onTimeExpire: () => void;
}

export function isQuestionAnswered(
  q: TestStartQuestion,
  answers: Record<number, any>,
  answerExtras: Record<number, any>
): boolean {
  const qid = q.question_id;
  const qtype = q.qmeta?.qtype ?? q.qtype ?? "single";

  if (qtype === "single") {
    return answers[qid] != null;
  }

  const extra = answerExtras[qid];
  if (!extra) return false;

  switch (extra.kind) {
    case "multi":
      return Array.isArray(extra.optionIds) && extra.optionIds.length > 0;
    case "short":
      return typeof extra.text === "string" && extra.text.trim().length > 0;
    case "numeric":
      return extra.value != null && extra.value !== "";
    case "match":
      return extra.value != null && Object.keys(extra.value).length > 0;
    case "text":
      return typeof extra.text === "string" && extra.text.trim().length > 0;
    case "bool":
      return extra.value != null;
    case "order":
      return Array.isArray(extra.optionIds) && extra.optionIds.length > 0;
    case "cloze":
      return (
        extra.values != null &&
        Object.values(extra.values).some((x) => typeof x === "string" && x.trim().length > 0)
      );
    case "file_upload":
      return Array.isArray(extra.uploadIds) && extra.uploadIds.length > 0;
    default:
      return false;
  }
}

export function formatPoints(pts: number | undefined): string {
  const points = pts ?? 1;
  if (points === 1) return "1 балл";
  if (points > 1 && points < 5) return `${points} балла`;
  return `${points} баллов`;
}

export function AttemptReviewPage({
  disciplineTitle,
  topicTitle,
  currentAttempt,
  maxAttempts,
  questions,
  answers,
  answerExtras,
  onJumpToQuestion,
  onBackToTest,
  onFinishTest,
  expiresAtIso,
  onTimeExpire,
}: AttemptReviewPageProps) {
  const total = questions.length;
  const answeredCount = questions.filter((q) => isQuestionAnswered(q, answers, answerExtras)).length;
  const unansweredCount = total - answeredCount;

  // List of unanswered question numbers (1-indexed)
  const unansweredNumbers = questions
    .map((q, idx) => (isQuestionAnswered(q, answers, answerExtras) ? null : idx + 1))
    .filter((n): n is number => n !== null);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
              <GraduationCap className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
              <span>{disciplineTitle}</span>
              <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              <span className="text-[var(--color-text-muted)]">{topicTitle}</span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {currentAttempt != null && (
                <span>
                  Попытка {currentAttempt}
                  {maxAttempts && maxAttempts > 0 ? ` из ${maxAttempts}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)]">Оставшееся время:</span>
            <Timer expiresAtIso={expiresAtIso} onExpire={onTimeExpire} />
          </div>
        </div>
      </div>

      {/* Summary Alert */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col justify-between p-5 border-l-4 border-l-[var(--color-success)]">
          <div>
            <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Отвечено вопросов
            </div>
            <div className="mt-2 text-3xl font-extrabold text-[var(--color-success)]">
              {answeredCount} <span className="text-lg font-medium text-[var(--color-text-muted)]">из {total}</span>
            </div>
          </div>
        </Card>

        {unansweredCount > 0 ? (
          <Card className="flex flex-col justify-between p-5 border-l-4 border-l-[var(--color-warning)] bg-[var(--color-warning)]/5">
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Осталось ответить
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[var(--color-warning)]">
                {unansweredCount}
              </div>
              <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                Не отвечено на вопросы №: {unansweredNumbers.join(", ")}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col justify-between p-5 border-l-4 border-l-[var(--color-success)] bg-green-500/5">
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Статус ответов
              </div>
              <div className="mt-3 text-sm font-semibold text-[var(--color-success)]">
                Все вопросы отвечены!
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                Вы готовы к отправке результатов.
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Table of questions */}
      <Card className="overflow-hidden p-0 border border-[var(--color-border)]">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex justify-between items-center">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Список вопросов</h3>
          <span className="text-xs text-[var(--color-text-muted)]">Кликните на строку, чтобы перейти к вопросу</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-xs text-[var(--color-text-muted)] font-medium uppercase">
                <th className="py-3 px-4 w-12 text-center">№</th>
                <th className="py-3 px-4">Вопрос</th>
                <th className="py-3 px-4 w-32">Баллы</th>
                <th className="py-3 px-4 w-28 text-center">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {questions.map((q, idx) => {
                const isAnswered = isQuestionAnswered(q, answers, answerExtras);
                return (
                  <tr
                    key={q.question_id}
                    onClick={() => onJumpToQuestion(idx)}
                    className="hover:bg-[var(--color-bg-muted)]/50 cursor-pointer transition text-sm"
                  >
                    <td className="py-3 px-4 text-center font-medium text-[var(--color-text-muted)]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium max-w-md truncate">
                      {q.question_text}
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)]">
                      {formatPoints(q.points)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isAnswered ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)] bg-green-500/10 px-2 py-0.5 rounded-full">
                          Отвечен
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-warning)] bg-yellow-500/10 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Нет ответа
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t border-[var(--color-border)]">
        <Button
          type="button"
          variant="secondary"
          iconLeft={<ArrowLeft className="w-4 h-4" />}
          onClick={onBackToTest}
        >
          Вернуться к попытке
        </Button>
        <Button
          type="button"
          variant="primary"
          iconLeft={<Send className="w-4 h-4" />}
          onClick={onFinishTest}
          className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)]"
        >
          Отправить всё и завершить
        </Button>
      </div>
    </div>
  );
}
