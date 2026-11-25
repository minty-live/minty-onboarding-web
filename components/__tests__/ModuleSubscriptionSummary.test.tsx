// components/steps/modulePricing::ModuleSubscriptionSummary -- the card on file under
// "Payment method".
//
// Every saved card wears its network's mark in the same white chip (`.pm-brand`) as the
// Payment Methods sheet's rows (the user, 2026-11-25), and "ending in 4444" is one unit, so a
// phone breaks the line after the brand name, never before the last four digits.

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanCatalog } from "../../lib/api";
import { ModuleSubscriptionSummary } from "../steps/modulePricing";

const plan = (code: "PETTY_CASH" | "PAYMENT_REQUEST") => ({
  code,
  name: code,
  amount: 280,
  formatted_amount: "280.00",
  currency_code: "HKD",
  currency_symbol: "HKD",
  billing_interval: "month",
});

const CATALOG: PlanCatalog = {
  plans: [plan("PETTY_CASH"), plan("PAYMENT_REQUEST")],
  bundle_amount: 400,
  bundle_codes: ["PAYMENT_REQUEST", "PETTY_CASH"],
  bundle_currency: "HKD",
  trial_period_days: 30,
};

function renderWith(card: Parameters<typeof ModuleSubscriptionSummary>[0]["card"]) {
  return render(
    <ModuleSubscriptionSummary
      catalog={CATALOG}
      selected={["pettyCash", "bills"]}
      card={card}
      cardLoading={false}
      onOpenBilling={vi.fn()}
    />,
  );
}

describe("ModuleSubscriptionSummary payment method", () => {
  it("draws the card's mark in the sheet's chip, not bare", () => {
    const { container } = renderWith({
      id: "pm_1",
      brand: "mastercard",
      brand_label: "Mastercard",
      last4: "4444",
    });
    const chip = container.querySelector(".sub-pay-card .pm-brand");
    expect(chip).not.toBeNull();
    // The chip's card-shaped field, as in the sheet - not the cropped summary mark.
    expect(chip!.querySelector("svg")).toHaveAttribute("viewBox", "0 0 46 30");
    expect(chip!.querySelectorAll("circle")).toHaveLength(2);
  });

  it('keeps "ending in 4444" together', () => {
    const { container } = renderWith({
      id: "pm_1",
      brand: "mastercard",
      brand_label: "Mastercard",
      last4: "4444",
    });
    const name = container.querySelector(".sub-pay-name")!;
    expect(name).toHaveTextContent("Mastercard ending in 4444");
    expect(name.querySelector(".card-last4")).toHaveTextContent("ending in 4444");
  });
});
