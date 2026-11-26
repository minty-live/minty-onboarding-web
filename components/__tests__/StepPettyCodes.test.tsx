// Petty Cash Settings' Account Code for a company keeping its books in Minty (owner, 2026-11-18):
// which of step 4's expense accounts appear when someone adds a petty cash expense - the list
// Payment Request Settings has for payment requests. At least one stays ticked.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepPettyCodes } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import { initialState } from "../../lib/wizardSteps";
import type { AccountOptions, WizardState } from "../../lib/types";
import { accountingApi } from "../../lib/accountingApi";

vi.mock("../../lib/accountingApi", async (original) => {
  const real = await original<typeof import("../../lib/accountingApi")>();
  return { ...real, accountingApi: { ...real.accountingApi, setup: vi.fn(), create: vi.fn() } };
});
const setupMock = vi.mocked(accountingApi.setup);
const createMock = vi.mocked(accountingApi.create);
beforeEach(() => {
  setupMock.mockResolvedValue({
    ok: true,
    types: [
      { value: "expense", label: "Expense" },
      { value: "direct_costs", label: "Direct costs" },
      { value: "overheads", label: "Overheads" },
    ],
    next_code: { expense: "6100", direct_costs: "5100", overheads: "6100" },
  } as never);
  createMock.mockReset();
});

const OPTIONS = {
  petty: [
    { code: "5000", name: "Inventory Purchases" },
    { code: "6003", name: "Rent" },
  ],
} as unknown as AccountOptions;

function renderStep(
  selected: Record<string, boolean>,
  modules: WizardState["modules"] = ["pettyCash"],
) {
  const next = vi.fn();
  const submitPettyCodes = vi.fn(() => Promise.resolve({ ok: true as const }));
  let state: WizardState = { ...initialState(), modules };
  state.pettyCash = { ...state.pettyCash, pettyCodes: { all: false, selected } };
  const set = vi.fn((patch) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  });
  const returnToStep = vi.fn();
  const reloadPettyCodes = vi.fn(() => Promise.resolve(true));
  render(
    <ToastProvider>
      <StepPettyCodes
        state={state}
        set={set}
        next={next}
        back={vi.fn()}
        accountOptions={OPTIONS}
        submitPettyCodes={submitPettyCodes}
        saveAndExit={vi.fn()}
        returnToStep={returnToStep}
        reloadPettyCodes={reloadPettyCodes}
        token="tok"
      />
    </ToastProvider>,
  );
  return { next, submitPettyCodes, returnToStep, reloadPettyCodes, latest: () => state };
}

describe("StepPettyCodes", () => {
  it("lists step 4's expense accounts under Petty Cash Account Code", () => {
    renderStep({ "5000": true });
    // no page heading above the list (owner, 2026-11-18)
    expect(screen.queryByRole("heading", { name: "Petty Cash Settings" })).toBeNull();
    expect(screen.getByText("Petty Cash Account Code")).toBeInTheDocument();
    expect(screen.getByText("5000 · Inventory Purchases")).toBeInTheDocument();
    expect(screen.getByText("6003 · Rent")).toBeInTheDocument();
  });

  it("refuses none ticked with its sentence", () => {
    const { next, submitPettyCodes } = renderStep({});
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one account code.");
    expect(submitPettyCodes).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("saves the ticks, then moves on", async () => {
    const { next, submitPettyCodes } = renderStep({ "6003": true });
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(submitPettyCodes).toHaveBeenCalledTimes(1);
  });

  const NOTE =
    "These come from your Accounting Setup list. Tick the ones staff can choose when they add a petty cash expense.";
  const BOTH = " Payment Request has its own list, so you can pick differently there.";

  it("says where the list comes from, and that Payment Request has its own when both are chosen", () => {
    renderStep({ "5000": true }, ["pettyCash", "bills"]);
    expect(screen.getByRole("note")).toHaveTextContent(NOTE + BOTH);
  });

  it("drops the Payment Request sentence when Petty Cash is the only module", () => {
    renderStep({ "5000": true }, ["pettyCash"]);
    expect(screen.getByRole("note")).toHaveTextContent(NOTE);
    expect(screen.getByRole("note")).not.toHaveTextContent(/Payment Request/);
  });
});

// "+ Add account" (the user, 2026-11-26): an account added in place, in a pop-up, ticked at once;
// "Go to Account Settings" opens Accounting Setup's expense list (step 4).
describe("StepPettyCodes -- adding an account in place", () => {
  const dialog = () => screen.queryByRole("dialog", { name: "Add an account" });

  it("offers + Add account and Go to Account Settings", () => {
    const { returnToStep } = renderStep({ "5000": true });
    expect(screen.getByRole("button", { name: "+ Add account" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to Account Settings" }));
    expect(returnToStep).toHaveBeenCalledWith(4);
  });

  it("adds the account in a pop-up, reloads the list keeping the ticks, and ticks the new one", async () => {
    createMock.mockResolvedValue({
      ok: true,
      account: { code: "6100", name: "Staff meals" },
    } as never);
    const { reloadPettyCodes, latest } = renderStep({ "5000": true });
    fireEvent.click(screen.getByRole("button", { name: "+ Add account" }));
    expect(dialog()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Code/)).toHaveValue("6100"));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Staff meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(createMock).toHaveBeenCalledWith("tok", expect.any(String), {
      code: "6100",
      name: "Staff meals",
      type: "expense",
    });
    expect(reloadPettyCodes).toHaveBeenCalledTimes(1);
    expect(latest().pettyCash.pettyCodes?.selected).toEqual({ "5000": true, "6100": true });
  });

  it("a refusal stays in the pop-up", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "You can't add accounts in this company.",
      fields: {},
    });
    const { reloadPettyCodes } = renderStep({ "5000": true });
    fireEvent.click(screen.getByRole("button", { name: "+ Add account" }));
    await waitFor(() => expect(screen.getByLabelText(/^Code/)).toHaveValue("6100"));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Staff meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByText("You can't add accounts in this company.")).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
    expect(reloadPettyCodes).not.toHaveBeenCalled();
  });

  it("closes with nothing added on Escape", async () => {
    renderStep({ "5000": true });
    fireEvent.click(screen.getByRole("button", { name: "+ Add account" }));
    expect(dialog()).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(createMock).not.toHaveBeenCalled();
  });
});
