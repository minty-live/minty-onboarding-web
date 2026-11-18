// Petty Cash Settings' Account Code for a company keeping its books in Minty (owner, 2026-11-18):
// which of step 4's expense accounts appear when someone adds a petty cash expense - the list
// Payment Request Settings has for payment requests. At least one stays ticked.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepPettyCodes } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import { initialState } from "../../lib/wizardSteps";
import type { AccountOptions, WizardState } from "../../lib/types";

const OPTIONS = {
  petty: [
    { code: "5000", name: "Inventory Purchases" },
    { code: "6003", name: "Rent" },
  ],
} as unknown as AccountOptions;

function renderStep(selected: Record<string, boolean>) {
  const next = vi.fn();
  const submitPettyCodes = vi.fn(() => Promise.resolve({ ok: true as const }));
  let state: WizardState = initialState();
  state.pettyCash = { ...state.pettyCash, pettyCodes: { all: false, selected } };
  const set = vi.fn((patch) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  });
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
        returnToStep={vi.fn()}
      />
    </ToastProvider>,
  );
  return { next, submitPettyCodes };
}

describe("StepPettyCodes", () => {
  it("lists step 4's expense accounts under Petty Cash Account Code", () => {
    renderStep({ "5000": true });
    expect(screen.getByRole("heading", { name: "Petty Cash Settings" })).toBeInTheDocument();
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
});
