import { test, expect } from "@playwright/test";

test("R-28 Group availability rules E2E lifecycle", async ({ page }) => {
  const uniqSuffix = Date.now().toString();
  const disciplineName = `Дисциплина R-28 Autotest ${uniqSuffix}`;
  const topicName = `Тема R-28 Autotest ${uniqSuffix}`;
  const questionText = `Вопрос R-28 Autotest ${uniqSuffix}?`;
  const optionCorrect = `Работоспособность R-28 ${uniqSuffix}`;
  const optionWrong1 = `Неправильный ответ 2 ${uniqSuffix}`;
  const optionWrong2 = `Неправильный ответ 3 ${uniqSuffix}`;
  const optionWrong3 = `Неправильный ответ 4 ${uniqSuffix}`;

  // ================= ADMIN STEP =================
  await page.goto("/login");
  await page.fill('input[type="text"]', "admin");
  await page.fill('input[type="password"]', "Passw0rd!Admin");
  await page.click('button[type="submit"]');
  await page.waitForURL("/admin");

  // Create Discipline
  await page.goto("/admin/disciplines");
  await page.click('button:has-text("Новая дисциплина")');
  await page.getByLabel("Название").fill(disciplineName);
  await page.getByLabel("Описание").fill("Создано для проверки R-28");
  await page.locator('button:has-text("Создать")').click();

  // Wait for success toast
  await expect(page.locator('text=Дисциплина создана')).toBeVisible();

  // Find row and Assign Teacher
  const row = page.locator('tr', { hasText: disciplineName });
  await row.locator('button:has-text("Назначить")').click();
  const teacherOption = page.locator('option:has-text("Сидоров Алексей")');
  const teacherValue = await teacherOption.getAttribute("value");
  if (teacherValue) {
    await page.getByLabel("Преподаватель").selectOption(teacherValue);
  }
  await page.locator('div[role="dialog"] button:has-text("Назначить")').click();
  await expect(page.locator('text=Преподаватель назначен')).toBeVisible();

  // Assign Group ИВТ-21
  await row.locator('button:has-text("Доступ")').click();
  const groupSelect = page.locator('div[role="dialog"] select').first();
  const groupOption = page.locator('option:has-text("ИВТ-21")');
  const groupValue = await groupOption.getAttribute("value");
  if (groupValue) {
    await groupSelect.selectOption(groupValue);
  }
  await page.locator('div[role="dialog"] button:has-text("Назначить")').first().click();
  await expect(page.locator('text=Группа назначена')).toBeVisible();
  await page.locator('button:has-text("Закрыть")').click();

  // Logout Admin
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= TEACHER STEP: Create Content & Set Future Group Rules =================
  await page.fill('input[type="text"]', "sidorov");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/teacher/reference/disciplines");

  await page.goto("/teacher/bank");
  // Click discipline card
  await page.locator(`role=button[name="Открыть дисциплину ${disciplineName}"]`).click();

  // Create Topic
  await page.click('button:has-text("Новая тема")');
  await page.getByLabel("Название").fill(topicName);
  await page.getByLabel("Описание").fill("Тема создана автотестом R-28");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Тема сохранена')).toBeVisible();

  // Select the newly created topic chip
  const topicChip = page.locator(`div[role="button"]:has-text("${topicName}")`);
  await topicChip.click();

  // Add Question
  await page.click('button:has-text("Новый вопрос")');
  await page.getByLabel("Текст вопроса").fill(questionText);
  await page.locator('input[placeholder="Вариант 1"]').fill(optionCorrect);
  await page.locator('input[placeholder="Вариант 2"]').fill(optionWrong1);
  await page.locator('input[placeholder="Вариант 3"]').fill(optionWrong2);
  await page.locator('input[placeholder="Вариант 4"]').fill(optionWrong3);
  await page.locator('div.flex:has(> input[placeholder="Вариант 1"]) input[type="radio"]').check();
  await page.locator('button:has-text("Создать")').click();
  await expect(page.locator('text=Вопрос сохранен')).toBeVisible();

  // Open test settings modal
  await topicChip.locator('button[title="Настройки теста"]').click();
  await page.locator('label:has-text("Тест по теме включен") input[type="checkbox"]').check();
  await page.getByLabel("Вопросов").fill("1");

  // Clear general dates
  const dialog = page.locator('div[role="dialog"]');
  const generalFromInput = dialog.locator('input[type="datetime-local"]').first();
  const generalUntilInput = dialog.locator('input[type="datetime-local"]').nth(1);
  await generalFromInput.fill("");
  await generalUntilInput.fill("");

  // Set group rules for ИВТ-21 to future (so student won't be able to start)
  const groupDiv = dialog.locator('div.border', { has: page.locator('strong', { hasText: 'ИВТ-21' }) });
  const groupFromInput = groupDiv.locator('input[type="datetime-local"]').first();
  const groupUntilInput = groupDiv.locator('input[type="datetime-local"]').nth(1);
  await groupFromInput.fill("2035-01-01T12:00");
  await groupUntilInput.fill("2036-01-01T12:00");

  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Настройки теста сохранены')).toBeVisible();

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= STUDENT STEP: Check Test is Unavailable (Future window) =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  // Select discipline card
  const discCard = page.locator('div.border.p-5', { hasText: disciplineName }).first();
  await discCard.locator('button:has-text("Темы")').click();

  // Find topic row
  const topicRow = page.locator(`div:has-text("${topicName}")`).first();
  // Expect topic test to show availability error: "окно доступности еще не началось"
  await expect(topicRow.locator('text=окно доступности еще не началось')).toBeVisible();
  // Expect the "Начать тест" button to be disabled
  const startButton = topicRow.locator('button:has-text("Начать тест по теме")');
  await expect(startButton).toBeDisabled();

  // Logout Student
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= TEACHER STEP 2: Update Group Rules to Active Window =================
  await page.fill('input[type="text"]', "sidorov");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/teacher/reference/disciplines");

  await page.goto("/teacher/bank");
  await page.locator(`role=button[name="Открыть дисциплину ${disciplineName}"]`).click();
  
  const topicChip2 = page.locator(`div[role="button"]:has-text("${topicName}")`);
  await topicChip2.click();
  await topicChip2.locator('button[title="Настройки теста"]').click();

  // Update group rules for ИВТ-21 to active range (past to far future)
  const dialog2 = page.locator('div[role="dialog"]');
  const groupDiv2 = dialog2.locator('div.border', { has: page.locator('strong', { hasText: 'ИВТ-21' }) });
  const groupFromInput2 = groupDiv2.locator('input[type="datetime-local"]').first();
  const groupUntilInput2 = groupDiv2.locator('input[type="datetime-local"]').nth(1);
  await groupFromInput2.fill("2020-01-01T12:00");
  await groupUntilInput2.fill("2035-01-01T12:00");

  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Настройки теста сохранены')).toBeVisible();

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= STUDENT STEP 2: Check Test is now Available =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  const discCard2 = page.locator('div.border.p-5', { hasText: disciplineName }).first();
  await discCard2.locator('button:has-text("Темы")').click();

  const topicRow2 = page.locator(`div:has-text("${topicName}")`).first();
  // The start test button should now be enabled and clickable
  const startButton2 = topicRow2.locator('button:has-text("Начать тест по теме")');
  await expect(startButton2).toBeEnabled();
});
