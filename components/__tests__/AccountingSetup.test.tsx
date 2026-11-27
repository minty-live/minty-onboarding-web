// Step 4 - Accounting Setup (Xero optional, Figma 348:1007). The API is minty-onboarding-api's
// /accounting routes; fetch is mocked here, so these pin what the screens send and show.
// Owner, 2026-11-11: three screens on each path - how Minty works, the business (or Connect), the
// expense accounts. The business type brings the sales accounts and daily closing's defaults; Petty
// Cash Settings maps a Xero company's daily-closing accounts.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepAccountingSetup } from "../steps/AccountingSetup";
import { ToastProvider } from "../Toast";
import { initialState } from "../../lib/wizardSteps";
import { StepDraftContext, type StepDraftRegistry } from "../../lib/stepDraft";
import type { AccountingForm, StepProps, WizardState } from "../../lib/types";

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let answers: Record<string, unknown>;
/** "METHOD path" -> a refusal the fake API answers instead. */
let refusals: Record<string, { status: number; body: unknown }>;
let expenseRows: ReturnType<typeof account>[];
let connected: boolean;
let bankAllSales: boolean;

const account = (id: string, code: string, name: string, type: string) => ({
  id,
  code,
  name,
  type,
  type_label: type,
  description: "",
  kind: null,
  group: null,
  source: "template",
  is_system: true,
  from_xero: false,
  used: true,
});

/** The API leaves the cash-sale slot out for a company that banks all its sales. */
function withoutCashSale() {
  const petty = account("a1", "090", "Petty Cash", "bank");
  return {
    petty_cash: { account: petty, options: [petty] },
    bank: { account: null, options: [petty] },
    discrepancy: { account: null, options: [] },
    director: { account: null, options: [] },
  };
}

function setupAnswer() {
  const petty = account("a1", "090", "Petty Cash", "bank");
  return {
    mode: "minty",
    business_type: "retail",
    uses_sales_cash: true,
    business_answered: true,
    connected: connected,
    accounts: { sales: [], expense: expenseRows },
    slots: {
      petty_cash: { account: petty, options: [petty] },
      bank: { account: null, options: [petty] },
      cash_sale: { account: null, options: [] },
      discrepancy: { account: null, options: [] },
      director: { account: null, options: [] },
    },
    slots_ready: 1,
    ...(bankAllSales ? { slots: withoutCashSale() } : {}),
    next_code: { sales: "200", expense: "400", bank: "091" },
    types: [{ value: "bank", label: "Bank" }],
  };
}

beforeEach(() => {
  calls = [];
  answers = {};
  refusals = {};
  expenseRows = [];
  connected = false;
  bankAllSales = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({
        url: path,
        method: init?.method || "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      // the whole step: the read, the Xero ticks and refresh, and 4.4's Save & Next (PUT
      // /accounting/accounts), which answer it again - unless a test refuses that call
      const key = `${init?.method || "GET"} ${path}`;
      if (refusals[key])
        return new Response(JSON.stringify(refusals[key].body), {
          status: refusals[key].status,
          headers: { "Content-Type": "application/json" },
        });
      const whole =
        /\/accounting(\/xero-accounts|\/xero-refresh)?$/.test(path) ||
        key === "PUT /api/onboarding/accounting/accounts";
      const body = whole ? setupAnswer() : (answers[path] ?? {});
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderStep(
  accounting: AccountingForm,
  modules: WizardState["modules"] = ["pettyCash"],
  xero: WizardState["xero"] = { connected: false, org: "" },
  /** The open step's draft binding (components/StepDraft.tsx); none = the step on its own. */
  drafts: StepDraftRegistry | null = null,
) {
  let state: WizardState = {
    ...initialState(),
    entity: { ...initialState().entity, id: "e-1", name: "Shop" },
    modules,
    accounting,
    xero,
  };
  const next = vi.fn();
  const saveAndExit = vi.fn();
  const set: StepProps["set"] = (patch) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  };
  const view = render(
    <StepDraftContext.Provider value={drafts}>
      <ToastProvider>
        <StepAccountingSetup
          state={state}
          set={set}
          next={next}
          back={vi.fn()}
          token="t"
          saveAndExit={saveAndExit}
          connectXero={vi.fn()}
          disconnectXero={vi.fn()}
          xeroMismatch=""
          clearXeroMismatch={vi.fn()}
          xeroChoose={false}
          clearXeroChoose={vi.fn()}
          xeroConflict={null}
          clearXeroConflict={vi.fn()}
          xeroCurrency={null}
          clearXeroCurrency={vi.fn()}
          releaseXeroConflict={vi.fn()}
        />
      </ToastProvider>
    </StepDraftContext.Provider>,
  );
  return { next, saveAndExit, view, getState: () => state };
}

/** A retail shop that has answered 4.2 and the sales accounts screen: it opens on 4.4. */
const RETAIL_CHOSEN: AccountingForm = {
  mode: "minty",
  businessType: "retail",
  usesSalesCash: true,
  sellsElectronic: true,
  sellsDelivery: false,
};

const saveAndNext = () => fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));

// Accounting Setup's own side menu (owner, 2026-11-18), as Petty Cash Settings has: its screens by
// path, the current one marked, the ones passed ticked and clickable.
describe("Accounting Setup's side menu", () => {
  const menu = () =>
    within(screen.getByRole("complementary", { name: "Accounting Setup screens" }));

  it("lists the Minty path's four screens and marks the one shown", () => {
    renderStep({ mode: "minty", businessType: null, usesSalesCash: null });
    expect(
      menu()
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining("How Minty works"),
      expect.stringContaining("Business type"),
      expect.stringContaining("Sales accounts"),
      expect.stringContaining("Expense accounts"),
    ]);
    expect(menu().getByRole("button", { name: /Business type/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(menu().getByRole("button", { name: /Sales accounts/ })).toBeDisabled();
  });

  it("goes back to a screen already passed", async () => {
    renderStep({ mode: "minty", businessType: null, usesSalesCash: null });
    fireEvent.click(menu().getByRole("button", { name: /How Minty works/ }));
    expect(await screen.findByText("How would you like Minty to work?")).toBeInTheDocument();
  });

  it("goes forward again to any screen already reached", async () => {
    // A company that has chosen its sales accounts opens on Expense accounts.
    renderStep(RETAIL_CHOSEN);
    const expense = () => menu().getByRole("button", { name: /Expense accounts/ });
    await waitFor(() => expect(expense()).toHaveAttribute("aria-current", "step"));
    fireEvent.click(menu().getByRole("button", { name: /Business type/ }));
    expect(await screen.findByText("What best describes your business?")).toBeInTheDocument();
    // the ones between are ticked and clickable, the furthest one too
    expect(menu().getByRole("button", { name: /Sales accounts/ })).toBeEnabled();
    expect(expense()).toBeEnabled();
    fireEvent.click(expense());
    await waitFor(() => expect(expense()).toHaveAttribute("aria-current", "step"));
  });

  it("lists the Xero path's three screens", async () => {
    renderStep({ mode: "xero", businessType: null, usesSalesCash: null });
    await screen.findByText("Xero Integration");
    expect(
      menu()
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining("How Minty works"),
      expect.stringContaining("Connect to Xero"),
      expect.stringContaining("Expense accounts"),
    ]);
  });
});

describe("4.1 How would you like Minty to work?", () => {
  it("asks for a choice before moving on", () => {
    renderStep({ mode: null, businessType: null, usesSalesCash: null });
    saveAndNext();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose how Minty should work to continue.",
    );
    expect(calls).toEqual([]);
  });

  it("Connect with Xero saves the choice and opens Connect to Xero", async () => {
    const { getState } = renderStep({ mode: null, businessType: null, usesSalesCash: null });
    fireEvent.click(screen.getByRole("radio", { name: /Connect with Xero/ }));
    saveAndNext();
    expect(await screen.findByText("Xero Integration")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({
      url: "/api/onboarding/accounting/mode",
      body: { entity_id: "e-1", mode: "xero" },
    });
    expect(getState().accounting?.mode).toBe("xero");
  });

  it("counts Connect to Xero as one of step 4's screens", async () => {
    // Mode, X1 (Connect), X3: the side menu marks X1, the second of three. No "N of M" line
    // above the screens (owner, 2026-11-18).
    renderStep({ mode: "xero", businessType: null, usesSalesCash: null });
    expect(await screen.findByText("Xero Integration")).toBeInTheDocument();
    const menu = within(screen.getByRole("complementary", { name: "Accounting Setup screens" }));
    expect(menu.getByRole("button", { name: /Connect to Xero/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.queryByText(/Accounting setup ·/i)).toBeNull();
  });

  it("Use Minty independently goes on to the business questions", async () => {
    renderStep({ mode: null, businessType: null, usesSalesCash: null });
    fireEvent.click(screen.getByRole("radio", { name: /Use Minty independently/ }));
    saveAndNext();
    expect(await screen.findByText("What best describes your business?")).toBeInTheDocument();
  });
});

// 4.2 asks only the business type (owner, 2026-11-18): the cash question is the sales accounts
// screen's Sales - Cash tick. The save sends the company's cash answer as it stands - ticked for a
// new company - so the API's set (with or without Cash Sales) is chosen as before.
describe("4.2 What best describes your business?", () => {
  it("asks only the business type, and a refused save says so", () => {
    renderStep({ mode: "minty", businessType: null, usesSalesCash: null });
    expect(screen.queryByText("How do you handle cash from sales?")).toBeNull();
    expect(screen.queryByRole("radio", { name: /We bank all sales/ })).toBeNull();
    saveAndNext();
    expect(
      screen.getByText("Choose what best describes your business to continue."),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("'None of these' is saved as an empty type, with cash sales for a new company", async () => {
    renderStep({ mode: "minty", businessType: null, usesSalesCash: null });
    fireEvent.click(screen.getByRole("radio", { name: /None of these/ }));
    saveAndNext();
    // the sales accounts screen comes next (owner, 2026-11-17)
    await screen.findByText("Your sales accounts");
    expect(calls[0]).toMatchObject({
      url: "/api/onboarding/accounting/business",
      body: { entity_id: "e-1", business_type: null, uses_sales_cash: true },
    });
  });

  it("keeps the cash answer the sales accounts screen saved", async () => {
    // back from 4.4 through the sales accounts screen to 4.2, Sales - Cash unticked earlier
    renderStep({ ...RETAIL_CHOSEN, usesSalesCash: false });
    await screen.findByText("What do you usually spend money on?");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Back/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Service business/ }));
    saveAndNext();
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/business"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/business"))!.body).toMatchObject({
      business_type: "service",
      uses_sales_cash: false,
    });
  });
});

// The sales accounts screen (owner, 2026-11-17; Figma 464:73 row 1): three ticks, picked by the
// business type until chosen; Cash is the cash answer; none ticked is refused with its sentence.
describe("the sales accounts screen", () => {
  const box = (name: RegExp) => screen.getByRole("checkbox", { name });

  it("opens after 4.2 with the business type's picks: a retail shop takes Cash and Electronic", () => {
    renderStep({ mode: "minty", businessType: "retail", usesSalesCash: true });
    expect(screen.getByText("Your sales accounts")).toBeInTheDocument();
    expect(box(/Sales - Cash/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Sales - Electronic Payment/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Sales - Delivery/)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Shows on your daily report: Cash Sales")).toBeInTheDocument();
    expect(screen.getByText("Not on your daily report")).toBeInTheDocument();
  });

  it("says how customers pay, with no brand names (owner, 2026-11-26)", () => {
    const { view } = renderStep({ mode: "minty", businessType: "retail", usesSalesCash: true });
    // One-sentence subtitle, the rest in the one ⓘ box (owner, 2026-11-26).
    expect(screen.getByText("How do your customers pay you?")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Tick each one you take — your daily report will ask for these amounts every day. You can change this later in Settings.",
    );
    expect(screen.getByText("Cash received at the counter.")).toBeInTheDocument();
    expect(screen.getByText("Card, e-wallet and bank transfer payments.")).toBeInTheDocument();
    expect(screen.getByText("Orders from delivery apps.")).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(/Visa|Alipay|FPS|Foodpanda|Keeta/);
  });

  it("'None of these' starts with only Sales - Cash (owner, 2026-11-18)", () => {
    renderStep({ mode: "minty", businessType: null, usesSalesCash: true });
    expect(box(/Sales - Cash/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Sales - Electronic Payment/)).toHaveAttribute("aria-checked", "false");
    expect(box(/Sales - Delivery/)).toHaveAttribute("aria-checked", "false");
  });

  it("Restaurant & Food starts with all three; banking all sales leaves Cash unticked", () => {
    renderStep({ mode: "minty", businessType: "fnb", usesSalesCash: false });
    expect(box(/Sales - Cash/)).toHaveAttribute("aria-checked", "false");
    expect(box(/Sales - Electronic Payment/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Sales - Delivery/)).toHaveAttribute("aria-checked", "true");
  });

  it("refuses none ticked, says so and moves focus to the list", () => {
    renderStep({ mode: "minty", businessType: "retail", usesSalesCash: true });
    fireEvent.click(box(/Sales - Cash/));
    fireEvent.click(box(/Sales - Electronic Payment/));
    saveAndNext();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No sales account is ticked yet. Tick at least one to continue.",
    );
    expect(document.activeElement?.id).toBe("acs-sales-accounts");
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("saves the ticks, remembers them and goes on to the expense accounts", async () => {
    const { getState } = renderStep({ mode: "minty", businessType: "retail", usesSalesCash: true });
    fireEvent.click(box(/Sales - Delivery/));
    saveAndNext();
    await screen.findByText("What do you usually spend money on?");
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/onboarding/accounting/sales-accounts",
      body: { entity_id: "e-1", cash: true, electronic: true, delivery: true },
    });
    expect(getState().accounting).toMatchObject({
      usesSalesCash: true,
      sellsElectronic: true,
      sellsDelivery: true,
    });
  });
});

describe("4.4 the expense list", () => {
  it("an empty list offers Auto Fill and adding your own", async () => {
    renderStep({ ...RETAIL_CHOSEN });
    expect(await screen.findByText("What do you usually spend money on?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Auto Fill/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add another category/ }));
    expect(screen.getByLabelText(/Code/)).toHaveValue("400");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByText("The name is still empty. Add a name to continue."),
    ).toBeInTheDocument();
  });

  it("is the last screen: Save & Next leaves the step", async () => {
    const { next } = renderStep({ ...RETAIL_CHOSEN });
    await screen.findByText("What do you usually spend money on?");
    saveAndNext();
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/accounts ready/)).toBeNull();
  });
});

describe("4.4 Auto Fill and Revert (owner, 2026-11-11)", () => {
  const cashOverShort = {
    ...account("s9", "6900", "Cash Over / Short", "expense"),
    is_system: false,
    auto_filled: false,
  };

  it("a row Revert had to keep (daily closing uses it) does not count as filled", async () => {
    expenseRows = [cashOverShort];
    renderStep({ ...RETAIL_CHOSEN });
    expect(await screen.findByText("Cash Over / Short")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Auto Fill/ });
    expect(button).toHaveAttribute("aria-pressed", "false");
    // and the template's other suggestions are not fetched back beside it
    expect(calls.some((c) => c.url.includes("/accounting/autofill"))).toBe(false);
  });

  // Each sheet account has its own icon from the design (Figma 4.4, owner 2026-11-18), by its code;
  // an account the company made keeps the icon its name matches.
  it("draws each sheet account's own icon by its code, a company's own by its name", async () => {
    const own = (id: string, code: string, name: string) => ({
      ...account(id, code, name, "expense"),
      is_system: false,
      source: "user" as const,
    });
    expenseRows = [
      { ...account("u1", "6001", "Utilities", "expense"), is_system: false },
      { ...account("u2", "6018", "System and Subscription Expense", "expense"), is_system: false },
      own("u3", "699", "Catering Rent"),
    ];
    const { view } = renderStep({ ...RETAIL_CHOSEN });
    await screen.findByText("Utilities");
    const icons = Array.from(view.container.querySelectorAll(".acs-exp .acs-exp-icon img")).map(
      (img) => img.getAttribute("src"),
    );
    expect(icons).toEqual([
      "/accounting/expense/utilities.png",
      "/accounting/expense/system.png",
      "/accounting/exp-rent.svg",
    ]);
  });

  it("an Auto Fill row nothing uses yet is filled: the button reads Revert", async () => {
    expenseRows = [
      cashOverShort,
      { ...account("s1", "6000", "Rent", "expense"), is_system: false, auto_filled: true },
    ];
    renderStep({ ...RETAIL_CHOSEN });
    expect(await screen.findByText("Rent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revert/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("Revert is held: the Auto Fill rows come off, nothing is sent, the suggestions stay away", async () => {
    const rent = {
      ...account("s1", "6000", "Rent", "expense"),
      is_system: false,
      auto_filled: true,
    };
    expenseRows = [cashOverShort, rent];
    answers["/api/onboarding/accounting/autofill"] = {
      based_on: "retail",
      options: [
        {
          template_id: "t1",
          code: "6000",
          name: "Rent",
          type: "expense",
          ticked: true,
          added: true,
        },
      ],
    };
    renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("button", { name: /Revert/ }));

    const button = await screen.findByRole("button", { name: /Auto Fill/ });
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(screen.queryByText("Rent")).toBeNull();
    expect(screen.getByText("Cash Over / Short")).toBeInTheDocument();
    expect(writes()).toEqual([]);
    const revertAt = calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(
      calls.slice(revertAt).some((c) => c.method === "GET" && c.url.endsWith("/autofill")),
    ).toBe(false);
  });
});

/** Every call that would change the company: anything but a read. */
const writes = () => calls.filter((c) => c.method !== "GET");
const putCalls = () =>
  calls.filter((c) => c.method === "PUT" && c.url.endsWith("/accounting/accounts"));

describe("4.4 an expense row", () => {
  it("shows its code and description, ticked, with Edit and Remove in its menu", async () => {
    expenseRows = [
      {
        ...account("s1", "420", "Rent", "expense"),
        description: "The shop's monthly rent.",
      },
    ];
    renderStep({ ...RETAIL_CHOSEN });
    expect(await screen.findByText("Rent")).toBeInTheDocument();
    expect(screen.getByText(/The shop's monthly rent./)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Rent/ })).toBeChecked();

    const more = screen.getByRole("button", { name: "More for Rent" });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Remove on an account the company has asks first, and only Save & Next takes it out", async () => {
    expenseRows = [
      { ...account("s1", "420", "Rent", "expense"), is_system: false },
      { ...account("s2", "421", "Repairs", "expense"), is_system: false },
    ];
    const { next } = renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("button", { name: "More for Rent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    const question = screen.getByRole("dialog", { name: "Remove Rent?" });
    fireEvent.click(within(question).getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Rent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More for Rent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove Rent?" })).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(screen.queryByText("Rent")).toBeNull();
    expect(writes()).toEqual([]);

    saveAndNext();
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0].body).toEqual({
      entity_id: "e-1",
      kind: "expense",
      template_ids: [],
      accounts: [{ id: "s2", code: "421", name: "Repairs", type: "expense", description: "" }],
    });
    expect(writes()).toHaveLength(1);
  });

  it("Remove on a row added on this screen takes it away without asking", async () => {
    renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("button", { name: /Add another category/ }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Staff meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(await screen.findByRole("button", { name: "More for Staff meals" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Staff meals")).toBeNull();
    expect(writes()).toEqual([]);
  });
});

// Plan item 4 (2026-11-20): the expense list holds every change until Save & Next, as X3 does, and
// sends ONE PUT /accounting/accounts with the list as the screen holds it.
describe("4.4 changes wait for Save & Next", () => {
  const own = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
    ...account(id, code, name, "expense"),
    is_system: false,
    source: "user" as const,
    ...extra,
  });

  it("ticks, edits and adds send nothing until Save & Next, then one PUT with the list", async () => {
    expenseRows = [
      own("u1", "499", "Sundries", { description: "Odds and ends" }),
      own("u2", "498", "Repairs"),
    ];
    const { next } = renderStep({ ...RETAIL_CHOSEN });
    // untick Repairs: it stays on screen, unticked, until saved
    fireEvent.click(await screen.findByRole("checkbox", { name: /Repairs/ }));
    expect(screen.getByRole("checkbox", { name: /Repairs/ })).not.toBeChecked();

    // edit Sundries
    fireEvent.click(screen.getByRole("button", { name: "More for Sundries" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Sundries and spares" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Sundries and spares")).toBeInTheDocument();

    // add one of its own
    fireEvent.click(screen.getByRole("button", { name: /Add another category/ }));
    fireEvent.change(screen.getByLabelText(/^Code/), { target: { value: "496" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Staff meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("checkbox", { name: /Staff meals/ })).toBeChecked();

    expect(writes()).toEqual([]);
    saveAndNext();
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
    expect(putCalls()[0].body).toEqual({
      entity_id: "e-1",
      kind: "expense",
      template_ids: [],
      accounts: [
        {
          id: "u1",
          code: "499",
          name: "Sundries and spares",
          type: "expense",
          description: "Odds and ends",
        },
        { code: "496", name: "Staff meals", type: "expense", description: "" },
      ],
    });
  });

  it("an add whose code the list already has is refused on the form, before anything is sent", async () => {
    expenseRows = [own("u1", "499", "Sundries")];
    renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("button", { name: /Add another category/ }));
    fireEvent.change(screen.getByLabelText(/^Code/), { target: { value: "499" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Staff meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      (await screen.findAllByText("The code 499 is already used by Sundries. Choose another code."))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox", { name: /Staff meals/ })).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("Auto Fill only reads the suggestions; the ticked ones are sent with Save & Next", async () => {
    answers["/api/onboarding/accounting/autofill"] = {
      based_on: "retail",
      options: [
        {
          template_id: "t1",
          code: "6003",
          name: "Rent",
          type: "expense",
          ticked: true,
          added: false,
        },
        {
          template_id: "t2",
          code: "6007",
          name: "Repairs",
          type: "expense",
          ticked: false,
          added: false,
        },
      ],
    };
    const { next } = renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("button", { name: /Auto Fill/ }));
    expect(await screen.findByRole("checkbox", { name: /Rent/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Repairs/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Revert/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: /Repairs/ }));
    expect(writes()).toEqual([]);

    saveAndNext();
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(putCalls()[0].body).toEqual({
      entity_id: "e-1",
      kind: "expense",
      template_ids: ["t1", "t2"],
      accounts: [],
    });
  });

  it("a refused save keeps the held list and says why", async () => {
    expenseRows = [own("u1", "499", "Sundries"), own("u2", "498", "Repairs")];
    refusals["PUT /api/onboarding/accounting/accounts"] = {
      status: 409,
      body: {
        error:
          "Repairs is already used in your records or Petty Cash Settings, so it can't be deleted.",
      },
    };
    const { next } = renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("checkbox", { name: /Repairs/ }));
    saveAndNext();
    expect(
      await screen.findByText(
        "Repairs is already used in your records or Petty Cash Settings, so it can't be deleted.",
      ),
    ).toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Repairs/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Sundries/ })).toBeChecked();
  });

  it("Save & Exit saves the held list first", async () => {
    expenseRows = [own("u1", "499", "Sundries"), own("u2", "498", "Repairs")];
    const { saveAndExit } = renderStep({ ...RETAIL_CHOSEN });
    fireEvent.click(await screen.findByRole("checkbox", { name: /Repairs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save & Exit" }));
    await waitFor(() => expect(saveAndExit).toHaveBeenCalledTimes(1));
    const submitFn = saveAndExit.mock.calls[0][0] as () => Promise<{ ok: boolean }>;
    expect(await submitFn()).toEqual({ ok: true });
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0].body).toMatchObject({ accounts: [{ id: "u1" }] });
  });

  it("nothing changed: Save & Next moves on without a call", async () => {
    expenseRows = [own("u1", "499", "Sundries")];
    const { next } = renderStep({ ...RETAIL_CHOSEN });
    await screen.findByText("Sundries");
    saveAndNext();
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([]);
  });

  it("the step's auto-saved draft keeps the held list and Restore puts it back", async () => {
    expenseRows = [own("u1", "499", "Sundries"), own("u2", "498", "Repairs")];
    const reported: Record<string, unknown> = {};
    const setters: Record<string, (v: unknown) => void> = {};
    const registry: StepDraftRegistry = {
      attach(name, put) {
        setters[name] = put;
        return () => {
          delete setters[name];
        };
      },
      report(name, value) {
        if (value === undefined) delete reported[name];
        else reported[name] = value;
      },
    };
    const first = renderStep({ ...RETAIL_CHOSEN }, undefined, undefined, registry);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Repairs/ }));
    await waitFor(() => expect(reported["acs.held.expense"]).toBeTruthy());
    const kept = reported["acs.held.expense"];
    first.view.unmount();

    // the step opens again (a reload): Restore hands the kept list back
    renderStep({ ...RETAIL_CHOSEN }, undefined, undefined, registry);
    expect(await screen.findByRole("checkbox", { name: /Repairs/ })).toBeChecked();
    act(() => setters["acs.held.expense"](kept));
    expect(screen.getByRole("checkbox", { name: /Repairs/ })).not.toBeChecked();
    expect(writes()).toEqual([]);
  });
});

describe("X3 the Xero expense accounts (Figma 348:1949)", () => {
  const xeroRow = (id: string, code: string, name: string, used: boolean) => ({
    ...account(id, code, name, "expense"),
    type_label: "Expense",
    source: "xero",
    from_xero: true,
    used,
  });

  it("follows Connect to Xero, starts from the saved ticks, saves exactly the ticked ones and ends the step", async () => {
    connected = true;
    expenseRows = [xeroRow("x1", "400", "Advertising", true), xeroRow("x2", "469", "Rent", false)];
    const { next } = renderStep(
      { mode: "xero", businessType: null, usesSalesCash: null },
      ["pettyCash"],
      {
        connected: true,
        org: "Demo",
      },
    );
    fireEvent.click(await screen.findByRole("button", { name: /Save & Next/ }));
    expect(await screen.findByText("Which expense accounts should Minty use?")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Advertising/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Rent/ })).not.toBeChecked();

    // Nothing ticked is refused here, with the sentence, before the API is asked.
    fireEvent.click(screen.getByRole("checkbox", { name: /Advertising/ }));
    saveAndNext();
    expect(
      await screen.findByText("Tick at least one expense account to continue."),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/xero-accounts"))).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: /Rent/ }));
    saveAndNext();
    await waitFor(() => {
      const save = calls.find((c) => c.url.endsWith("/xero-accounts"));
      expect(save?.body).toEqual({ entity_id: "e-1", kind: "expense", account_ids: ["x2"] });
    });
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });

  // Production, 2026-11-26: three "Reload the list" refusals in a row after Refresh from Xero.
  const toX3 = async (drafts: StepDraftRegistry | null = null) => {
    const view = renderStep(
      { mode: "xero", businessType: null, usesSalesCash: null },
      ["pettyCash"],
      { connected: true, org: "Demo" },
      drafts,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Save & Next/ }));
    await screen.findByText("Which expense accounts should Minty use?");
    return view;
  };
  const ticksSent = () => calls.filter((c) => c.url.endsWith("/xero-accounts"));

  it("a tick the refreshed list no longer has is neither counted nor sent", async () => {
    connected = true;
    expenseRows = [xeroRow("x1", "400", "Advertising", true), xeroRow("x2", "469", "Rent", false)];
    const { next } = await toX3();
    fireEvent.click(screen.getByRole("checkbox", { name: /Rent/ }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // Xero no longer has Advertising: the refreshed list leaves it out
    expenseRows = [xeroRow("x2", "469", "Rent", false), xeroRow("x3", "470", "Repairs", false)];
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Xero" }));
    expect(await screen.findByRole("checkbox", { name: /Repairs/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Rent/ })).toBeChecked();
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    saveAndNext();
    await waitFor(() =>
      expect(ticksSent()[0]?.body).toEqual({
        entity_id: "e-1",
        kind: "expense",
        account_ids: ["x2"],
      }),
    );
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });

  it("a kept draft's tick the list doesn't have is neither counted nor sent", async () => {
    connected = true;
    expenseRows = [xeroRow("x1", "400", "Advertising", false), xeroRow("x2", "469", "Rent", false)];
    const setters: Record<string, (v: unknown) => void> = {};
    const reported: Record<string, unknown> = {};
    const registry: StepDraftRegistry = {
      attach(name, put) {
        setters[name] = put;
        return () => {
          delete setters[name];
        };
      },
      report(name, value) {
        reported[name] = value;
      },
    };
    await toX3(registry);
    act(() => setters["acs.xero.expense"](["gone-from-xero", "x1"]));
    expect(screen.getByRole("checkbox", { name: /Advertising/ })).toBeChecked();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await waitFor(() => expect(reported["acs.xero.expense"]).toEqual(["x1"]));

    saveAndNext();
    await waitFor(() => expect(ticksSent()[0]?.body).toMatchObject({ account_ids: ["x1"] }));
  });

  it("with no Xero expense accounts, Save & Next says why and Save & Exit saves nothing", async () => {
    connected = true;
    expenseRows = [];
    const { next, saveAndExit } = await toX3();
    saveAndNext();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tick at least one expense account to continue. Create one in Xero first, then press Refresh from Xero.",
    );
    expect(next).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save & Exit" }));
    await waitFor(() => expect(saveAndExit).toHaveBeenCalledTimes(1));
    const submit = saveAndExit.mock.calls[0][0] as (() => Promise<unknown>) | undefined;
    expect(submit ? await submit() : null).toBeNull();
    expect(ticksSent()).toEqual([]);
  });

  it("searches by code or name and shows the rest behind Show more", async () => {
    connected = true;
    expenseRows = Array.from({ length: 12 }, (_, i) =>
      xeroRow(`r${i}`, String(400 + i), `Cost ${i}`, i === 0),
    );
    renderStep({ mode: "xero", businessType: null, usesSalesCash: null }, ["pettyCash"], {
      connected: true,
      org: "Demo",
    });
    fireEvent.click(await screen.findByRole("button", { name: /Save & Next/ }));
    await screen.findByText("Which expense accounts should Minty use?");
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /Show more accounts \(2\)/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), {
      target: { value: "411" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /Cost 11/ })).toBeInTheDocument();
  });
});

// Save & Exit on every step-4 screen saves that screen's answer first (2026-11-20: it used to
// save nothing but the place to come back to, dropping a pick made on the open screen).
describe("Save & Exit saves the open screen's answer", () => {
  const exit = async (saveAndExit: ReturnType<typeof vi.fn>) => {
    fireEvent.click(screen.getByRole("button", { name: "Save & Exit" }));
    await waitFor(() => expect(saveAndExit).toHaveBeenCalledTimes(1));
    return saveAndExit.mock.calls[0][0] as (() => Promise<{ ok: boolean } | null>) | undefined;
  };

  it("4.1: the picked way of working", async () => {
    const { saveAndExit, next } = renderStep({
      mode: null,
      businessType: null,
      usesSalesCash: null,
    });
    fireEvent.click(screen.getByRole("radio", { name: /Use Minty independently/ }));
    const submit = await exit(saveAndExit);
    expect(await submit!()).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      url: "/api/onboarding/accounting/mode",
      body: { entity_id: "e-1", mode: "minty" },
    });
    expect(next).not.toHaveBeenCalled();
    expect(screen.getByText("How would you like Minty to work?")).toBeInTheDocument();
  });

  it("4.1 with nothing picked saves nothing", async () => {
    const { saveAndExit } = renderStep({ mode: null, businessType: null, usesSalesCash: null });
    const submit = await exit(saveAndExit);
    expect(submit ? await submit() : null).toBeNull();
    expect(calls).toEqual([]);
  });

  it("4.2: the business type", async () => {
    const { saveAndExit } = renderStep({ mode: "minty", businessType: null, usesSalesCash: null });
    fireEvent.click(screen.getByRole("radio", { name: /None of these/ }));
    const submit = await exit(saveAndExit);
    expect(await submit!()).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      url: "/api/onboarding/accounting/business",
      body: { entity_id: "e-1", business_type: null, uses_sales_cash: true },
    });
    expect(screen.getByText("What best describes your business?")).toBeInTheDocument();
  });

  it("the sales accounts' ticks; none ticked saves nothing", async () => {
    const { saveAndExit } = renderStep({
      mode: "minty",
      businessType: "retail",
      usesSalesCash: true,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Sales - Delivery/ }));
    const submit = await exit(saveAndExit);
    expect(await submit!()).toEqual({ ok: true });
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/onboarding/accounting/sales-accounts",
      body: { entity_id: "e-1", cash: true, electronic: true, delivery: true },
    });
    expect(screen.getByText("Your sales accounts")).toBeInTheDocument();
  });

  it("the Xero expense accounts' ticks", async () => {
    connected = true;
    expenseRows = [
      {
        ...account("x1", "400", "Advertising", "expense"),
        type_label: "Expense",
        source: "xero",
        from_xero: true,
        used: true,
      },
      {
        ...account("x2", "469", "Rent", "expense"),
        type_label: "Expense",
        source: "xero",
        from_xero: true,
        used: false,
      },
    ];
    const { saveAndExit, next } = renderStep(
      { mode: "xero", businessType: null, usesSalesCash: null },
      ["pettyCash"],
      { connected: true, org: "Demo" },
    );
    fireEvent.click(await screen.findByRole("button", { name: /Save & Next/ }));
    await screen.findByText("Which expense accounts should Minty use?");
    fireEvent.click(screen.getByRole("checkbox", { name: /Rent/ }));
    const submit = await exit(saveAndExit);
    expect(await submit!()).toEqual({ ok: true });
    const save = calls.find((c) => c.url.endsWith("/xero-accounts"));
    expect(save?.body).toEqual({ entity_id: "e-1", kind: "expense", account_ids: ["x1", "x2"] });
    expect(next).not.toHaveBeenCalled();
  });
});
