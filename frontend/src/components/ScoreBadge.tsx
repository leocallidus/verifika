import { Badge } from "./ui/Badge";
import { Check, X } from "lucide-react";

export function ScoreBadge({ score, max }: { score: number; max: number }) {
  if (max <= 0) return <Badge tone="neutral">—</Badge>;
  const pct = (score / max) * 100;
  const tone = pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger";
  const Icon = pct >= 80 ? Check : X;
  return (
    <Badge tone={tone} className="gap-1 font-mono">
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {score}/{max}
      <span className="opacity-60">·</span>
      {pct.toFixed(0)}%
    </Badge>
  );
}
