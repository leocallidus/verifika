import { pluralRu } from "./plural-ru";

/**
 * tz-student-role-improvement.md §5.2 — форматирование баллов за вопрос.
 *
 *  formatPoints(1)   === "1 балл"
 *  formatPoints(2)   === "2 балла"
 *  formatPoints(5)   === "5 баллов"
 *  formatPoints(1.5) === "1.5 балла"
 */
export function formatPoints(points: number): string {
  const isInteger = Number.isInteger(points);
  const word = isInteger
    ? pluralRu(points, "балл", "балла", "баллов")
    : "балла";
  const value = isInteger ? String(points) : String(points).replace(".", ".");
  return `${value} ${word}`;
}
