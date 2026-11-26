// "+ Add account" on Petty Cash's Account Code list, and the lists read again on every visit (the
// user, 2026-11-26), on a phone and a desktop. Minty keeps the books: the account is added in a
// pop-up (POST /accounting/accounts), the list is read again and the new account comes ticked; going
// back a step and on again reads the list again (it used to load once per session).
//
// NEEDS NO CREDENTIALS AND NO BACKEND, as drafts.spec.ts: the onboarding API is answered by
// page.route() and the tab's token is an unsigned one the wizard only reads.

import { expect, test, type Page, type Route } from "@playwright/test";
import { reachable } from "./helpers";
import { BASE_URL } from "./urls";

const ENTITY = "b16c5d7e-9f0a-4b2c-8d3e-4f5a6b7c8d9e";
const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "e2e-add-account-user",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;
const CORS = {
  "access-control-allow-origin": BASE_URL,
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

type Seen = { codesReads: number; created: unknown[] };

async function stubApi(page: Page): Promise<Seen> {
  const seen: Seen = { codesReads: 0, created: [] };
  const codes = [{ code: "6003", name: "Rent" }];
  await page.route(/\/api\/(onboarding|handoff)\//, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
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
        modules: ["PETTY_CASH", "PAYMENT_REQUEST"],
        saved_step: 6,
        invites: [],
        accounting: {
          mode: "minty",
          business_type: "retail",
          uses_sales_cash: true,
          business_answered: true,
          sells_cash: true,
          sells_electronic: false,
          sells_delivery: false,
          sales_chosen: true,
        },
        sales_methods: { electronic: [], delivery: [] },
        opening_skipped: true,
      };
    else if (path === "/api/onboarding/petty-cash-codes" && req.method() === "GET") {
      seen.codesReads += 1;
      body = { codes, selected_codes: ["6003"] };
    } else if (path === "/api/onboarding/accounting" && req.method() === "GET")
      body = {
        mode: "minty",
        types: [
          { value: "expense", label: "Expense" },
          { value: "direct_costs", label: "Direct costs" },
          { value: "overheads", label: "Overheads" },
        ],
        next_code: { expense: "6100", direct_costs: "5100", overheads: "6100" },
        accounts: { sales: [], expense: [] },
      };
    else if (path === "/api/onboarding/accounting/accounts" && req.method() === "POST") {
      const sent = req.postDataJSON() as { code: string; name: string };
      seen.created.push(sent);
      codes.push({ code: sent.code, name: sent.name });
      return route.fulfill({
        status: 201,
        headers: CORS,
        json: { account: { code: sent.code, name: sent.name }, message: `${sent.name} added.` },
      });
    } else if (path === "/api/onboarding/opening-balance/skip") body = { skipped: true };
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
  return seen;
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeEach(async () => {
  test.skip(!(await reachable(BASE_URL)), `The wizard is not answering on ${BASE_URL}`);
});

for (const width of [360, 1440] as const) {
  test(`an account added in place comes ticked, and the list is read on every visit, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const seen = await stubApi(page);
    await page.goto("/");
    await expect(page.getByText("6003 · Rent")).toBeVisible();
    expect(seen.codesReads).toBe(1);

    for (const name of ["+ Add account", "Go to Account Settings"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.height, `"${name}" is a 44px target`).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("button", { name: "+ Add account" }).click();
    const dialog = page.getByRole("dialog", { name: "Add an account" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Code/)).toHaveValue("6100");
    expect(await pageOverflow(page), "the pop-up fits the screen").toBeLessThanOrEqual(0);
    await dialog.getByLabel(/^Name/).fill("Staff meals");
    await dialog.getByRole("button", { name: "Add account" }).click();

    await expect(dialog).toHaveCount(0);
    expect(seen.created).toEqual([
      expect.objectContaining({ code: "6100", name: "Staff meals", type: "expense" }),
    ]);
    const row = page.locator(".acc-row", { hasText: "6100 · Staff meals" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("checkbox")).toBeChecked();

    // back a step and on again: the list is read again
    const readsBefore = seen.codesReads;
    await page.getByRole("button", { name: /^Back$/ }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByText("6100 · Staff meals")).toBeVisible();
    await expect.poll(() => seen.codesReads).toBeGreaterThan(readsBefore);
  });
}
