import { test, expect } from "@playwright/test";

test.describe("Teacher Documentation Page E2E", () => {
  test("Logs in as teacher, visits /teacher/docs, and checks that sections render correctly", async ({ page }) => {
    // 1. Войти под преподавателем
    await page.goto("/login");
    await page.fill('input[type="text"]', "sidorov");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.click('button[type="submit"]');

    // Ожидаем перенаправления в справочники
    await page.waitForURL("/teacher/reference/disciplines");
    await expect(page.locator('h1:has-text("Справочники")')).toBeVisible();

    // 2. Перейти на страницу руководства преподавателя
    await page.goto("/teacher/docs");
    await page.waitForURL("/teacher/docs");

    // Проверяем основной заголовок
    await expect(page.locator('h1:has-text("Руководство преподавателя")')).toBeVisible();

    // Проверяем боковую панель (содержание)
    const toc = page.locator('aside nav');
    await expect(toc).toBeVisible();
    await expect(toc.locator('button:has-text("Введение и структура")')).toBeVisible();
    await expect(toc.locator('button:has-text("Банк вопросов и AI")')).toBeVisible();
    await expect(toc.locator('button:has-text("Сроки и дедлайны")')).toBeVisible();

    // Проверяем секции документации
    // Секция 1: Введение
    await expect(page.locator('h2:has-text("1. Введение и структура кабинета")')).toBeVisible();
    await expect(page.locator('strong:has-text("Справочники")')).toBeVisible();

    // Секция 3: Банк вопросов и AI
    await expect(page.locator('h2:has-text("3. Банк вопросов и ИИ-Ассистент")')).toBeVisible();
    await expect(page.locator('span:has-text("Генерация дистракторов")')).toBeVisible();

    // Секция 4: Сроки и дедлайны
    await expect(page.locator('h2:has-text("4. Настройка сроков и дедлайнов")')).toBeVisible();
    await expect(page.locator('strong:has-text("Мягкий дедлайн (Soft Deadline)")')).toBeVisible();

    // 3. Проверить сворачивание/разворачивание секций
    const section1Header = page.locator('button:has-text("1. Введение и структура кабинета")');
    const section1Content = page.locator('p:has-text("Личный кабинет преподавателя в системе")');

    // По умолчанию развернута
    await expect(section1Content).toBeVisible();

    // Сворачиваем кликом
    await section1Header.click();
    await expect(section1Content).not.toBeVisible();

    // Разворачиваем кликом
    await section1Header.click();
    await expect(section1Content).toBeVisible();
  });
});
