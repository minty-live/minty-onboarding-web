// Onboarding's Opening Balance page on a phone and a desktop (owner, 2026-11-26): "Start date" with
// no TODAY badge, the amount's own label, and "Skip for now" - which leaves the balance not set
// (POST /opening-balance/skip, never a 0) and moves on to the next step.
//
// NEEDS NO CREDENTIALS AND NO BACKEND, as drafts.spec.ts: the onboarding API is answered by
// page.route() and the tab's token is an unsigned one the wizard only reads.

import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { reachable } from "./helpers";
import { BASE_URL } from "./urls";

const ENTITY = "b16c5d7e-9fa0-4b2c-9d3e-4f5a6b7c8d9e";
const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "e2e-opening-user",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;
const CORS = {
  "access-control-allow-origin": BASE_URL,
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

async function stubApi(page: Page): Promise<Request[]> {
  const writes: Request[] = [];
  await page.route(/\/api\/(onboarding|handoff)\//, (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (req.method() !== "GET") writes.push(req);
    const path = new URL(req.url()).pathname;
    let body: unknown = {};
    if (path === "/api/onboarding/state")
      body = {
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
          sells_delivery: false,
          sales_chosen: true,
        },
        sales_methods: { electronic: ["Visa"], delivery: [] },
        opening_balance: null,
        opening_skipped: false,
      };
    else if (path === "/api/onboarding/opening-balance/skip") body = { skipped: true };
    else if (path === "/api/onboarding/server-time") body = { today: "2026-11-26" };
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
  return writes;
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeEach(async () => {
  test.skip(!(await reachable(BASE_URL)), `The wizard is not answering on ${BASE_URL}`);
});

for (const width of [360, 1440] as const) {
  test(`Opening Balance: Start date with no TODAY badge, and Skip for now moves on, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await stubApi(page);
    await page.goto("/");
    await expect(page.getByText("Type of sales method of your company")).toBeVisible();
    // the step's own reads settle first, or Save & Next lands before the page can save
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Save & Next/ }).click();
    await expect(page.getByText("Petty Cash Opening Balance")).toBeVisible();

    await expect(page.getByText("Start date", { exact: true })).toBeVisible();
    await expect(page.locator(".mdp-today-tag")).toHaveCount(0);
    await expect(page.getByLabel(/Cash in your petty cash box on that day/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Watch how/ })).toHaveCount(0);

    const skip = page.getByRole("button", { name: "Skip for now" });
    const box = await skip.boundingBox();
    expect(box!.height, "Skip for now is a 44px target").toBeGreaterThanOrEqual(44);
    expect(await pageOverflow(page), "the page fits the screen").toBeLessThanOrEqual(0);
    await skip.click();

    await expect(page.getByText("Petty Cash Opening Balance")).toHaveCount(0);
    const paths = writes.map((r) => new URL(r.url()).pathname);
    expect(paths).toContain("/api/onboarding/opening-balance/skip");
    expect(paths).not.toContain("/api/onboarding/opening-balance");
  });
}
