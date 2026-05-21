import { expect, test } from "@playwright/test";

test.describe("Public smoke", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Get a Bud|Bud/i);
  });

  test("sign-in page is reachable", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("register page is reachable", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create|register/i })).toBeVisible();
  });
});
