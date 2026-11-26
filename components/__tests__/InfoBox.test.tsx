// components/steps/InfoBox -- the screen's one ⓘ box (owner, 2026-11-26).

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InfoBox from "../steps/InfoBox";

describe("InfoBox", () => {
  it("is a note with the info mark and its text", () => {
    const { container } = render(<InfoBox id="why">Staff pick from these.</InfoBox>);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Staff pick from these.");
    expect(note).toHaveAttribute("id", "why");
    expect(note).toHaveClass("info-box");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });
});
