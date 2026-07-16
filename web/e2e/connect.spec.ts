import { expect, test } from "@playwright/test";

test("connect screen consumes the runtime API contracts", async ({ page }) => {
  await page.route("**/custom.css", (route) => route.fulfill({ contentType: "text/css", body: "" }));
  await page.route("**/api/config", (route) => route.fulfill({ json: { status: "ok", result: { name: "Test Stash", connections: [{ label: "Local", type: "local" }] } } }));
  await page.route("**/api/session", (route) => route.fulfill({ json: { status: "ok", result: { is_authenticated: false, backendID: "" } } }));
  await page.route("**/api/backend", (route) => route.fulfill({
    json: {
      status: "ok",
      result: {
        local: {
          type: { label: "type", type: "hidden", value: "local" },
          path: { label: "Path", type: "text", value: "/" },
        },
      },
    },
  }));
  await page.goto("/");
  await expect(page.getByText("Test Stash")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect to a storage backend" })).toBeVisible();
  await expect(page.getByLabel("Path")).toBeVisible();
});
