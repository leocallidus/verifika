/**
 * Склонение русских существительных по числу.
 *
 *  pluralRu(1, "вопрос", "вопроса", "вопросов") === "вопрос"
 *  pluralRu(2, "вопрос", "вопроса", "вопросов") === "вопроса"
 *  pluralRu(5, "вопрос", "вопроса", "вопросов") === "вопросов"
 *  pluralRu(11, "вопрос", "вопроса", "вопросов") === "вопросов"
 *  pluralRu(21, "вопрос", "вопроса", "вопросов") === "вопрос"
 */
export function pluralRu(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  const lastOne = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (lastOne === 1) return one;
  if (lastOne >= 2 && lastOne <= 4) return few;
  return many;
}

export function pluralizeRu(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return `${n} ${pluralRu(n, one, few, many)}`;
}
