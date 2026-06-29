import { test, expect } from "@playwright/test";

// Inject a mock of the Tauri 2 environment into the window.
async function setupTauriMock(page: any, options: { updateAvailable: boolean; targetVersion?: string }) {
  await page.addInitScript((opts: any) => {
    window.isTauri = true;
    (window as any).__tauri_listeners = {};

    window.__TAURI__ = {
      core: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          (window as any).__tauri_invokes = (window as any).__tauri_invokes || [];
          (window as any).__tauri_invokes.push({ cmd, args });
          console.log(`[MOCK TAURI] invoke: ${cmd}`, args);

          if (cmd === "update_status") {
            return {
              available: opts.updateAvailable,
              version: opts.targetVersion || "0.2.0",
            };
          }
          if (cmd === "trigger_update") {
            // Emulate backend finishing the download and install.
            // We trigger the event on a short timeout.
            setTimeout(() => {
              console.log("[MOCK TAURI] Triggering verifika://update/installed event...");
              const handlers = (window as any).__tauri_listeners["verifika://update/installed"];
              if (handlers && handlers.length > 0) {
                for (const handler of handlers) {
                  handler({ payload: opts.targetVersion || "0.2.0" });
                }
              } else {
                console.warn("[MOCK TAURI] verifika://update/installed handler not found!", Object.keys((window as any).__tauri_listeners));
              }
            }, 100);
            return;
          }
          return null;
        },
      },
      event: {
        listen: async (event: string, handler: (e: { payload: any }) => void) => {
          console.log(`[MOCK TAURI] listen registered for: ${event}`);
          (window as any).__tauri_listeners[event] = (window as any).__tauri_listeners[event] || [];
          (window as any).__tauri_listeners[event].push(handler);
          return () => {
            console.log(`[MOCK TAURI] listen cleaned up for: ${event}`);
            (window as any).__tauri_listeners[event] = ((window as any).__tauri_listeners[event] || [])
              .filter((h: any) => h !== handler);
          };
        },
      },
    };
  }, options);
}

// Trigger a mock Tauri event from the test context.
async function triggerTauriEvent(page: any, event: string, payload: any) {
  console.log(`[TEST] Triggering event ${event} with payload:`, payload);
  await page.evaluate(
    (opts: any) => {
      const handlers = (window as any).__tauri_listeners[opts.event];
      if (handlers && handlers.length > 0) {
        console.log(`[MOCK TAURI] Firing ${handlers.length} registered handlers for ${opts.event}...`);
        for (const handler of handlers) {
          handler({ payload: opts.payload });
        }
      } else {
        console.warn(`[MOCK TAURI] Cannot fire event ${opts.event}: handler not registered!`, Object.keys((window as any).__tauri_listeners));
      }
    },
    { event, payload }
  );
}

test.describe("Desktop Polish (Tray, Deep Links, Auto-Updates)", () => {
  test.beforeEach(async ({ page }) => {
    // Pipe browser console to test stdout
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
  });

  test("Should show auto-update notifications and allow triggering updates", async ({ page }) => {
    // 1. Setup mock with an available update
    await setupTauriMock(page, { updateAvailable: true, targetVersion: "0.2.0" });

    // 2. Go to login page
    await page.goto("/login");

    // 3. Verify auto-update toast is shown
    await expect(page.locator("text=Доступно обновление")).toBeVisible();
    await expect(page.locator("text=Доступна новая версия 0.2.0.")).toBeVisible();

    // 4. Click the "Обновить" button on the toast
    await page.locator('button:has-text("Обновить")').click();

    // 5. Verify the update-installed toast is triggered and displayed
    await expect(page.locator("text=Обновление установлено")).toBeVisible();
    await expect(page.locator("text=Успешно установлено обновление до версии 0.2.0.")).toBeVisible();
  });

  test("Should route deep links correctly based on user roles", async ({ page }) => {
    // Setup mock without update check notification to keep screen clean
    await setupTauriMock(page, { updateAvailable: false });

    // 1. Log in as Student
    await page.goto("/login");
    await page.fill('input[type="text"]', "petrova");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.click('button[type="submit"]');
    await page.waitForURL("/student");
    await expect(page.locator("text=Загрузка…")).not.toBeVisible();

    // 2. Trigger test deep link -> verifika://test/456
    await triggerTauriEvent(page, "verifika://deep-link", ["verifika://test/456"]);
    await page.waitForURL(/\/student\/test\/456/);

    // 3. Trigger results deep link -> verifika://results/789
    await triggerTauriEvent(page, "verifika://deep-link", ["verifika://results/789"]);
    await page.waitForURL(/\/student\/results\/789/);

    // 4. Trigger notifications deep link -> verifika://notifications
    await triggerTauriEvent(page, "verifika://deep-link", ["verifika://notifications"]);
    await page.waitForURL("/student/notifications");

    // 5. Log out student and log in as Teacher
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    await page.fill('input[type="text"]', "sidorov");
    await page.fill('input[type="password"]', "Passw0rd!Test");
    await page.click('button[type="submit"]');
    await page.waitForURL("/teacher/reference/disciplines");
    await expect(page.locator("text=Загрузка…")).not.toBeVisible();

    // 6. Trigger notifications deep link -> verifika://notifications (as teacher)
    await triggerTauriEvent(page, "verifika://deep-link", ["verifika://notifications"]);
    await page.waitForURL("/teacher/notifications");

    // 7. Trigger tray action event -> verifika://tray/action (notifications)
    // First navigate to home so we can observe routing
    await page.goto("/teacher/reference/disciplines");
    await expect(page.locator("text=Загрузка…")).not.toBeVisible();
    await triggerTauriEvent(page, "verifika://tray/action", "notifications");
    await page.waitForURL("/teacher/notifications");
  });
});
