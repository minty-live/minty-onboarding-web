// Changes wait for their Save, on a phone and a desktop (plan items 4 and 6, 2026-11-20):
// - step 4's expense list holds its ticks, edits, adds and removes, asks before removing an account
//   the company has, and sends ONE PUT /accounting/accounts on Save & Next;
// - step 3 asks "Cancel the invitation to <email>?" before cancelling a sent invitation.
// Nothing is wider than the screen and the question's buttons are 44px targets.
//
// NEEDS NO CREDENTIALS AND NO BACKEND, as drafts.spec.ts: the onboarding API is answered by
// page.route() and the tab's token is an unsigned one the wizard only reads.

import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { reachable } from "./helpers";
import { BASE_URL } from "./urls";

const ENTITY = "6c0a4f3e-2b8d-4f5e-9a51-0e2d7c1b9f44";
const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "e2e-held-user",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

const CORS = {
  "access-control-allow-origin": BASE_URL,
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const expense = (id: string, code: string, name: string, source = "user") => ({
  id,
  code,
  name,
  type: "expense",
  type_label: "Expense",
  description: "",
  kind: "expense",
  group: "running_costs",
  source,
  used: true,
  auto_filled: false,
  is_system: false,
  from_xero: false,
});

const SETUP = {
  mode: "minty",
  business_type: "retail",
  uses_sales_cash: true,
  business_answered: true,
  sells_cash: true,
  sells_electronic: true,
  sells_delivery: false,
  sales_chosen: true,
  connected: false,
  accounts: {
    sales: [],
    expense: [expense("a-rent", "6003", "Rent", "template"), expense("a-misc", "6099", "Sundries")],
  },
  slots: {},
  slots_ready: 0,
  next_code: { expense: "6100", direct_costs: "5100", overheads: "6100" },
  types: [
    { value: "direct_costs", label: "Direct costs" },
    { value: "expense", label: "Expense" },
    { value: "overheads", label: "Overheads" },
  ],
};

function stateAt(step: number) {
  return {
    entity_id: ENTITY,
    entity: { name: "Olive & Vine", country: "c-hk", currency: "cur-hkd", phone: "", email: "" },
    modules: ["PETTY_CASH"],
    saved_step: step,
    invites:
      step === 3
        ? [
            {
              id: "inv-1",
              email: "ada@example.com",
              role: "cashier",
              first_name: "Ada",
              last_name: "Lee",
            },
          ]
        : [],
    accounting: {
      mode: "minty",
      business_type: "retail",
      uses_sales_cash: true,
      business_answered: true,
      sells_electronic: true,
      sells_delivery: false,
      sales_chosen: true,
    },
  };
}

/** The fake API; returns every write the wizard sent (anything but a GET). */
async function stubApi(page: Page, step: number): Promise<Request[]> {
  const writes: Request[] = [];
  await page.route(/\/api\/(onboarding|handoff)\//, (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (req.method() !== "GET") writes.push(req);
    const path = new URL(req.url()).pathname;
    let body: unknown = {};
    if (path === "/api/onboarding/state") body = stateAt(step);
    else if (path === "/api/onboarding/accounting") body = SETUP;
    else if (req.method() === "PUT" && path === "/api/onboarding/accounting/accounts") body = SETUP;
    return route.fulfill({ status: 200, headers: CORS, json: body });
  });
  await page.addInitScript(
    ([token, entity]) => {
      window.sessionStorage.setItem("minty_onboarding_token", token);
      window.sessionStorage.setItem("minty_onboarding_entity", entity);
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
  test(`step 4's expense list holds its changes until Save & Next, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await stubApi(page, 4);
    await page.goto("/");
    await expect(page.getByText("What do you usually spend money on?")).toBeVisible();

    // untick Sundries, remove Rent (asked first), add one of its own
    await page.locator(".acs-exp", { hasText: "Sundries" }).locator(".acs-exp-box").click();
    await expect(page.getByRole("checkbox", { name: /Sundries/ })).not.toBeChecked();
    await page.getByRole("button", { name: "More for Rent" }).click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    const question = page.getByRole("dialog", { name: "Remove Rent?" });
    await expect(question).toBeVisible();
    expect(await pageOverflow(page), "the question fits the screen").toBeLessThanOrEqual(0);
    for (const label of ["Go back", "Remove"]) {
      const box = await question.getByRole("button", { name: label }).boundingBox();
      expect(box!.height, `"${label}" is a 44px target`).toBeGreaterThanOrEqual(44);
    }
    await question.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(".acs-exp", { hasText: "Rent" })).toHaveCount(0);

    await page.getByRole("button", { name: /Add another category/ }).click();
    await page.getByLabel(/^Name/).fill("Staff meals");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /Staff meals/ })).toBeChecked();
    expect(await pageOverflow(page), "the list fits the screen").toBeLessThanOrEqual(0);
    expect(writes.map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual([]);

    await page.getByRole("button", { name: /Save & Next/ }).click();
    await expect
      .poll(() => writes.filter((r) => r.method() === "PUT").length, { message: "one PUT" })
      .toBe(1);
    const put = writes.find((r) => r.method() === "PUT")!;
    expect(new URL(put.url()).pathname).toBe("/api/onboarding/accounting/accounts");
    expect(put.postDataJSON()).toEqual({
      entity_id: ENTITY,
      kind: "expense",
      template_ids: [],
      accounts: [{ code: "6100", name: "Staff meals", type: "expense", description: "" }],
    });
  });

  test(`step 3 asks before cancelling a sent invitation, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await stubApi(page, 3);
    await page.goto("/");
    await page.getByRole("button", { name: "Go to invite" }).click(); // the arrival prompt

    const x = page.getByRole("button", { name: "Remove" });
    const xBox = await x.boundingBox();
    expect(xBox!.height, "the X is a 44px target").toBeGreaterThanOrEqual(44);
    await x.click();
    const question = page.getByRole("dialog", {
      name: "Cancel the invitation to ada@example.com?",
    });
    await expect(question).toBeVisible();
    expect(await pageOverflow(page), "the question fits the screen").toBeLessThanOrEqual(0);
    for (const label of ["Go back", "Cancel invitation"]) {
      const box = await question.getByRole("button", { name: label }).boundingBox();
      expect(box!.height, `"${label}" is a 44px target`).toBeGreaterThanOrEqual(44);
    }
    await question.getByRole("button", { name: "Go back" }).click();
    await expect(question).toHaveCount(0);
    expect(writes).toHaveLength(0);

    await x.click();
    await page
      .getByRole("dialog", { name: "Cancel the invitation to ada@example.com?" })
      .getByRole("button", { name: "Cancel invitation" })
      .click();
    await expect
      .poll(() => writes.map((r) => new URL(r.url()).pathname))
      .toEqual(["/api/onboarding/invite/cancel"]);
    await expect(page.getByText("ada@example.com")).toHaveCount(0);
  });

  test(`step 3's arrival prompt: Skip for now goes straight to step 4, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubApi(page, 3);
    await page.goto("/");
    const prompt = page.getByRole("dialog", { name: /require accounting expertise/ });
    await expect(prompt).toBeVisible();
    await expect(prompt).not.toContainText("Xero");
    expect(await pageOverflow(page), "the prompt fits the screen").toBeLessThanOrEqual(0);
    for (const label of ["Go to invite", "Skip for now"]) {
      const box = await prompt.getByRole("button", { name: label }).boundingBox();
      expect(box!.height, `"${label}" is a 44px target`).toBeGreaterThanOrEqual(44);
    }
    await prompt.getByRole("button", { name: "Skip for now" }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByText("What do you usually spend money on?")).toBeVisible();
  });
}
