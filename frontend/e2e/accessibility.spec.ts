import { test, expect } from "@playwright/test";

test.describe("UI Accessibility & Focus Management", () => {
  test("Global Search Modal - Keyboard focus trap, Escape closure, and WAI-ARIA listbox navigation", async ({ page }) => {
    // 1. Log in as a teacher
    await page.goto("/login");
    await page.fill('input[type="text"]', "sidorov");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.click('button[type="submit"]');
    await page.waitForURL("/teacher/reference/disciplines");

    const searchButton = page.locator('button[aria-label="Глобальный поиск (Ctrl+K)"]').first();
    await expect(searchButton).toBeVisible();

    // Focus the search button so we can verify focus restoration later
    await searchButton.focus();
    await expect(searchButton).toBeFocused();

    // 2. Open search modal using shortcut Control+K
    await page.keyboard.press("Control+KeyK");
    
    // Verify modal is open and search input is auto-focused
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    const searchInput = modal.locator('input[role="combobox"]');
    await expect(searchInput).toBeFocused();
    await expect(searchInput).toHaveAttribute("aria-expanded", "true");

    // 3. Focus trapping verification
    // Press Tab - focus should move to the close button
    await page.keyboard.press("Tab");
    const closeButton = modal.locator('button[aria-label="Закрыть"]');
    await expect(closeButton).toBeFocused();

    // Press Tab again - focus should wrap back to the search input (since they are the only focusable elements initially)
    await page.keyboard.press("Tab");
    await expect(searchInput).toBeFocused();

    // 4. Test typing and ARIA combobox / listbox updates
    await searchInput.fill("тест");
    
    // Wait for mock search results to load
    const listbox = modal.locator('div[role="listbox"]');
    await expect(listbox).toBeVisible();
    
    // Check that we have listbox items
    const firstOption = listbox.locator('button[role="option"]').first();
    await expect(firstOption).toBeVisible();

    // Press ArrowDown to highlight the second result (index 1)
    await page.keyboard.press("ArrowDown");
    const secondOption = listbox.locator('button[role="option"]').nth(1);
    const optionId = await secondOption.getAttribute("id");
    expect(optionId).not.toBeNull();
    
    // The input should point to the active option via aria-activedescendant
    await expect(searchInput).toHaveAttribute("aria-activedescendant", optionId!);
    await expect(secondOption).toHaveAttribute("aria-selected", "true");

    // 5. Close modal with Escape key and verify focus restoration
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    
    // Focus should be restored back to the search trigger button
    await expect(searchButton).toBeFocused();
  });
});
