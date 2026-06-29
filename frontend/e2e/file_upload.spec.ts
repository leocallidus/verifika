import { test, expect } from "@playwright/test";

test("File upload answer type E2E lifecycle", async ({ page }) => {
  const uniqSuffix = Date.now().toString();
  const disciplineName = `Дисциплина Файлы ${uniqSuffix}`;
  const topicName = `Тема Файлы ${uniqSuffix}`;
  const questionText = `Загрузите ваш отчет по ЛР ${uniqSuffix}?`;

  // ================= 1. ADMIN STEP: Setup discipline, teacher and group =================
  await page.goto("/login");
  await page.fill('input[type="text"]', "admin");
  await page.fill('input[type="password"]', "Passw0rd!Admin");
  await page.click('button[type="submit"]');
  await page.waitForURL("/admin");

  // Create Discipline
  await page.goto("/admin/disciplines");
  await page.click('button:has-text("Новая дисциплина")');
  await page.getByLabel("Название").fill(disciplineName);
  await page.getByLabel("Описание").fill("Создано автотестом для проверки загрузки файлов");
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

  // Assign Group
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

  // ================= 2. TEACHER STEP: Create topic and file_upload question =================
  await page.fill('input[type="text"]', "sidorov");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/teacher/reference/disciplines");

  await page.goto("/teacher/bank");
  await page.locator(`role=button[name="Открыть дисциплину ${disciplineName}"]`).click();

  // Create Topic
  await page.click('button:has-text("Новая тема")');
  await page.getByLabel("Название").fill(topicName);
  await page.getByLabel("Описание").fill("Тема с загрузкой файлов");
  await page.locator('button:has-text("Сохранить")').click();
  await expect(page.locator('text=Тема сохранена')).toBeVisible();

  // Select the newly created topic chip
  const topicChip = page.locator(`div[role="button"]:has-text("${topicName}")`);
  await topicChip.click();

  // Add Question of type file_upload
  await page.click('button:has-text("Новый вопрос")');
  // Select type "Загрузка файла" first (as changing type resets form fields)
  await page.locator('div[role="dialog"] select').nth(2).selectOption("file_upload");

  await page.getByLabel("Текст вопроса").fill(questionText);

  // Configure File Upload Settings
  await page.getByLabel("Максимальное количество файлов").fill("2");
  await page.getByLabel("Максимальный размер файла (МБ)").fill("5");
  await page.getByLabel("Разрешённые расширения").fill(".txt, .pdf");

  await page.locator('button:has-text("Создать")').click();
  await expect(page.locator('text=Вопрос сохранен')).toBeVisible();

  // Enable test
  await topicChip.locator('button[title="Настройки теста"]').click();
  await page.locator('label:has-text("Тест по теме включен") input[type="checkbox"]').check();
  await page.getByLabel("Вопросов").fill("1");
  await page.locator('div[role="dialog"] button:has-text("Сохранить")').click();
  await expect(page.locator('text=Настройки теста сохранены')).toBeVisible();

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= 3. STUDENT STEP: Take test and upload files =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  // Open topic tests list
  const discCard = page.locator('div.border.p-5', { hasText: disciplineName }).first();
  await discCard.locator('button:has-text("Темы")').click();

  // Start Test
  const topicRow = page.locator(`div:has-text("${topicName}")`);
  await topicRow.locator('button:has-text("Начать тест по теме")').click();

  // Wait for test runner
  await page.waitForURL(/\/student\/test\/\d+/);

  // Check file upload rules display
  await expect(page.locator('text=Максимальное кол-во: 2')).toBeVisible();
  await expect(page.locator('text=Разрешённые форматы: .txt, .pdf')).toBeVisible();

  // Upload files using file inputs (we have hidden inputs)
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    { name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf-report-content") },
    { name: "code.txt", mimeType: "text/plain", buffer: Buffer.from("source-code-content") }
  ]);

  // Wait for file upload success and render of files
  await expect(page.locator('text=report.pdf')).toBeVisible();
  await expect(page.locator('text=code.txt')).toBeVisible();

  // Finish test
  await page.locator('button:has-text("Закончить попытку")').first().click();
  await page.locator('button:has-text("Отправить всё и завершить")').first().click();
  await page.locator('div[role="dialog"] button:has-text("Отправить всё и завершить")').click();

  // Wait for results. It should show status pending grading.
  await page.waitForURL(/\/student\/results\/\d+/);
  await expect(page.locator('text=ожидает проверки файлов')).toBeVisible();
  await expect(page.locator('text=Файлы на проверке')).toBeVisible();
  await expect(page.locator('text=Ожидает оценки')).toBeVisible();

  // Capture session ID
  const sessionId = page.url().split("/").pop() || "";

  // Logout Student
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= 4. TEACHER STEP: Grade files =================
  await page.fill('input[type="text"]', "sidorov");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/teacher/reference/disciplines");

  // Navigate to Pending reviews page
  await page.goto("/teacher/pending-file-reviews");
  await page.waitForURL("/teacher/pending-file-reviews");

  // Wait for the specific student session link to appear and click Check
  await page.locator(`a[href="/teacher/sessions/${sessionId}/file-review"]`).click();

  // Wait for Session File Review page to load
  await page.waitForURL(new RegExp(`/teacher/sessions/${sessionId}/file-review`));
  await expect(page.locator('text=report.pdf')).toBeVisible();
  await expect(page.locator('text=code.txt')).toBeVisible();

  // Grade the answer
  await page.locator('input[type="number"]').fill("1"); // max points is 1
  await page.locator('input[placeholder="Добавьте отзыв..."]').fill("Отличный отчет E2E");
  await page.locator('button:has-text("Сохранить оценку")').click();

  // Expect navigation back after completion
  await page.waitForURL("/teacher/pending-file-reviews");

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= 5. STUDENT STEP: Verify updated grade =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  // Visit the session result page
  await page.goto(`/student/results/${sessionId}`);
  await page.waitForURL(`/student/results/${sessionId}`);

  // Status should be completed
  await expect(page.locator('text=завершён')).toBeVisible();
  // Comments and grades should be visible
  await expect(page.locator('text=Отличный отчет E2E')).toBeVisible();
});
