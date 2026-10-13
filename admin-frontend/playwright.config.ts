import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the admin console (e2e/*.spec.ts).
 * The API is a fake inside the browser (e2e/fake-api.ts), so no backend, Docker or Google is needed:
 * only this site's own dev server, started here on port 5175 without a Google client ID.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5175",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5175",
    url: "http://localhost:5175",
    reuseExistingServer: true,
    // Empty client ID: the dev sign-in form is used, never Google.
    env: { VITE_GOOGLE_CLIENT_ID: "" },
  },
});
