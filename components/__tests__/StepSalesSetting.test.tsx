// components/OnboardingSteps StepSalesSetting -- Step 5's opening date default.
//
// The date's limit is the SERVER's Hong Kong "today" (/api/onboarding/server-time), so its
// default comes from there too, never the browser's clock: a browser a day ahead used to
// default to a date the API then refused as "in the future". A date the user picked, or one a
// saved draft brought back, is never replaced.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepSalesSetting } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import { initialState } from "../../lib/wizardSteps";
import type { WizardState } from "../../lib/types";

vi.mock("@/lib/refData", () => ({
  fetchCurrencies: () => Promise.resolve([]),
}));

let latest: WizardState;
const remember = (s: WizardState) => {
  latest = s;
};

function Harness({ start }: { start: WizardState }) {
  const [state, setState] = useState<WizardState>(start);
  useEffect(() => remember(state), [state]);
  return (
    <ToastProvider>
      <StepSalesSetting
        state={state}
        set={(patch) =>
          setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }))
        }
        next={vi.fn()}
        back={vi.fn()}
        submitSalesMethods={vi.fn(() => Promise.resolve({ ok: true as const }))}
        submitOpeningBalance={vi.fn(() => Promise.resolve({ ok: true as const }))}
        saveAndExit={vi.fn()}
      />
    </ToastProvider>
  );
}

function serverToday(today: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        today === null
          ? new Response("", { status: 503 })
          : new Response(JSON.stringify({ today }), { status: 200 }),
      ),
    ),
  );
}

// jsdom has no scrollIntoView; a refused Save & Next scrolls to the missing balance.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StepSalesSetting -- the opening date's default", () => {
  it("is the server's today, not the browser's", async () => {
    serverToday("2001-02-03");
    render(<Harness start={initialState()} />);
    await waitFor(() => expect(latest.pettyCash.openingDate).toBe("2001-02-03"));
  });

  it("never replaces a date the draft already holds", async () => {
    serverToday("2001-02-03");
    const start = initialState();
    start.pettyCash = { ...start.pettyCash, openingDate: "2000-12-25" };
    render(<Harness start={start} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // Let the server-time answer land before judging.
    await new Promise((r) => setTimeout(r, 20));
    expect(latest.pettyCash.openingDate).toBe("2000-12-25");
  });

  it("falls back to Hong Kong's today when the server cannot say", async () => {
    serverToday(null);
    const hk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
    render(<Harness start={initialState()} />);
    await waitFor(() => expect(latest.pettyCash.openingDate).toBe(hk));
  });
});

// Auto Fill's lists follow the business type: Restaurant & Food gets Electronic and Delivery; a
// retail shop, a service or a general business one Non-cash list, Bank Transfer first and no
// delivery (owner, 2026-11-17).
describe("StepSalesSetting -- Auto Fill's methods", () => {
  function startAs(businessType: string | null) {
    const start = initialState();
    start.accounting = {
      mode: "minty",
      businessType,
      usesSalesCash: true,
    } as WizardState["accounting"];
    return start;
  }

  it("fills Restaurant & Food's Electronic and Delivery lists", async () => {
    serverToday("2001-02-03");
    render(<Harness start={startAs("fnb")} />);
    fireEvent.click(screen.getByRole("button", { name: /auto fill default settings/i }));
    await waitFor(() =>
      expect(latest.pettyCash.electronicMethods).toEqual([
        "Visa",
        "Alipay",
        "WeChat Pay",
        "Mastercard",
        "UnionPay",
        "Amex",
        "Octopus",
      ]),
    );
    expect(latest.pettyCash.deliveryMethods).toEqual(["Food Panda", "Keeta", "OpenRice"]);
  });

  it.each(["retail", "service", "general"])(
    "fills a %s business's Non-cash list with Bank Transfer first and no delivery",
    async (businessType) => {
      serverToday("2001-02-03");
      render(<Harness start={startAs(businessType)} />);
      fireEvent.click(screen.getByRole("button", { name: /auto fill default settings/i }));
      await waitFor(() =>
        expect(latest.pettyCash.electronicMethods).toEqual([
          "Bank Transfer",
          "Visa",
          "Mastercard",
          "UnionPay",
          "Amex",
          "Alipay",
          "WeChat Pay",
          "Octopus",
          "FPS",
        ]),
      );
      expect(latest.pettyCash.deliveryMethods).toEqual([]);
    },
  );
});

// The sales accounts screen's ticks decide the lists (owner, 2026-11-17; Figma 464:73 row 2): a list
// shows only while its sales account is ticked, Cash is a card with nothing to add, and with no list
// at all there is nothing to Auto Fill.
describe("StepSalesSetting -- the lists follow the sales accounts", () => {
  function startWith(
    businessType: string | null,
    ticks: { cash?: boolean; electronic?: boolean | null; delivery?: boolean | null },
  ) {
    const start = initialState();
    start.accounting = {
      mode: "minty",
      businessType,
      usesSalesCash: ticks.cash ?? true,
      sellsElectronic: ticks.electronic ?? null,
      sellsDelivery: ticks.delivery ?? null,
    } as WizardState["accounting"];
    return start;
  }
  const list = (name: string) => screen.queryByRole("list", { name: `${name} methods` });

  it("shows Electronic, Delivery and the Cash card for Restaurant & Food by default", () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("fnb", {})} />);
    expect(list("Electronic")).toBeInTheDocument();
    expect(list("Delivery")).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing to add: your daily report asks for one cash total/),
    ).toBeInTheDocument();
  });

  it("hides Delivery when Sales - Delivery is not ticked", () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("fnb", { electronic: true, delivery: false })} />);
    expect(list("Electronic")).toBeInTheDocument();
    expect(list("Delivery")).toBeNull();
  });

  it("shows a retail shop's Delivery list beside its Electronic list when Delivery is ticked", () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("retail", { electronic: true, delivery: true })} />);
    expect(list("Electronic")).toBeInTheDocument();
    expect(list("Delivery")).toBeInTheDocument();
  });

  it("drops the Cash card for a company banking all its sales", () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("fnb", { cash: false })} />);
    expect(
      screen.queryByText(/Nothing to add: your daily report asks for one cash total/),
    ).toBeNull();
  });

  it("with only Sales - Cash ticked, shows no list and no Auto Fill", () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("fnb", { electronic: false, delivery: false })} />);
    expect(list("Electronic")).toBeNull();
    expect(list("Delivery")).toBeNull();
    expect(screen.queryByRole("button", { name: /auto fill default settings/i })).toBeNull();
    expect(
      screen.getByText(
        "Only Sales - Cash is ticked, so there are no payment or delivery methods to add.",
      ),
    ).toBeInTheDocument();
  });

  it("Auto Fill fills only the lists shown", async () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("fnb", { electronic: false, delivery: true })} />);
    fireEvent.click(screen.getByRole("button", { name: /auto fill default settings/i }));
    await waitFor(() =>
      expect(latest.pettyCash.deliveryMethods).toEqual(["Food Panda", "Keeta", "OpenRice"]),
    );
    expect(latest.pettyCash.electronicMethods).toEqual([]);
  });
});

// Opening Balance is its own sub-step (owner, 2026-11-18): Sales first - its Save & Next saves the
// methods and opens Opening Balance, whose Back returns to Sales and whose Save & Next moves on.
describe("StepSalesSetting -- Sales, then Opening Balance", () => {
  function renderSteps() {
    const next = vi.fn();
    const submitSalesMethods = vi.fn(() => Promise.resolve({ ok: true as const }));
    const submitOpeningBalance = vi.fn(() => Promise.resolve({ ok: true as const }));
    function Steps() {
      const [state, setState] = useState<WizardState>(initialState());
      useEffect(() => remember(state), [state]);
      return (
        <ToastProvider>
          <StepSalesSetting
            state={state}
            set={(patch) =>
              setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }))
            }
            next={next}
            back={vi.fn()}
            submitSalesMethods={submitSalesMethods}
            submitOpeningBalance={submitOpeningBalance}
            saveAndExit={vi.fn()}
          />
        </ToastProvider>
      );
    }
    render(<Steps />);
    return { next, submitSalesMethods, submitOpeningBalance };
  }

  it("Sales asks no opening balance; its Save & Next saves the methods and opens Opening Balance", async () => {
    serverToday("2001-02-03");
    const { next, submitSalesMethods } = renderSteps();
    expect(screen.queryByText("Petty Cash Opening Balance")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    expect(await screen.findByText("Petty Cash Opening Balance")).toBeInTheDocument();
    expect(submitSalesMethods).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(screen.queryByText("Type of sales method of your company")).toBeNull();
  });

  it("Opening Balance: Back returns to Sales; Save & Next needs the balance, then moves on", async () => {
    serverToday("2001-02-03");
    const { next, submitOpeningBalance } = renderSteps();
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    await screen.findByText("Petty Cash Opening Balance");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("Type of sales method of your company")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    await screen.findByText("Petty Cash Opening Balance");
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    expect(await screen.findByText("I'll need a starting balance here.")).toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(submitOpeningBalance).toHaveBeenCalled();
  });
});
