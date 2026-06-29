import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../api/client";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Feedback";
import type { SessionRecommendationsOut, RecommendationTopicOut } from "../../types/api";

interface RecommendationsCardProps {
  sessionId: number;
  showCorrectness: boolean;
  isPreview?: boolean;
}

function TopicProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function WeakTopicCard({ topic }: { topic: RecommendationTopicOut }) {
  const errorColor =
    topic.wrong_percent >= 75
      ? "bg-red-500"
      : topic.wrong_percent >= 50
      ? "bg-orange-400"
      : "bg-yellow-400";

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 hover:border-orange-300 dark:hover:border-orange-700 hover:shadow-sm transition-all">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="font-medium text-sm leading-snug">{topic.topic_name}</div>
          <Badge tone="danger" className="text-xs shrink-0">
            {topic.wrong_questions_count}/{topic.total_questions_count} ошибок
          </Badge>
        </div>
        {topic.description && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">{topic.description}</p>
        )}
        <TopicProgressBar percent={topic.wrong_percent} color={errorColor} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">
            {topic.wrong_percent}% неверных ответов
          </span>
          {topic.has_active_test && topic.topic_link && (
            <Link
              to={topic.topic_link}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
            >
              Повторить <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function RelatedTopicCard({ topic }: { topic: RecommendationTopicOut }) {
  const isNew = topic.reason === "not_started";
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all">
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          isNew
            ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
            : "bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400"
        }`}
      >
        {isNew ? <BookOpen className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="font-medium text-sm leading-snug">{topic.topic_name}</div>
          <Badge tone={isNew ? "info" : "neutral"} className="text-xs shrink-0">
            {isNew ? "Новая тема" : "Повторить"}
          </Badge>
        </div>
        {topic.description && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">{topic.description}</p>
        )}
        {topic.topic_link && (
          <div className="mt-2">
            <Link
              to={topic.topic_link}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Перейти к теме <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function RecommendationsCard({ sessionId, showCorrectness, isPreview }: RecommendationsCardProps) {
  const [hintsExpanded, setHintsExpanded] = useState(false);

  const q = useQuery<SessionRecommendationsOut>({
    queryKey: ["student", "session-recommendations", sessionId],
    queryFn: () => api.get(`/api/student/sessions/${sessionId}/recommendations`).then((r) => r.data),
    enabled: !isPreview && Number.isFinite(sessionId),
    staleTime: 5 * 60 * 1000,
  });

  if (isPreview || !Number.isFinite(sessionId)) return null;

  if (q.isLoading) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </Card>
    );
  }

  if (q.isError || !q.data) return null;

  const data = q.data;
  const hasWeakTopics = data.weak_topics.length > 0;
  const hasRelated = data.related_topics.length > 0;
  const hasHints = data.review_hints.length > 0;

  // If no recommendations at all and all correct — show brief message
  if (!hasWeakTopics && !hasRelated && !hasHints) {
    return (
      <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 py-4 px-5">
        <div className="flex gap-2.5 items-start">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
              Рекомендации по обучению
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{data.summary_message}</p>
          </div>
        </div>
      </Card>
    );
  }

  // Score summary chip
  const scoreChipTone =
    data.is_passed === true
      ? "success"
      : data.is_passed === false
      ? "danger"
      : data.score_percent != null && data.score_percent >= 60
      ? "warning"
      : "neutral";

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="font-semibold leading-tight">Рекомендации по обучению</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              На основе ваших ответов в этой сессии
            </p>
          </div>
        </div>
        {data.score_percent != null && (
          <Badge tone={scoreChipTone} className="text-sm font-semibold px-3 py-1">
            {data.score_percent}%
            {data.is_passed === true && " · сдано"}
            {data.is_passed === false && " · не сдано"}
          </Badge>
        )}
      </div>

      {/* Summary message */}
      <div className="py-3 px-0">
        <div className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
          <Target className="h-4 w-4 mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
          <span>{data.summary_message}</span>
        </div>
      </div>

      {/* Weak topics */}
      {hasWeakTopics && (
        <div className="mt-2">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold">
              Темы с ошибками{" "}
              <span className="font-normal text-[var(--color-text-muted)]">
                ({data.weak_topics.length})
              </span>
            </h3>
          </div>
          <div className="space-y-2">
            {data.weak_topics.map((topic) => (
              <WeakTopicCard key={topic.topic_id} topic={topic} />
            ))}
          </div>
        </div>
      )}

      {/* Related topics */}
      {hasRelated && (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold">
              Рекомендуем изучить{" "}
              <span className="font-normal text-[var(--color-text-muted)]">
                ({data.related_topics.length})
              </span>
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.related_topics.map((topic) => (
              <RelatedTopicCard key={topic.topic_id} topic={topic} />
            ))}
          </div>
        </div>
      )}

      {/* Review hints (expandable) */}
      {hasHints && showCorrectness && (
        <div className="mt-5 rounded-xl border border-[var(--color-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setHintsExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-[var(--color-bg-muted)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span>Вопросы для повторения ({data.review_hints.length})</span>
            </div>
            {hintsExpanded ? (
              <ChevronUp className="h-4 w-4 text-[var(--color-text-muted)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
            )}
          </button>
          {hintsExpanded && (
            <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {data.review_hints.map((hint, i) => (
                <div key={i} className="px-4 py-2.5 text-sm text-[var(--color-text-muted)]">
                  <span className="mr-2 font-medium text-[var(--color-text-primary)]">{i + 1}.</span>
                  {hint}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
