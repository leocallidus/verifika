import { test, expect } from "@playwright/test";

test("Full role-based lifecycle: Admin, Teacher, Student", async ({ page }) => {
  const uniqSuffix = Date.now().toString();
  const disciplineName = `Дисциплина Autotest ${uniqSuffix}`;
  const topicName = `Тема Autotest ${uniqSuffix}`;
  const questionText = `Вопрос Autotest ${uniqSuffix}?`;
  const optionCorrect = `Работоспособность сценария ${uniqSuffix}`;
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
  await page.getByLabel("Описание").fill("Создано автотестом");
  await page.locator('button:has-text("Создать")').click();

  // Wait for success toast and disciplines list reload
  await expect(page.locator('text=Дисциплина создана')).toBeVisible();

  // Find the row of newly created discipline and Assign Teacher
  const row = page.locator('tr', { hasText: disciplineName });
  await row.locator('button:has-text("Назначить")').click();
  
  // Select Сидоров Алексей by finding the option containing his name
  const teacherOption = page.locator('option:has-text("Сидоров Алексей")');
  const teacherValue = await teacherOption.getAttribute("value");
  if (teacherValue) {
    await page.getByLabel("Преподаватель").selectOption(teacherValue);
  }
  await page.locator('div[role="dialog"] button:has-text("Назначить")').click();
  await expect(page.locator('text=Преподаватель назначен')).toBeVisible();

  // Assign Group
  await row.locator('button:has-text("Доступ")').click();
  
  // Select ИВТ-21 by finding the option value inside active dialog
  const groupSelect = page.locator('div[role="dialog"] select').first();
  const groupOption = page.locator('option:has-text("ИВТ-21")');
  const groupValue = await groupOption.getAttribute("value");
  if (groupValue) {
    await groupSelect.selectOption(groupValue);
  }
  // Click first "Назначить" button in dialog
  await page.locator('div[role="dialog"] button:has-text("Назначить")').first().click();
  await expect(page.locator('text=Группа назначена')).toBeVisible();
  await page.locator('button:has-text("Закрыть")').click();

  // Logout Admin
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= TEACHER STEP =================
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
  await page.getByLabel("Описание").fill("Тема создана автотестом");
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

  // Enable test
  await topicChip.locator('button[title="Настройки теста"]').click();
  await page.locator('label:has-text("Тест по теме включен") input[type="checkbox"]').check();
  await page.getByLabel("Вопросов").fill("1");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Настройки теста сохранены')).toBeVisible();

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= STUDENT STEP =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  // Select discipline card by looking for container of class div.border.p-5 containing the heading name
  const discCard = page.locator('div.border.p-5', { hasText: disciplineName }).first();
  await discCard.locator('button:has-text("Темы")').click();

  // Find topic and Start Test
  const topicRow = page.locator(`div:has-text("${topicName}")`);
  await topicRow.locator('button:has-text("Начать тест по теме")').click();

  // Wait for test runner
  await page.waitForURL(/\/student\/test\/\d+/);

  // Answer question
  await page.locator(`label:has-text("${optionCorrect}")`).click();

  // Finish test
  await page.locator('button:has-text("Закончить попытку")').first().click();
  await page.locator('button:has-text("Отправить всё и завершить")').first().click();
  await page.locator('div[role="dialog"] button:has-text("Отправить всё и завершить")').click();

  // Wait for results
  await page.waitForURL(/\/student\/results\/\d+/);
  await expect(page.locator('text=Итоговая оценка за тест')).toBeVisible();
});
