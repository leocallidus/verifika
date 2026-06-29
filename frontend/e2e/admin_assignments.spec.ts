import { test, expect } from "@playwright/test";

test.describe("Admin Assignments Matrix Page E2E", () => {
  test("Logs in as admin, visits assignments matrix page, tests debounced search and modals", async ({ page }) => {
    // 1. Войти под администратором
    await page.goto("/login");
    await page.fill('input[type="text"]', "admin");
    await page.fill('input[type="password"]', "Passw0rd!Admin");
    await page.click('button[type="submit"]');

    // Ожидаем перенаправления на дашборд
    await page.waitForURL("/admin");
    await expect(page.locator('h1:has-text("Дашборд администратора")')).toBeVisible();

    // 2. Перейти на страницу назначений
    await page.goto("/admin/assignments");
    await page.waitForURL("/admin/assignments");

    // Проверяем наличие заголовка
    await expect(page.locator('h1:has-text("Назначения дисциплин")')).toBeVisible();

    // 3. Тестируем поиск (проверка дебаунса)
    const searchInput = page.locator('input[placeholder="Дисциплина…"]');
    await expect(searchInput).toBeVisible();

    // Вводим поисковый запрос
    await searchInput.fill("R-01");
    
    // Ожидаем, пока первая строка таблицы обновится и будет содержать "R-01"
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toContainText("R-01");

    // Проверяем, что все отображаемые строки теперь содержат "R-01"
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).locator('td').first().textContent();
      expect(text).toContain("R-01");
    }

    // 4. Открываем модальное окно назначения
    const assignButton = firstRow.locator('button:has-text("Назначить")');
    await assignButton.click();

    // Ожидаем появление модалки
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2:has-text("Назначить:")')).toBeVisible();

    // Проверяем наличие селекторов преподавателя, группы и студента
    await expect(modal.locator('label:has-text("Преподаватель")')).toBeVisible();
    await expect(modal.locator('label:has-text("Группа")')).toBeVisible();
    await expect(modal.locator('label:has-text("Студент")')).toBeVisible();

    // Закрываем модальное окно
    const closeButton = modal.locator('button:has-text("Отмена")');
    await closeButton.click();
    await expect(modal).not.toBeVisible();
  });
});
