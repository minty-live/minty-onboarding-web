// The account-code lists reload every time their step opens (the user, 2026-11-26). They used to load
// once per session (accountLoadedRef / pettyCodesLoadedRef / billLoadedRef), so after Auto Fill or a
// change on Accounting Setup, steps 6 and 8 kept showing the old list. An answer that arrives after
// a newer one (the step was left and opened again) is ignored.
//
// The whole wizard is mounted with fetch stubbed, as StepDraft.test.tsx does.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDraftsForTests } from "@minty/shared/drafts";

import OnboardingApp from "../OnboardingApp";
import { ToastProvider } from "../Toast";
import { TAB_ENTITY_KEY, TAB_TOKEN_KEY } from "../../lib/wizardSession";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const b64url = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const TOKEN = `${b64url({ alg: "HS256" })}.${b64url({
  user_id: "u-1",
  entity_id: ENTITY,
  scope: "onboarding",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stateAt = (step: number) => ({
  entity_id: ENTITY,
  entity: { name: "Olive & Vine", country: "c-hk", currency: "cur-hkd", phone: "", email: "" },
  modules: ["PETTY_CASH", "PAYMENT_REQUEST"],
  saved_step: step,
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
});

/** Each read of a list answers the next of these (the last one repeats). */
let pettyAnswers: Array<() => Promise<Response>>;
let billAnswers: Array<() => Promise<Response>>;
let reads: Record<string, number>;
let step: number;

const LIST_ONE = [{ code: "6003", name: "Rent" }];
const LIST_TWO = [
  { code: "6003", name: "Rent" },
  { code: "6100", name: "Staff meals" },
];

function next<T>(queue: Array<() => T>): T {
  return (queue.length > 1 ? queue.shift()! : queue[0])();
}

beforeEach(() => {
  resetDraftsForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(TAB_TOKEN_KEY, TOKEN);
  window.sessionStorage.setItem(TAB_ENTITY_KEY, ENTITY);
  reads = {};
  pettyAnswers = [
    async () => json({ codes: LIST_ONE, selected_codes: ["6003"] }),
    async () => json({ codes: LIST_TWO, selected_codes: ["6003"] }),
  ];
  billAnswers = [
    async () =>
      json({
        connected: false,
        bill_codes: LIST_ONE,
        selected_codes: ["6003"],
        default_all: false,
      }),
    async () =>
      json({
        connected: false,
        bill_codes: LIST_TWO,
        selected_codes: ["6003"],
        default_all: false,
      }),
  ];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      reads[path] = (reads[path] ?? 0) + 1;
      if (path === "/api/onboarding/state") return json(stateAt(step));
      if (path === "/api/onboarding/petty-cash-codes") return next(pettyAnswers);
      if (path === "/api/onboarding/bill-codes") return next(billAnswers);
      if (path === "/api/onboarding/server-time") return json({ today: "2026-11-26" });
      if (path === "/api/onboarding/opening-balance/skip") return json({ skipped: true });
      return json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function mount() {
  return render(
    <ToastProvider>
      <OnboardingApp />
    </ToastProvider>,
  );
}

const back = () => screen.getByRole("button", { name: /^Back$/ });

describe("the account-code lists reload when their step opens", () => {
  it("Petty Cash's list is read again on a second visit, and shows what is there now", async () => {
    step = 6;
    mount();
    expect(await screen.findByText("6003 · Rent")).toBeInTheDocument();
    expect(reads["/api/onboarding/petty-cash-codes"]).toBe(1);

    fireEvent.click(back());
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    expect(await screen.findByText("6100 · Staff meals")).toBeInTheDocument();
    expect(reads["/api/onboarding/petty-cash-codes"]).toBe(2);
  });

  it("Payment Request's list is read again on a second visit", async () => {
    step = 8;
    mount();
    expect(await screen.findByRole("checkbox", { name: "6003" })).toBeInTheDocument();
    expect(reads["/api/onboarding/bill-codes"]).toBe(1);

    fireEvent.click(back());
    expect(await screen.findByText("6003 · Rent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));

    expect(await screen.findByRole("checkbox", { name: "6100" })).toBeInTheDocument();
    expect(reads["/api/onboarding/bill-codes"]).toBe(2);
  });

  it("an answer that arrives after a newer one is ignored", async () => {
    step = 6;
    let releaseFirst: (r: Response) => void = () => {};
    pettyAnswers = [
      () => new Promise<Response>((resolve) => (releaseFirst = resolve)),
      async () => json({ codes: LIST_TWO, selected_codes: ["6003"] }),
    ];
    mount();
    await waitFor(() => expect(reads["/api/onboarding/petty-cash-codes"]).toBe(1));

    fireEvent.click(back());
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText("6100 · Staff meals")).toBeInTheDocument();

    releaseFirst(json({ codes: [{ code: "9999", name: "Old list" }], selected_codes: [] }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("9999 · Old list")).not.toBeInTheDocument();
    expect(screen.getByText("6100 · Staff meals")).toBeInTheDocument();
  });
});
