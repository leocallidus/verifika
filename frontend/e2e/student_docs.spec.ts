import { test, expect } from "@playwright/test";

test.describe("Student Documentation Page E2E", () => {
  test("Logs in as student, visits /student/docs, and checks that sections render correctly", async ({ page }) => {
    // 1. Войти под студентом
    await page.goto("/login");
    await page.fill('input[type="text"]', "petrova");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.click('button[type="submit"]');

    // Ожидаем перенаправления на главную студента
    await page.waitForURL("/student");
    await expect(page.locator('h1:has-text("Дисциплины")').first()).toBeVisible();

    // 2. Перейти на страницу справки студента
    await page.goto("/student/docs");
    await page.waitForURL("/student/docs");

    // Проверяем основной заголовок
    await expect(page.locator('h1:has-text("Справка для студента")')).toBeVisible();

    // Проверяем боковую панель (содержание)
    const toc = page.locator('aside nav');
    await expect(toc).toBeVisible();
    await expect(toc.locator('button:has-text("Кабинет студента")')).toBeVisible();
    await expect(toc.locator('button:has-text("Прохождение теста")')).toBeVisible();
    await expect(toc.locator('button:has-text("История и разбор ошибок")')).toBeVisible();

    // Проверяем секции документации
    // Секция 1: Кабинет студента
    await expect(page.locator('h2:has-text("1. Личный кабинет студента")')).toBeVisible();
    await expect(page.locator('strong:has-text("Дисциплины")').first()).toBeVisible();

    // Секция 3: Прохождение теста
    await expect(page.locator('h2:has-text("3. Прохождение теста")')).toBeVisible();
    await expect(page.locator('strong:has-text("Автосохранение:")')).toBeVisible();

    // Секция 5: История результатов
    await expect(page.locator('h2:has-text("5. История результатов и разбор ошибок")')).toBeVisible();
    await expect(page.locator('strong:has-text("Рекомендации ИИ:")')).toBeVisible();

    // 3. Проверить сворачивание/разворачивание секций
    const section1Header = page.locator('button:has-text("1. Личный кабинет студента")');
    const section1Content = page.locator('p:has-text("Добро пожаловать в систему тестирования")');

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
