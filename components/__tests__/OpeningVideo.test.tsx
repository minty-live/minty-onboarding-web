// The Opening Balance box's "Watch how (1 min)" (owner, 2026-11-26): the team prepares the video, so
// the link stays hidden while lib/videos.ts has no URL, and opens a pop-up with the video once set.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("Watch how (1 min)", () => {
  it("is hidden while there is no video", async () => {
    vi.resetModules();
    vi.doMock("../../lib/videos", () => ({ OPENING_BALANCE_VIDEO: null }));
    const { OpeningVideoLink } = await import("../steps/OpeningVideo");
    const { container } = render(<OpeningVideoLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the video in a pop-up once it exists, and Escape closes it", async () => {
    vi.resetModules();
    vi.doMock("../../lib/videos", () => ({ OPENING_BALANCE_VIDEO: "/videos/opening.mp4" }));
    const { OpeningVideoLink } = await import("../steps/OpeningVideo");
    render(<OpeningVideoLink />);
    fireEvent.click(screen.getByRole("button", { name: "Watch how (1 min)" }));
    const dialog = screen.getByRole("dialog", { name: "How to count your opening cash" });
    const video = dialog.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/videos/opening.mp4");
    expect(video).toHaveAttribute("controls");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
