import { test, expect } from "@playwright/test";

test("R-30 Post-test recommendations E2E lifecycle", async ({ page }) => {
  const uniqSuffix = Date.now().toString();
  const disciplineName = `Дисциплина Autotest R30 ${uniqSuffix}`;
  const topicNameWrong = `Тема Ошибка R30 ${uniqSuffix}`;
  const topicNameRelated = `Тема Связанная R30 ${uniqSuffix}`;
  const questionText = `Вопрос R30 с ошибкой ${uniqSuffix}?`;
  const questionTextRelated = `Вопрос R30 связанный ${uniqSuffix}?`;
  const optionCorrect = `Верно ${uniqSuffix}`;
  const optionWrong = `Неверно ${uniqSuffix}`;

  // ================= 1. ADMIN STEP =================
  await page.goto("/login");
  await page.fill('input[type="text"]', "admin");
  await page.fill('input[type="password"]', "Passw0rd!Admin");
  await page.click('button[type="submit"]');
  await page.waitForURL("/admin");

  // Create Discipline
  await page.goto("/admin/disciplines");
  await page.click('button:has-text("Новая дисциплина")');
  await page.getByLabel("Название").fill(disciplineName);
  await page.getByLabel("Описание").fill("Создано автотестом R-30");
  await page.locator('button:has-text("Создать")').click();
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

  // ================= 2. TEACHER STEP =================
  await page.fill('input[type="text"]', "sidorov");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/teacher/reference/disciplines");

  await page.goto("/teacher/bank");
  // Click discipline card
  await page.locator(`role=button[name="Открыть дисциплину ${disciplineName}"]`).click();

  // Create Topic 1 (Wrong)
  await page.click('button:has-text("Новая тема")');
  await page.getByLabel("Название").fill(topicNameWrong);
  await page.getByLabel("Описание").fill("Тема, в которой сделаем ошибку");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Тема сохранена').first()).toBeVisible();

  // Create Topic 2 (Related)
  await page.click('button:has-text("Новая тема")');
  await page.getByLabel("Название").fill(topicNameRelated);
  await page.getByLabel("Описание").fill("Связанная тема для повторения");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Тема сохранена').first()).toBeVisible();

  // Add Question to Topic Wrong
  const topicChipWrong = page.locator(`div[role="button"]:has-text("${topicNameWrong}")`);
  await topicChipWrong.click();

  await page.click('button:has-text("Новый вопрос")');
  await page.getByLabel("Текст вопроса").fill(questionText);
  await page.locator('input[placeholder="Вариант 1"]').fill(optionCorrect);
  await page.locator('input[placeholder="Вариант 2"]').fill(optionWrong);
  await page.locator('input[placeholder="Вариант 3"]').fill("Вариант 3 " + uniqSuffix);
  await page.locator('input[placeholder="Вариант 4"]').fill("Вариант 4 " + uniqSuffix);
  await page.locator('div.flex:has(> input[placeholder="Вариант 1"]) input[type="radio"]').check();
  await page.locator('button:has-text("Создать")').click();
  await expect(page.locator('text=Вопрос сохранен').first()).toBeVisible();

  // Enable test for Topic Wrong
  await topicChipWrong.locator('button[title="Настройки теста"]').click();
  await page.locator('label:has-text("Тест по теме включен") input[type="checkbox"]').check();
  await page.getByLabel("Вопросов").fill("1");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Настройки теста сохранены').first()).toBeVisible();

  // Add Question to Topic Related
  const topicChipRelated = page.locator(`div[role="button"]:has-text("${topicNameRelated}")`);
  await topicChipRelated.click();

  await page.click('button:has-text("Новый вопрос")');
  await page.getByLabel("Текст вопроса").fill(questionTextRelated);
  await page.locator('input[placeholder="Вариант 1"]').fill(optionCorrect);
  await page.locator('input[placeholder="Вариант 2"]').fill(optionWrong);
  await page.locator('input[placeholder="Вариант 3"]').fill("Вариант 3 " + uniqSuffix);
  await page.locator('input[placeholder="Вариант 4"]').fill("Вариант 4 " + uniqSuffix);
  await page.locator('div.flex:has(> input[placeholder="Вариант 1"]) input[type="radio"]').check();
  await page.locator('button:has-text("Создать")').click();
  await expect(page.locator('text=Вопрос сохранен').first()).toBeVisible();

  // Enable test for Topic Related
  await topicChipRelated.locator('button[title="Настройки теста"]').click();
  await page.locator('label:has-text("Тест по теме включен") input[type="checkbox"]').check();
  await page.getByLabel("Вопросов").fill("1");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Настройки теста сохранены').first()).toBeVisible();

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= 3. STUDENT STEP =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  // Select discipline card
  const discCard = page.locator('div.border.p-5', { hasText: disciplineName }).first();
  await discCard.locator('button:has-text("Темы")').click();

  // Find topic and Start Test
  const topicRow = page.locator(`div:has-text("${topicNameWrong}")`);
  await topicRow.locator('button:has-text("Начать тест по теме")').first().click();

  // Wait for test runner
  await page.waitForURL(/\/student\/test\/\d+/);

  // Answer question WRONGLY (choose optionWrong)
  await page.locator(`label:has-text("${optionWrong}")`).click();

  // Finish test
  await page.locator('button:has-text("Закончить попытку")').first().click();
  await page.locator('button:has-text("Отправить всё и завершить")').first().click();
  await page.locator('div[role="dialog"] button:has-text("Отправить всё и завершить")').click();

  // Wait for results
  await page.waitForURL(/\/student\/results\/\d+/);
  await expect(page.locator('text=Итоговая оценка за тест')).toBeVisible();

  // ================= 4. RECOMMENDATIONS VALIDATION =================
  // Recommendations heading should be visible
  await expect(page.locator('h2:has-text("Рекомендации по обучению")')).toBeVisible();
  
  // Weak topics heading
  await expect(page.locator('h3:has-text("Темы с ошибками")')).toBeVisible();
  
  // The topic with error should be listed as weak topic
  await expect(page.locator(`text=${topicNameWrong}`).first()).toBeVisible();
  
  // Related topics heading
  await expect(page.locator('h3:has-text("Рекомендуем изучить")')).toBeVisible();
  
  // The related topic should be listed
  await expect(page.locator(`text=${topicNameRelated}`).first()).toBeVisible();

  // Check the review hints button
  const hintsButton = page.locator('button:has-text("Вопросы для повторения")');
  await expect(hintsButton).toBeVisible();
  await hintsButton.click();

  // Review hints content should be visible after expand
  await expect(page.locator(`text=${questionText.substring(0, 30)}`).first()).toBeVisible();
});
