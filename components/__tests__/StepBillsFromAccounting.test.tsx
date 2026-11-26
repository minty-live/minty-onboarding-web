// Payment Request Settings (step 8) follows Accounting Setup (owner, 2026-11-11): its list is step
// 4's expense accounts, so an empty list sends the person back to step 4, never to "Connect to Xero"
// (a Minty company on its own has no Xero at all).

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepBills } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import { initialState } from "../../lib/wizardSteps";
import type { WizardState } from "../../lib/types";

function renderStep(
  bill: { code: string; name: string }[],
  modules: WizardState["modules"] = ["bills"],
  mode: "minty" | "xero" = "minty",
) {
  const base = initialState();
  const state: WizardState = {
    ...base,
    modules,
    accounting: { mode, businessType: "retail", usesSalesCash: false },
    bills: { ...base.bills, billCodes: { all: false, selected: { "420": true } } },
  };
  const returnToStep = vi.fn();
  const submitBills = vi.fn().mockResolvedValue({ ok: true });
  render(
    <ToastProvider>
      <StepBills
        state={state}
        set={vi.fn()}
        next={vi.fn()}
        back={vi.fn()}
        accountOptions={{ bill } as never}
        submitBills={submitBills}
        saveAndExit={vi.fn()}
        isLastContentStep={false}
        returnToStep={returnToStep}
        reloadBillCodes={vi.fn(() => Promise.resolve(true))}
        token="tok"
      />
    </ToastProvider>,
  );
  return { returnToStep, submitBills };
}

describe("Payment Request Settings from Accounting Setup", () => {
  it("lists step 4's expense accounts with the ticks it was given", () => {
    renderStep([
      { code: "310", name: "Stock purchases" },
      { code: "420", name: "Rent" },
    ]);
    // no page heading above the list (owner, 2026-11-18)
    expect(screen.queryByRole("heading", { name: "Payment Request Settings" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "420" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "310" })).not.toBeChecked();
    expect(screen.queryByText(/Connect to Xero/)).toBeNull();
  });

  it("sends a company with no expense account back to Accounting Setup", () => {
    const { returnToStep } = renderStep([]);
    expect(
      screen.getByText("No expense accounts yet. Add one with + Add account below."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Connect to Xero/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to Account Settings" }));
    expect(returnToStep).toHaveBeenCalledWith(4);
  });

  const NOTE =
    "These come from your Accounting Setup list. Tick the ones staff can choose when they add a payment request.";

  it("says where the list comes from, and that Petty Cash has its own when both are chosen", () => {
    renderStep([{ code: "420", name: "Rent" }], ["pettyCash", "bills"]);
    expect(screen.getByRole("note")).toHaveTextContent(NOTE + " Petty Cash has its own list.");
  });

  it("drops the Petty Cash sentence when Payment Request is the only module", () => {
    renderStep([{ code: "420", name: "Rent" }], ["bills"]);
    expect(screen.getByRole("note")).toHaveTextContent(NOTE);
    expect(screen.getByRole("note")).not.toHaveTextContent(/Petty Cash/);
  });
});

describe("Payment Request Settings -- adding an account (the user, 2026-11-26)", () => {
  it("offers + Add account and Go to Account Settings when the books are kept in Minty", () => {
    const { returnToStep } = renderStep([{ code: "420", name: "Rent" }]);
    expect(screen.getByRole("button", { name: "+ Add account" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to Account Settings" }));
    expect(returnToStep).toHaveBeenCalledWith(4);
  });

  it("offers neither with Xero: accounts are added in Xero", () => {
    renderStep([{ code: "420", name: "Rent" }], ["bills"], "xero");
    expect(screen.queryByRole("button", { name: "+ Add account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go to Account Settings" })).toBeNull();
  });
});
