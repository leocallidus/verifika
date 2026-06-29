import { test, expect } from "@playwright/test";

test.describe("Student AI Topic Preparation (R-32)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("should allow student to use AI preparation helper before starting the test", async ({ page }) => {
    // Mock AI status GET endpoint
    await page.route("**/api/v2/ai/status", async (route) => {
      await route.fulfill({
        json: {
          enabled: true,
          student_access_enabled: true,
          chat_model: "anthropic/claude-sonnet-4-5-20250929",
          generation_model: "openai/gpt-4o",
        },
      });
    });

    // Mock student preparation POST endpoint
    await page.route("**/api/v2/ai/student/topics/*/prepare", async (route) => {
      await route.fulfill({
        json: {
          topic_id: 1001,
          chat_id: 12,
          message_id: 34,
          answer: "Это учебное объяснение про базы данных и SQL от ИИ. Пожалуйста, обратите внимание на JOIN и индексы.",
        },
      });
    });

    // Intercept topic detail GET to ensure has_active_session is false for the E2E test
    await page.route("**/api/student/topics/*", async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.has_active_session = false;
      json.active_session_id = null;
      await route.fulfill({ response, json });
    });

    // Log in as student Petrova
    await page.goto("/login");
    await page.fill('input[type="text"]', "petrova");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.click('button[type="submit"]');
    await page.waitForURL("/student");

    // Click "Темы" button on the "Базы данных" card
    const discCard = page.locator("div.border.p-5", { hasText: "Базы данных" }).first();
    await discCard.locator('button:has-text("Темы")').click();

    // Now click the "Подробнее" button of the first topic "Введение в реляционные БД"
    const topicContainer = page.locator('div.rounded-md.border', { hasText: "Введение в реляционные БД" }).first();
    await topicContainer.locator('a:has-text("Подробнее")').click();

    // Verify we are on the topic detail page
    await page.waitForURL(/\/student\/topics\/\d+/);

    // Verify that the AI Assistant section is visible
    await expect(page.locator('h2:has-text("AI-помощник")')).toBeVisible();

    // Click one of the quick prompt buttons
    const promptButton = page.locator('button:has-text("Объясни тему простыми словами и выдели главное")');
    await expect(promptButton).toBeVisible();
    await promptButton.click();

    // Verify the textarea contains the clicked prompt
    const textarea = page.locator('textarea[placeholder="Например: объясни основные понятия и дай пример"]');
    await expect(textarea).toHaveValue("Объясни тему простыми словами и выдели главное");

    // Verify the explanation text from the mock is visible
    await expect(page.locator("text=Это учебное объяснение про базы данных и SQL от ИИ")).toBeVisible();

    // Type a custom prompt in the textarea
    await textarea.fill("Что такое внешний ключ?");
    await page.locator('button:has-text("Спросить")').click();

    // Verify the explanation text from the mock is still visible
    await expect(page.locator("text=Это учебное объяснение про базы данных и SQL от ИИ")).toBeVisible();
  });
});
