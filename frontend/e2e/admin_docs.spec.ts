import { test, expect } from "@playwright/test";

test.describe("Admin Documentation Page E2E", () => {
  test("Logs in as admin, visits /admin/docs, and checks that sections render and dynamic environment info loads", async ({ page }) => {
    // 1. Войти под администратором
    await page.goto("/login");
    await page.fill('input[type="text"]', "admin");
    await page.fill('input[type="password"]', "Passw0rd!Admin");
    await page.click('button[type="submit"]');

    // Ожидаем перенаправления на дашборд
    await page.waitForURL("/admin");
    await expect(page.locator('h1:has-text("Дашборд администратора")')).toBeVisible();

    // 2. Перейти на страницу документации
    await page.goto("/admin/docs");
    await page.waitForURL("/admin/docs");

    // Проверяем основной заголовок
    await expect(page.locator('h1:has-text("Документация администратора")')).toBeVisible();

    // Проверяем боковую панель (содержание)
    const toc = page.locator('aside nav');
    await expect(toc).toBeVisible();
    await expect(toc.locator('button:has-text("Быстрый старт")')).toBeVisible();
    await expect(toc.locator('button:has-text("Текущее окружение")')).toBeVisible();

    // Проверяем секции документации
    // Секция 1: Быстрый старт
    await expect(page.locator('h2:has-text("1. Быстрый старт")')).toBeVisible();
    await expect(page.locator('strong:has-text("PostgreSQL 15+")')).toBeVisible();

    // Секция 2: Запуск системы
    await expect(page.locator('h2:has-text("2. Запуск системы")')).toBeVisible();
    await expect(page.locator('code:has-text("./scripts/dev.sh")').first()).toBeVisible();

    // Секция 3: Миграции
    await expect(page.locator('h2:has-text("3. Миграции базы данных")')).toBeVisible();
    await expect(page.locator('code:has-text("uv run alembic upgrade head")').first()).toBeVisible();

    // Секция 8: Текущее окружение (динамические данные)
    await expect(page.locator('h2:has-text("8. Текущее окружение (Динамические данные)")')).toBeVisible();

    // Проверяем загрузку динамических данных (поля из API)
    // Должна отобразиться версия приложения "2.0.0"
    const appVersionField = page.locator('div:text-is("Версия приложения")').locator('..');
    await expect(appVersionField).toBeVisible();
    await expect(appVersionField.locator('text=2.0.0')).toBeVisible();

    // Должно отобразиться bcrypt rounds "12"
    const bcryptField = page.locator('div:text-is("Шифрование bcrypt (Rounds)")').locator('..');
    await expect(bcryptField).toBeVisible();
    await expect(bcryptField.locator('text=12')).toBeVisible();

    // 3. Проверить сворачивание/разворачивание секций
    const section1Header = page.locator('button:has-text("1. Быстрый старт")');
    const section1Content = page.locator('p:has-text("Добро пожаловать в административный раздел")');

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
