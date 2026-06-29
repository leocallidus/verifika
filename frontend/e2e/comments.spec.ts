import { test, expect } from "@playwright/test";

test("R-29 Attempt and question comments E2E lifecycle", async ({ page }) => {
  // ================= 1. TEACHER LEAVES COMMENTS =================
  await page.goto("/login");
  await page.fill('input[type="text"]', "sidorov");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/teacher/reference/disciplines");

  // Go to students list
  await page.goto("/teacher/reference/students");
  await page.waitForSelector('text=Петрова Мария');

  // Click on Petrova's name or detail link
  await page.click('text=Петрова Мария');
  
  // Wait for Student Detail page to load
  await page.waitForSelector('text=Сессия #');

  // Click first "Прокомментировать" button on the first completed session
  const commentBtn = page.locator('button:has-text("Прокомментировать")').first();
  await commentBtn.click();

  // Enter attempt comment
  await page.waitForSelector('text=Комментарий к попытке');
  const commentTextarea = page.locator('textarea[placeholder*="Хорошая работа над тестом"]');
  await commentTextarea.fill("Автотест: Отличные результаты! Поздравляю с успешной сдачей.");
  await page.click('div[role="dialog"] button:has-text("Сохранить")');

  // Verify attempt comment toast and display
  await expect(page.locator('text=Комментарий к попытке сохранён')).toBeVisible();
  await expect(page.locator('text=Автотест: Отличные результаты!').first()).toBeVisible();

  // Now let's find the first session ID to use for validation
  const sessionHeadingText = await page.locator('span:has-text("Сессия #")').first().innerText();
  const sessionId = sessionHeadingText.replace("Сессия #", "").trim();

  // Logout Teacher
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  // ================= 2. STUDENT VIEWS COMMENTS AND NOTIFICATIONS =================
  await page.fill('input[type="text"]', "petrova");
  await page.fill('input[type="password"]', "Passw0rd!Test");
  await page.click('button[type="submit"]');
  await page.waitForURL("/student");

  // Go to notifications
  await page.goto("/student/notifications");
  // Filter comments
  await page.click('button:has-text("Комментарии")');
  await page.waitForSelector('text=Новый комментарий к попытке');

  // Click the notification link to go to the session details
  await page.click('text=Новый комментарий к попытке');
  await page.waitForURL(/\/student\/results\/\d+/);

  // Verify attempt comment is displayed on the session details page
  await expect(page.locator('text=Комментарий преподавателя к попытке')).toBeVisible();
  await expect(page.locator('text=Автотест: Отличные результаты! Поздравляю с успешной сдачей.')).toBeVisible();
});
