// StepConnectXero after a Xero round-trip that connected nothing because the Xero login sees
// several organisations no company holds (Flask's `xero=choose`, owner 2026-10-27). Flask's
// flash doesn't survive the trip, so the step says it: once, then clears the flag.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepConnectXero } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import type { StepProps, XeroCurrency } from "../../lib/types";

function renderStep(
  xeroChoose: boolean,
  state: { xero: { connected: boolean; org: string }; entity: { name: string } } = {
    xero: { connected: false, org: "" },
    entity: { name: "Shop" },
  },
  xeroCurrency: XeroCurrency | null = null,
) {
  const clearXeroChoose = vi.fn();
  const clearXeroCurrency = vi.fn();
  render(
    <ToastProvider>
      <StepConnectXero
        state={state as unknown as StepProps["state"]}
        next={vi.fn()}
        back={vi.fn()}
        connectXero={vi.fn()}
        disconnectXero={vi.fn()}
        xeroMismatch=""
        clearXeroMismatch={vi.fn()}
        xeroChoose={xeroChoose}
        clearXeroChoose={clearXeroChoose}
        xeroConflict={null}
        clearXeroConflict={vi.fn()}
        xeroCurrency={xeroCurrency}
        clearXeroCurrency={clearXeroCurrency}
        releaseXeroConflict={vi.fn()}
        saveAndExit={vi.fn()}
      />
    </ToastProvider>,
  );
  return { clearXeroChoose, clearXeroCurrency };
}

describe("StepConnectXero, several unclaimed organisations", () => {
  it("says how to narrow it down, and clears the flag", async () => {
    const { clearXeroChoose } = renderStep(true);
    expect(await screen.findByText(/more than one linked to Minty/)).toBeInTheDocument();
    expect(clearXeroChoose).toHaveBeenCalledTimes(1);
  });

  it("says nothing otherwise", () => {
    const { clearXeroChoose } = renderStep(false);
    expect(screen.queryByText(/more than one linked to Minty/)).not.toBeInTheDocument();
    expect(clearXeroChoose).not.toHaveBeenCalled();
  });
});

describe("StepConnectXero, the connected card's Xero Entity", () => {
  it("names the Xero organisation", () => {
    renderStep(false, { xero: { connected: true, org: "Xero Org" }, entity: { name: "Shop" } });
    expect(screen.getByText("Xero Org")).toBeInTheDocument();
  });

  it("falls back to the company's name", () => {
    renderStep(false, { xero: { connected: true, org: "" }, entity: { name: "Shop" } });
    expect(screen.getByText("Shop")).toBeInTheDocument();
  });

  it("with no name at all, shows a neutral placeholder, never a real company's name", () => {
    renderStep(false, { xero: { connected: true, org: "" }, entity: { name: "" } });
    expect(screen.getByText("Your company")).toBeInTheDocument();
  });
});

// accounts-api refuses an organisation whose currency isn't the company's (2026-11-24) and comes
// back with `xero=currency`. The sentence says what to change and is long, so it is a modal that
// stays until closed (the user, 2026-11-24) - never a toast - and Close is what clears the flag.
describe("StepConnectXero, a Xero organisation in another currency", () => {
  const SENTENCE =
    "Acme US uses USD in Xero, but you chose HKD for this company, so it wasn't connected. " +
    "Change the currency to USD in step 1, or connect a Xero organisation that uses HKD.";

  it("opens a modal that names both currencies and what to change; Close clears the flag", async () => {
    const { clearXeroCurrency } = renderStep(false, undefined, {
      org: "Acme US",
      xeroCurrency: "USD",
      expected: "HKD",
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Xero wasn't connected");
    expect(within(dialog).getByText(SENTENCE)).toBeInTheDocument();
    expect(within(dialog).getByText("Shop")).toBeInTheDocument();
    expect(screen.getAllByText(SENTENCE)).toHaveLength(1); // no toast beside it
    expect(clearXeroCurrency).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(clearXeroCurrency).toHaveBeenCalledTimes(1);
  });

  it("without the organisation's name, says 'That Xero organisation'", () => {
    renderStep(false, undefined, { org: "", xeroCurrency: "USD", expected: "HKD" });
    expect(
      within(screen.getByRole("dialog")).getByText(/^That Xero organisation uses USD in Xero/),
    ).toBeInTheDocument();
  });

  it("says nothing otherwise", () => {
    const { clearXeroCurrency } = renderStep(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/uses .* in Xero/)).not.toBeInTheDocument();
    expect(clearXeroCurrency).not.toHaveBeenCalled();
  });
});
