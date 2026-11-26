// components/MintyDatePicker -- the TODAY badge beside a picked today. Opening Balance turns it off
// (owner, 2026-11-26: the field is labelled "Start date" and defaults to today without a badge).

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MintyDatePicker from "../MintyDatePicker";

const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe("MintyDatePicker's TODAY badge", () => {
  it("shows beside today by default", () => {
    const { container } = render(<MintyDatePicker value={todayIso()} onChange={vi.fn()} />);
    expect(container.querySelector(".mdp-today-tag")).not.toBeNull();
  });

  it("is left out with todayTag={false}", () => {
    const { container } = render(
      <MintyDatePicker value={todayIso()} onChange={vi.fn()} todayTag={false} />,
    );
    expect(container.querySelector(".mdp-today-tag")).toBeNull();
  });
});
