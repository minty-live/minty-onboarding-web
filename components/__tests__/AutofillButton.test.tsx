// components/AutofillButton -- the one Auto Fill button (Petty Cash's Sales methods and Accounting
// Setup's account lists). Its shimmer is opt-in (owner, 2026-11-26): only Sales methods asks for it,
// so Accounting Setup's button, which passes nothing, never shimmers.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AutofillButton from "../AutofillButton";

describe("AutofillButton", () => {
  it("does not shimmer unless asked", () => {
    render(<AutofillButton active={false} onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Auto Fill/ })).not.toHaveClass("is-shimmer");
  });

  it("shimmers when asked", () => {
    render(<AutofillButton active={false} onClick={vi.fn()} shimmer />);
    expect(screen.getByRole("button", { name: /Auto Fill/ })).toHaveClass("is-shimmer");
  });
});
