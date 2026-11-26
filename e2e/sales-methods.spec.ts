// Petty Cash's Sales methods (step 5) on a phone and a desktop (owner, 2026-11-26): the methods are
// full-width rows with a grip handle and a delete; Add fills once something is typed, keeps the
// focus in the field and lights the new row for a moment; Auto Fill shimmers after 5 seconds with
// nothing added and stops on a click; a finger drags a row by its handle.
//
// NEEDS NO CREDENTIALS AND NO BACKEND, as drafts.spec.ts: the onboarding API is answered by
// page.route() and the tab's token is an unsigned one the wizard only reads.

import { expect, test, type Page, type Route } from "@playwright/test";
import { reachable } from "./helpers";
import { BASE_URL } from "./urls";

const ENTITY = "8d3f2e4c-6b7a-4c9d-8e1f-2a3b4c5d6e7f";
const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "e2e-sales-user",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

const CORS = {
  "access-control-allow-origin": BASE_URL,
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

async function stubApi(page: Page, methods: { electronic: string[]; delivery: string[] }) {
  await page.route(/\/api\/(onboarding|handoff)\//, (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    const body =
      path === "/api/onboarding/state"
        ? {
            entity_id: ENTITY,
            entity: {
              name: "Olive & Vine",
              country: "c-hk",
              currency: "cur-hkd",
              phone: "",
              email: "",
            },
            modules: ["PETTY_CASH"],
            saved_step: 5,
            invites: [],
            accounting: {
              mode: "minty",
              business_type: "retail",
              uses_sales_cash: true,
              business_answered: true,
              sells_cash: true,
              sells_electronic: true,
              sells_delivery: true,
              sales_chosen: true,
            },
            sales_methods: methods,
          }
        : {};
    return route.fulfill({ status: 200, headers: CORS, json: body });
  });
  await page.addInitScript(
    ([token, entity]) => {
      window.sessionStorage.setItem("minty_onboarding_token", token);
      window.sessionStorage.setItem("minty_onboarding_entity", entity);
      window.localStorage.clear();
    },
    [TOKEN, ENTITY],
  );
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const names = (page: Page, list: string) =>
  page
    .getByRole("list", { name: `${list} methods` })
    .locator(".method-name")
    .allInnerTexts();

test.beforeEach(async () => {
  test.skip(!(await reachable(BASE_URL)), `The wizard is not answering on ${BASE_URL}`);
});

for (const width of [360, 1440] as const) {
  test(`adding a method: Add fills, the field keeps the focus, the new row lights, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubApi(page, { electronic: ["Visa"], delivery: [] });
    await page.goto("/");
    const field = page.getByPlaceholder("Enter payment method name");
    const add = page.getByRole("button", { name: "Add" }).first();
    // Empty: disabled, and it looks it - grey, a not-allowed cursor, not the teal fill.
    await expect(add).toBeDisabled();
    const look = () =>
      add.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { cursor: cs.cursor, background: cs.backgroundColor };
      });
    const teal = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--color-action-primary)";
      document.body.append(probe);
      const bg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return bg;
    });
    const off = await look();
    expect(off.cursor).toBe("not-allowed");
    expect(off.background).not.toBe(teal);
    expect(off.background).not.toBe("rgba(0, 0, 0, 0)");

    await field.fill("PayMe");
    await expect(add).toBeEnabled();
    await expect.poll(async () => (await look()).background).toBe(teal);
    await add.click();

    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    expect(await names(page, "Electronic")).toEqual(["Visa", "PayMe"]);
    const fresh = page.locator(".method-row.is-new");
    await expect(fresh).toHaveText(/PayMe/);
    await expect(fresh).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByText(/added/i)).toHaveCount(0); // no toast
    expect(await pageOverflow(page), "the step fits the screen").toBeLessThanOrEqual(0);
  });

  test(`Auto Fill shimmers after 5 s with nothing added and stops on a click, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubApi(page, { electronic: [], delivery: [] });
    await page.goto("/");
    const autoFill = page.locator(".autofill-btn");
    await expect(autoFill).toBeVisible();
    await expect(autoFill).not.toHaveClass(/is-shimmer/);
    await expect(autoFill).toHaveClass(/is-shimmer/, { timeout: 7000 });
    await autoFill.click();
    await expect(autoFill).not.toHaveClass(/is-shimmer/);
    expect(await names(page, "Electronic")).toContain("Bank Transfer");
  });
}

test.describe("on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 800 } });

  test("handle and delete are 44px targets, and a finger drags a row by its handle", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "touch is driven through Chrome's DevTools protocol");
    await stubApi(page, { electronic: ["Visa", "Mastercard", "Alipay"], delivery: [] });
    await page.goto("/");
    const list = page.getByRole("list", { name: "Electronic methods" });
    await expect(list.locator(".method-row")).toHaveCount(3);

    const handle = list.getByRole("button", { name: "Drag to reorder Visa" });
    const del = list.getByRole("button", { name: "Delete Visa" });
    for (const [label, el] of [
      ["the handle", handle],
      ["delete", del],
    ] as const) {
      const box = await el.boundingBox();
      expect(box!.width, `${label} is 44px wide`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${label} is 44px tall`).toBeGreaterThanOrEqual(44);
    }

    // Drag Visa by its handle to below Alipay, with a finger.
    const from = (await handle.boundingBox())!;
    const target = (await list.locator(".method-row").nth(2).boundingBox())!;
    const x = from.x + from.width / 2;
    const y0 = from.y + from.height / 2;
    const y1 = target.y + target.height * 0.75;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: y === undefined ? [] : [{ x, y }],
      });
    await touch("touchStart", y0);
    for (let i = 1; i <= 8; i++) await touch("touchMove", y0 + ((y1 - y0) * i) / 8);
    await touch("touchEnd");

    await expect.poll(() => names(page, "Electronic")).toEqual(["Mastercard", "Alipay", "Visa"]);
    expect(await pageOverflow(page), "the list fits the screen").toBeLessThanOrEqual(0);
  });
});

test("a mouse drags a row by its handle on a desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubApi(page, { electronic: ["Visa", "Mastercard", "Alipay"], delivery: [] });
  await page.goto("/");
  const list = page.getByRole("list", { name: "Electronic methods" });
  await expect(list.locator(".method-row")).toHaveCount(3);
  const from = (await list.getByRole("button", { name: "Drag to reorder Alipay" }).boundingBox())!;
  const target = (await list.locator(".method-row").nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, target.y + target.height / 4, { steps: 8 });
  await expect(list.locator(".method-row.is-dragging")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => names(page, "Electronic")).toEqual(["Alipay", "Visa", "Mastercard"]);
  await expect(list.locator(".method-row.is-dragging")).toHaveCount(0);
});
