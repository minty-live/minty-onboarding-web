// components/OnboardingSteps StepSalesSetting -- Step 5's opening date default.
//
// The date's limit is the SERVER's Hong Kong "today" (/api/onboarding/server-time), so its
// default comes from there too, never the browser's clock: a browser a day ahead used to
// default to a date the API then refused as "in the future". A date the user picked, or one a
// saved draft brought back, is never replaced.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        "PayMe",
        "JCB",
      ]),
    );
    expect(latest.pettyCash.deliveryMethods).toEqual(["Foodpanda", "Keeta", "OpenRice"]);
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
          "PayMe",
          "JCB",
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
  // A list's card, found by its add field: an empty list draws no rows (owner, 2026-11-26).
  const list = (name: string) => screen.queryByLabelText(`New ${name} method`);

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
    expect(screen.getByRole("note")).toHaveTextContent(
      "Only Sales - Cash is ticked in Accounting Setup, so there is nothing to add here. Tick Sales - Electronic Payment or Sales - Delivery there to add methods.",
    );
  });

  it("Auto Fill fills only the lists shown", async () => {
    serverToday("2001-02-03");
    render(<Harness start={startWith("fnb", { electronic: false, delivery: true })} />);
    fireEvent.click(screen.getByRole("button", { name: /auto fill default settings/i }));
    await waitFor(() =>
      expect(latest.pettyCash.deliveryMethods).toEqual(["Foodpanda", "Keeta", "OpenRice"]),
    );
    expect(latest.pettyCash.electronicMethods).toEqual([]);
  });
});

// Opening Balance is its own sub-step (owner, 2026-11-18): Sales first - its Save & Next saves the
// methods and opens Opening Balance, whose Back returns to Sales and whose Save & Next moves on.
describe("StepSalesSetting -- Sales, then Opening Balance", () => {
  function renderSteps(
    skipResult: () => Promise<{ ok: true } | { ok: false; error: string }> = () =>
      Promise.resolve({ ok: true as const }),
  ) {
    const next = vi.fn();
    const submitSalesMethods = vi.fn(() => Promise.resolve({ ok: true as const }));
    const submitOpeningBalance = vi.fn(() => Promise.resolve({ ok: true as const }));
    const skipOpeningBalance = vi.fn(skipResult);
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
            skipOpeningBalance={skipOpeningBalance}
            saveAndExit={vi.fn()}
          />
        </ToastProvider>
      );
    }
    render(<Steps />);
    return { next, submitSalesMethods, submitOpeningBalance, skipOpeningBalance };
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

  // The page (owner, 2026-11-26): a one-sentence subtitle, "Start date" with no TODAY badge, the
  // amount's own label, one info box, and Skip for now (the balance then stays not set).
  async function openOpening(r: ReturnType<typeof renderSteps>) {
    fireEvent.click(screen.getByRole("button", { name: /Save & Next/ }));
    await screen.findByText("Petty Cash Opening Balance");
    return r;
  }

  it("Opening Balance says what to count, with no TODAY badge", async () => {
    serverToday("2001-02-03");
    const { container } = { container: document.body };
    await openOpening(renderSteps());
    expect(screen.getByText("Tell Minty how much cash you're starting with.")).toBeInTheDocument();
    expect(screen.getByText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText(/Cash in your petty cash box on that day/)).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Count the cash in your petty cash box at the start of that day and enter it here. Minty tracks every expense and top-up from this amount.",
    );
    expect(screen.queryByRole("button", { name: /Watch how/ })).toBeNull();
    expect(container.querySelector(".mdp-today-tag")).toBeNull();
    expect(screen.queryByText(/put today/)).toBeNull();
  });

  it("Skip for now leaves the balance unsaved and moves on", async () => {
    serverToday("2001-02-03");
    const r = await openOpening(renderSteps());
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(r.next).toHaveBeenCalledTimes(1));
    expect(r.skipOpeningBalance).toHaveBeenCalledTimes(1);
    expect(r.submitOpeningBalance).not.toHaveBeenCalled();
  });

  it("a refused skip says why and stays", async () => {
    serverToday("2001-02-03");
    const r = await openOpening(
      renderSteps(() => Promise.resolve({ ok: false as const, error: "That didn't go through." })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText("That didn't go through.")).toBeInTheDocument();
    expect(r.next).not.toHaveBeenCalled();
    expect(screen.getByText("Petty Cash Opening Balance")).toBeInTheDocument();
  });
});

// Auto Fill's nudge (owner, 2026-11-26): with nothing added and Auto Fill not pressed for 5 seconds,
// a shimmer runs across the button every few seconds; it stops for good on a click or the first add.
describe("StepSalesSetting -- Auto Fill's shimmer", () => {
  function startWith(electronic: string[]) {
    const start = initialState();
    start.accounting = {
      mode: "minty",
      businessType: "retail",
      usesSalesCash: true,
    } as WizardState["accounting"];
    start.pettyCash = { ...start.pettyCash, electronicMethods: electronic };
    return start;
  }
  const autoFill = () => document.querySelector(".autofill-btn") as HTMLElement;
  const shimmering = () => autoFill().classList.contains("is-shimmer");
  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts after 5 seconds with nothing added", () => {
    serverToday("2001-02-03");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start={startWith([])} />);
    wait(4900);
    expect(shimmering()).toBe(false);
    wait(100);
    expect(shimmering()).toBe(true);
  });

  it("stops for good once Auto Fill is clicked", () => {
    serverToday("2001-02-03");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start={startWith([])} />);
    wait(5000);
    fireEvent.click(autoFill());
    expect(shimmering()).toBe(false);
    // Revert empties the list again: still no shimmer.
    fireEvent.click(autoFill());
    expect(latest.pettyCash.electronicMethods).toEqual([]);
    wait(20000);
    expect(shimmering()).toBe(false);
  });

  it("stops at the first method added", () => {
    serverToday("2001-02-03");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start={startWith([])} />);
    wait(5000);
    fireEvent.change(screen.getByPlaceholderText("Enter payment method name"), {
      target: { value: "PayMe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(latest.pettyCash.electronicMethods).toEqual(["PayMe"]);
    expect(shimmering()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete PayMe" }));
    wait(20000);
    expect(shimmering()).toBe(false);
  });

  it("never runs on a page that opens with methods", () => {
    serverToday("2001-02-03");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start={startWith(["Visa"])} />);
    wait(20000);
    expect(shimmering()).toBe(false);
  });
});
