import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardOut, DashboardPoint } from "../types/api";

export function ScoreLineChart({ data }: { data: DashboardOut }) {
  const data2 = useMemo(
    () => data.series.map((p: DashboardPoint) => ({ date: p.date, "Средний %": p.avg_score, Попыток: p.attempts_count })),
    [data.series],
  );
  return (
    <div className="card">
      <h3 className="text-base font-semibold mb-2">Динамика среднего балла</h3>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data2}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Средний %" stroke="#4F46E5" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function QuestionHardnessChart({ items }: { items: DashboardOut["items"] }) {
  const top = [...items].slice(0, 8);
  return (
    <div className="card">
      <h3 className="text-base font-semibold mb-2">Топ-{top.length} сложных вопросов</h3>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={top} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} />
            <YAxis dataKey="question_text" type="category" width={150} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="correct_pct" name="% верных" fill="#DC2626" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AttemptsColumnChart({ data }: { data: DashboardOut }) {
  const data2 = useMemo(
    () => data.series.map((p: DashboardPoint) => ({ date: p.date, Попыток: p.attempts_count })),
    [data.series],
  );
  return (
    <div className="card">
      <h3 className="text-base font-semibold mb-2">Попытки по дням</h3>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data2}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="Попыток" fill="#10B981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
