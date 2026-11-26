// The wizard's copy rule (owner, 2026-11-26): grey subtitles went unread, so on every screen
// - the subtitle is ONE short sentence;
// - anything the person must know is in ONE ⓘ box (`.info-box`) next to the list or fields;
// - no other grey help lines: no Auto Fill captions, no bottom notes, no field hints, no section
//   sub-lines, no ⓘ tooltips.
// Each screen is opened on a phone with the API stubbed (as drafts.spec.ts) and checked.
//
// NEEDS NO CREDENTIALS AND NO BACKEND.

import { expect, test, type Page, type Route } from "@playwright/test";
import { reachable } from "./helpers";
import { BASE_URL } from "./urls";

const ENTITY = "a05b4c6d-8e9f-4a1b-8c2d-3e4f5a6b7c8d";
const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "e2e-copy-user",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;
const CORS = {
  "access-control-allow-origin": BASE_URL,
  "access-control-allow-headers": "authorization, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

type Acc = Record<string, unknown>;
const MINTY: Acc = {
  mode: "minty",
  business_type: "retail",
  uses_sales_cash: true,
  business_answered: true,
  sells_cash: true,
  sells_electronic: true,
  sells_delivery: true,
  sales_chosen: true,
};
const XERO: Acc = {
  mode: "xero",
  business_type: null,
  uses_sales_cash: true,
  business_answered: false,
  sales_chosen: false,
};
const expense = (id: string, code: string, name: string, xero = false) => ({
  id,
  code,
  name,
  type: "expense",
  type_label: "Expense",
  description: "",
  kind: "expense",
  group: "running_costs",
  source: xero ? "xero" : "user",
  used: true,
  auto_filled: false,
  is_system: false,
  from_xero: xero,
});
const CODES = [
  { code: "6003", name: "Rent" },
  { code: "6010", name: "Cleaning" },
];
const ACCOUNT_CODES = {
  connected: true,
  bank_accounts: [
    { id: "bank-petty", label: "Petty Cash Bank" },
    { id: "bank-deposit", label: "Deposit Bank" },
  ],
  director_accounts: [{ id: "acc-director", label: "880 · Director Loan" }],
  cash_sale_accounts: [{ id: "acc-cash-sale", label: "200 · Cash Sales" }],
  discrepancy_accounts: [{ id: "acc-discrepancy", label: "499 · Cash Discrepancy" }],
  expense_codes: [{ code: "400", name: "Advertising" }],
  contacts: [
    { id: "c-dir", label: "Director" },
    { id: "c-cash", label: "Cash Sales" },
    { id: "c-disc", label: "Discrepancy" },
  ],
  mapping_defaults: {
    pettycash: "bank-petty",
    deposit: "bank-deposit",
    director: "acc-director",
    cash_sale: "acc-cash-sale",
    discrepancy: "acc-discrepancy",
  },
  contact_defaults: { director: "c-dir", cash_sale: "c-cash", discrepancy: "c-disc" },
  default_all: true,
  selected_codes: [],
};

type Screen = {
  step: number;
  acc: Acc;
  xero?: boolean;
  modules?: string[];
  methods?: { electronic: string[]; delivery: string[] };
  accounts?: ReturnType<typeof expense>[];
  /** Gets from the step's first screen to the one checked. */
  open?: (page: Page) => Promise<void>;
  subtitle: string | null;
  box: string | RegExp | null;
};

const nextTo = (heading: string) => async (page: Page) => {
  // the screen's own reads settle first, or Save & Next lands before the page can save
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /Save & Next/ })
    .first()
    .click();
  await expect(page.getByText(heading).first()).toBeVisible();
};

const SCREENS: Record<string, Screen> = {
  "1 Basic Information": {
    step: 1,
    acc: MINTY,
    subtitle: "Let's start by creating your first entity.",
    box: null,
  },
  "2 Free trial": {
    step: 2,
    acc: MINTY,
    subtitle: "Pick the modules to try for free.",
    box: /^Each module has its own .+ free trial\. You can turn on the other one later\. No payment is required today\.$/,
  },
  "3 User Invite": {
    step: 3,
    acc: MINTY,
    open: async (page) => {
      await page.getByRole("button", { name: "Go to invite" }).click();
    },
    subtitle: "Invite the people who will help you set up Minty.",
    box: "You can add or remove users any time in Settings → Users.",
  },
  "4.1 How Minty works": {
    step: 4,
    acc: {},
    subtitle: "Choose how Minty keeps your books.",
    box: "Not sure? Start with Minty only — you can connect Xero later in Settings.",
  },
  "4.2 Business type": {
    step: 4,
    acc: {
      mode: "minty",
      business_type: null,
      uses_sales_cash: null,
      business_answered: false,
      sales_chosen: false,
    },
    subtitle: "Pick the one closest to your business.",
    box: "We'll suggest accounts for your industry on the next screens. Nothing is added until you press Auto Fill. You can change your business type or any account later in Settings.",
  },
  "4 Sales accounts": {
    step: 4,
    acc: { ...MINTY, sales_chosen: false, sells_electronic: null, sells_delivery: null },
    subtitle: "How do your customers pay you?",
    box: "Tick each one you take — your daily report will ask for these amounts every day. You can change this later in Settings.",
  },
  "4.4 Expense categories": {
    step: 4,
    acc: MINTY,
    accounts: [expense("a1", "6003", "Rent"), expense("a2", "6010", "Cleaning")],
    subtitle: "Choose the categories that apply to your business.",
    box: "Staff pick from these when they add an expense.",
  },
  "5 Sales methods": {
    step: 5,
    acc: MINTY,
    methods: { electronic: ["Visa"], delivery: ["Keeta"] },
    subtitle: "Add the payment and delivery channels you accept.",
    box: "Only the sales accounts you ticked in Accounting Setup are listed here. These become the fields on your daily report.",
  },
  "5 Sales methods, Cash only": {
    step: 5,
    acc: { ...MINTY, sells_electronic: false, sells_delivery: false },
    subtitle: "Add the payment and delivery channels you accept.",
    box: "Only Sales - Cash is ticked in Accounting Setup, so there is nothing to add here. Tick Sales - Electronic Payment or Sales - Delivery there to add methods.",
  },
  "5 Opening Balance": {
    step: 5,
    acc: MINTY,
    methods: { electronic: ["Visa"], delivery: [] },
    open: nextTo("Petty Cash Opening Balance"),
    subtitle: "Tell Minty how much cash you're starting with.",
    // no "Watch how (1 min)" while lib/videos.ts has no video
    box: "Count the cash in your petty cash box at the start of that day and enter it here. Minty tracks every expense and top-up from this amount.",
  },
  "6 Petty Cash Account Code": {
    step: 6,
    acc: MINTY,
    modules: ["PETTY_CASH", "PAYMENT_REQUEST"],
    subtitle: null,
    box: "These come from your Accounting Setup list. Tick the ones staff can choose when they add a petty cash expense. Payment Request has its own list, so you can pick differently there.",
  },
  "8 Payment Account Code": {
    step: 8,
    acc: MINTY,
    modules: ["PETTY_CASH", "PAYMENT_REQUEST"],
    subtitle: null,
    box: "These come from your Accounting Setup list. Tick the ones staff can choose when they add a payment request. Petty Cash has its own list.",
  },
  "4 Xero Integration": {
    step: 4,
    acc: XERO,
    xero: true,
    subtitle: "Connect the Xero organisation this company uses.",
    box: null,
  },
  "X3 Xero expense accounts": {
    step: 4,
    acc: XERO,
    xero: true,
    accounts: [expense("x1", "400", "Advertising", true), expense("x2", "404", "Bank Fees", true)],
    open: nextTo("Which expense accounts"),
    subtitle: "Tick the accounts staff can pick from.",
    box: "These come from your Xero chart of accounts. Missing one? Create it in Xero, then press Refresh. Accounts you don't tick stay in Xero; they just won't appear in Minty.",
  },
  "6 Account Code Setting (Xero)": {
    step: 6,
    acc: XERO,
    xero: true,
    subtitle: "The Xero accounts Petty Cash posts to.",
    box: "Petty Cash Account is the Xero bank account that records petty cash; add one in Xero first if you need to. Cash Discrepancy records extra or missing cash found at the count — tips or lost receipts, for example.",
  },
  "7 Contact Setup": {
    step: 7,
    acc: XERO,
    xero: true,
    subtitle: "Choose the Xero contacts Petty Cash uses.",
    box: "Petty Cash records the director's account, cash sales and cash discrepancies against these contacts.",
  },
};

async function stubApi(page: Page, sc: Screen) {
  await page.route(/\/api\/(onboarding|handoff)\//, (route: Route) => {
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
        modules: sc.modules ?? ["PETTY_CASH"],
        saved_step: sc.step,
        invites: [],
        accounting: sc.acc,
        sales_methods: sc.methods ?? { electronic: [], delivery: [] },
        ...(sc.xero ? { xero: { connected: true, org: "Olive & Vine Ltd" } } : {}),
      };
    else if (path === "/api/onboarding/accounting")
      body = {
        ...sc.acc,
        connected: sc.acc.mode === "xero",
        accounts: { sales: [], expense: sc.accounts ?? [] },
        slots: {},
        slots_ready: 0,
        next_code: { expense: "6100" },
        types: [{ value: "expense", label: "Expense" }],
      };
    else if (path === "/api/onboarding/petty-cash-codes")
      body = { codes: CODES, selected_codes: ["6003"] };
    else if (path === "/api/onboarding/bill-codes")
      body = { connected: true, bill_codes: CODES, selected_codes: ["6003"], default_all: false };
    else if (
      path.startsWith("/api/onboarding/account-codes") ||
      path.startsWith("/api/onboarding/contacts")
    )
      body = ACCOUNT_CODES;
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

/** Sentences in a line: ends of `.`, `?` or `!` followed by a space or the end. */
const sentences = (text: string) => (text.trim().match(/[.?!](\s|$)/g) ?? []).length;

test.beforeEach(async () => {
  test.skip(!(await reachable(BASE_URL)), `The wizard is not answering on ${BASE_URL}`);
});

test.use({ viewport: { width: 360, height: 900 } });

for (const [name, sc] of Object.entries(SCREENS)) {
  test(`${name}: one-sentence subtitle, one ⓘ box, no other grey help`, async ({ page }) => {
    await stubApi(page, sc);
    await page.goto("/");
    await expect(page.locator(".step-nav, .cta-stack").first()).toBeVisible();
    if (sc.open) await sc.open(page);

    const subtitle = page.locator(".page-head > p");
    if (sc.subtitle === null) {
      await expect(subtitle).toHaveCount(0);
    } else {
      await expect(subtitle).toHaveText(sc.subtitle);
      expect(sentences(sc.subtitle), "the subtitle is one sentence").toBe(1);
    }

    const box = page.locator(".info-box");
    if (sc.box === null) {
      await expect(box).toHaveCount(0);
    } else {
      await expect(box).toHaveCount(1);
      await expect(box).toHaveText(sc.box);
    }

    for (const gone of [
      ".autofill-hint",
      ".acs-note",
      ".pc-hint",
      ".pc-section-sub",
      ".acc-sub",
      ".info-tip",
      ".acs-notice",
      ".acs-sa-note:not(.info-box)",
      ".acs-hint:not(.acs-coa-hint)",
    ]) {
      await expect(page.locator(gone), `no ${gone}`).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      "the screen fits",
    ).toBeLessThanOrEqual(0);
  });
}
