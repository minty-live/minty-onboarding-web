// The auto-saved draft on a phone and a desktop (lib/stepDraft.ts, components/StepDraft.tsx):
// type on the open step, reload, and the step opens with it at once - no notice, nothing to answer
// (the user, 2026-11-24). Nothing is wider than the screen.
//
// NEEDS NO CREDENTIALS AND NO BACKEND: the onboarding API is answered by page.route() (GET /state
// rebuilds the company; everything else answers `{}`), and the tab's token is an unsigned one the
// wizard only reads (`user_id`, `entity_id`) - nothing verifies it, because nothing real is called.

import { expect, test, type Page, type Route } from "@playwright/test";
import { reachable } from "./helpers";
import { BASE_URL } from "./urls";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "e2e-drafts-user",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

const STATE = {
  entity_id: ENTITY,
  entity: { name: "Olive & Vine", country: "c-hk", currency: "cur-hkd", phone: "", email: "" },
  modules: ["PETTY_CASH"],
  saved_step: 1,
  invites: [],
};

const CORS = {
  "access-control-allow-origin": BASE_URL,
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
};

async function stubApi(page: Page) {
  await page.route(/\/api\/(onboarding|handoff)\//, (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.url().includes("/api/onboarding/state?") ? STATE : {};
    return route.fulfill({ status: 200, headers: CORS, json: body });
  });
  // A plain reload of this tab: its token and company are in sessionStorage.
  await page.addInitScript(
    ([token, entity]) => {
      if (!window.sessionStorage.getItem("minty_onboarding_token")) {
        window.sessionStorage.setItem("minty_onboarding_token", token);
        window.sessionStorage.setItem("minty_onboarding_entity", entity);
      }
    },
    [TOKEN, ENTITY],
  );
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeEach(async () => {
  test.skip(!(await reachable(BASE_URL)), `The wizard is not answering on ${BASE_URL}`);
});

for (const width of [360, 1440] as const) {
  test(`a reload puts the typed step back at once, with no notice, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubApi(page);
    await page.goto("/");

    const name = page.getByLabel(/Entity Name/);
    await expect(name).toHaveValue("Olive & Vine");
    await name.fill("Olive & Vine Two");
    // Kept 2 s after the last change, in this browser only.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(window.localStorage).some((k) => k.startsWith("minty:draft:1:")),
        ),
      )
      .toBe(true);

    await page.reload();
    await expect(name).toHaveValue("Olive & Vine Two");
    await expect(page.locator("[data-draft-notice]")).toHaveCount(0);
    await expect(page.getByText(/unsaved changes/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
    expect(await pageOverflow(page), "the step fits the screen").toBeLessThanOrEqual(0);
  });
}
