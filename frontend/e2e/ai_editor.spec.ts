import { test, expect } from '@playwright/test';

test.describe('Teacher AI Question Editor (R-31)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should use AI helper buttons to edit question', async ({ page }) => {
    const uniqSuffix = Date.now().toString();
    const disciplineName = `Дисциплина AI Test ${uniqSuffix}`;

    // ================= 1. ADMIN STEP =================
    await page.goto("/login");
    await page.fill('input[type="text"]', "admin");
    await page.fill('input[type="password"]', "Passw0rd!Admin");
    await page.click('button[type="submit"]');
    await expect(page.getByRole('heading', { name: 'Войдите в систему' })).toBeHidden({ timeout: 15000 });

    // Create Discipline
    await page.goto("/admin/disciplines");
    await page.click('button:has-text("Новая дисциплина")');
    await page.getByLabel("Название").fill(disciplineName);
    await page.getByLabel("Описание").fill("Создано для AI Editor test");
    await page.locator('button:has-text("Создать")').click();
    await expect(page.locator('text=Дисциплина создана')).toBeVisible();

    // Assign Teacher
    const row = page.locator('tr', { hasText: disciplineName });
    await row.locator('button:has-text("Назначить")').click();
    
    const teacherOption = page.locator('option:has-text("Сидоров Алексей")');
    const teacherValue = await teacherOption.getAttribute("value");
    if (teacherValue) {
      await page.getByLabel("Преподаватель").selectOption(teacherValue);
    }
    await page.locator('div[role="dialog"] button:has-text("Назначить")').click();
    await expect(page.locator('text=Преподаватель назначен')).toBeVisible();


    // Logout Admin
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");

    // ================= 2. TEACHER STEP =================
    await page.fill('input[type="text"]', "sidorov");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.getByRole('main').getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('heading', { name: 'Войдите в систему' })).toBeHidden({ timeout: 15000 });

    // Navigate to Question Bank
    await page.goto('/teacher/bank');
    
    // Select the newly created discipline
    await page.locator(`role=button[name="Открыть дисциплину ${disciplineName}"]`).click();

    // Add a topic so we can add a question
    await page.click('button:has-text("Новая тема")');
    await page.getByLabel("Название").fill(`Тема AI ${uniqSuffix}`);
    await page.locator('button:has-text("Сохранить")').click();
    await expect(page.locator('text=Тема сохранена').first()).toBeVisible();

    // Select the topic
    await page.locator(`div[role="button"]:has-text("Тема AI ${uniqSuffix}")`).click();

    // Open New Question Modal
    await page.getByRole('button', { name: 'Новый вопрос' }).first().click();
    await expect(page.getByRole('heading', { name: 'Новый вопрос' })).toBeVisible();

    // Fill in basic text
    await page.getByRole('textbox', { name: 'Текст вопроса' }).fill('Что такое SQL?');

    // Mock API responses
    await page.route('**/api/v2/ai/editor/rephrase', async route => {
      await route.fulfill({ json: { text: "Что такое SQL и для чего он нужен?" } });
    });
    await page.route('**/api/v2/ai/editor/generate-options', async route => {
      await route.fulfill({ json: { options: ["Option 1", "Option 2", "Option 3", "Option 4"], correct_index: 0 } });
    });
    await page.route('**/api/v2/ai/editor/explain', async route => {
      await route.fulfill({ json: { explanation: "SQL - это язык запросов к БД." } });
    });
    await page.route('**/api/v2/ai/editor/check-complexity', async route => {
      await route.fulfill({ json: { difficulty_level: 3, feedback: "Нормальный вопрос." } });
    });

    // Test Rephrase
    await page.getByRole('button', { name: 'Переформулировать' }).click();
    await expect(page.getByText('Переформулировано')).toBeVisible({ timeout: 15000 });

    // Test Generate Options
    await page.getByRole('button', { name: 'Сгенерировать варианты' }).click();
    await expect(page.getByText('Варианты сгенерированы')).toBeVisible({ timeout: 15000 });
    
    // There should be 4 options generated
    const options = page.getByPlaceholder(/Вариант \d/);
    await expect(options).toHaveCount(4);

    // Test Explain
    await page.getByRole('button', { name: 'Написать пояснение' }).click();
    await expect(page.getByText('Пояснение сгенерировано')).toBeVisible({ timeout: 15000 });
    
    // Check explanation field
    const explanation = page.getByRole('textbox', { name: 'Пояснение к правильному ответу' });
    expect(await explanation.inputValue()).not.toBe('');

    // Test Complexity
    await page.getByRole('button', { name: 'Оценить сложность' }).click();
    await expect(page.getByText('Сложность оценена')).toBeVisible({ timeout: 15000 });
    
    // Ensure difficulty is a number between 1 and 5
    const diffInput = page.locator('input[type="number"]').first();
    const diffValue = await diffInput.inputValue();
    expect(Number(diffValue)).toBeGreaterThanOrEqual(1);
    expect(Number(diffValue)).toBeLessThanOrEqual(5);
  });
});
