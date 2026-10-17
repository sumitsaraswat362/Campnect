import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, name = "Aanya Sharma") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/app\/feed$/);
  await expect(page.getByText("Library terrace at golden hour.", { exact: false }).first()).toBeVisible();
}
async function switchAccount(page: Page, name: string) {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Switch demo account", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/app\/feed$/);
}
test.beforeEach(async ({ page }) => {
  const forbidden: string[] = [];
  const errors: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (/^\/(api|uploads|socket\.io)(\/|$)/.test(url.pathname) ||
      /supabase|onesignal|campnect\.perinol/.test(url.hostname) ||
      (["fetch", "xhr", "websocket"].includes(request.resourceType()) && url.origin !== "http://127.0.0.1:5000")) {
      forbidden.push(request.url());
    }
  });
  page.on("websocket", socket => forbidden.push(socket.url()));
  page.on("pageerror", error => errors.push(error.message));
  // Assertions run after the whole journey, including refresh/account switching.
  (page as any).__demoNetwork = { forbidden, errors };
});
test.afterEach(async ({ page }) => {
  const { forbidden, errors } = (page as any).__demoNetwork;
  expect(forbidden, "No API, remote data, Supabase or WebSocket connections").toEqual([]);
  expect(errors, "No browser runtime failures").toEqual([]);
});

test("production login, protected routes, refresh, account switching and logout", async ({ page }) => {
  await page.goto("/app/feed");
  await expect(page).toHaveURL(/login/);
  await login(page);
  await page.reload();
  await expect(page).toHaveURL(/\/app\/feed$/);
  await switchAccount(page, "Kabir Mehta");
  await page.goto("/app/profile");
  await expect(page.getByText("Kabir Mehta", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Kabir Mehta", { exact: true }).first()).toBeVisible();
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page).toHaveURL(/login/);
});

test("production posting persists after refresh and account switching", async ({ page }) => {
  await login(page);
  await page.goto("/app/create/post");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "publishing-check.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByPlaceholder("Write a caption…").fill("Publishing works without a database.");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/feed$/);
  await expect(page.getByText("Publishing works without a database.", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Publishing works without a database.", { exact: true }).first()).toBeVisible();
  await switchAccount(page, "Kabir Mehta");
  await expect(page.getByText("Publishing works without a database.", { exact: true }).first()).toBeVisible();
});

test("production messaging persists and can be read and replied to by another demo account", async ({ page }) => {
  await login(page);
  await page.goto("/app/chat/chat0");
  await page.getByPlaceholder("Send message…").fill("Static production demo message");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Static production demo message", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Static production demo message", { exact: true })).toBeVisible();
  await switchAccount(page, "Kabir Mehta");
  await page.goto("/app/chat/chat0");
  await expect(page.getByText("Static production demo message", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Send message…").fill("Reply from a second local account");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await switchAccount(page, "Aanya Sharma");
  await page.goto("/app/chat/chat0");
  await expect(page.getByText("Reply from a second local account", { exact: true })).toBeVisible();
});

test("direct production SPA navigation loads at mobile and desktop sizes without any backend", async ({ page }) => {
  await login(page);
  const routes = [
    "/app/feed", "/app/search", "/app/glimpse", "/app/clips", "/app/profile",
    "/app/profile/kabir.mehta", "/app/post/p2", "/app/events", "/app/events/event6",
    "/app/communities", "/app/community/builders-circle", "/app/chat", "/app/chat/chat0",
    "/app/notifications", "/app/settings", "/app/settings/security", "/app/settings/privacy",
    "/app/settings/saved", "/app/settings/help", "/app/settings/about", "/app/create",
  ];
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
    await expect(page.getByText("Campnect needs a refresh", { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await page.locator("body").innerText()).trim().length, { message: route }).toBeGreaterThan(8);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["/app/feed", "/app/chat/chat0", "/app/profile", "/app/events", "/app/search"]) {
    expect((await page.goto(route))?.status()).toBe(200);
    await expect(page.getByText("Campnect needs a refresh", { exact: true })).toHaveCount(0);
  }
});
