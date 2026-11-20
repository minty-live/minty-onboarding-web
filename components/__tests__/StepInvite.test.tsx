// StepInvite's arrival prompt -- "The following setup steps require accounting expertise".
//
// It opens on its own every time the step mounts, in minty-web's modal design. Its one
// button, "Ok", only closes it (the user stays to invite someone); so do Escape and a click
// on the backdrop. There is no Skip: a user with nobody to invite uses "Add later".

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepInvite } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import type { StepProps } from "../../lib/types";

function renderStep() {
  const next = vi.fn();
  render(
    <ToastProvider>
      <StepInvite
        state={{ invites: [] } as unknown as StepProps["state"]}
        set={vi.fn()}
        next={next}
        back={vi.fn()}
        submitInvite={vi.fn()}
        cancelInvite={vi.fn()}
        resendInvite={vi.fn()}
        saveAndExit={vi.fn()}
      />
    </ToastProvider>,
  );
  return { next };
}

const prompt = () => screen.queryByRole("dialog", { name: /require accounting expertise/ });

describe("StepInvite arrival prompt", () => {
  it("opens on arrival", () => {
    renderStep();
    expect(prompt()).toBeInTheDocument();
  });

  it("Ok closes it and stays on the step", async () => {
    const { next } = renderStep();
    await userEvent.click(screen.getByRole("button", { name: "Ok" }));
    expect(prompt()).not.toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
  });

  it('has no Skip button and no "invite users now?" question', () => {
    renderStep();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.queryByText(/invite users now/i)).not.toBeInTheDocument();
  });

  it("Escape closes it and stays on the step", async () => {
    const { next } = renderStep();
    await userEvent.keyboard("{Escape}");
    expect(prompt()).not.toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
  });

  it("a click on the backdrop closes it and stays on the step", async () => {
    const { next } = renderStep();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(prompt()).not.toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
  });
});

// A sent invitation's X asks first (plan item 6, 2026-11-20): "Cancel the invitation to <email>?"
// - Cancel invitation sends POST /invite/cancel; Go back, Escape and the backdrop change nothing.
describe("cancelling a sent invitation", () => {
  const SENT = {
    id: "inv-1",
    first: "Ada",
    last: "Lee",
    email: "ada@example.com",
    role: "cashier",
  };

  function renderWithInvite() {
    const cancelInvite = vi.fn(async () => ({ ok: true as const }));
    const set = vi.fn();
    render(
      <ToastProvider>
        <StepInvite
          state={{ invites: [SENT] } as unknown as StepProps["state"]}
          set={set}
          next={vi.fn()}
          back={vi.fn()}
          submitInvite={vi.fn()}
          cancelInvite={cancelInvite}
          resendInvite={vi.fn()}
          saveAndExit={vi.fn()}
        />
      </ToastProvider>,
    );
    return { cancelInvite, set };
  }
  const question = () =>
    screen.queryByRole("dialog", { name: "Cancel the invitation to ada@example.com?" });

  it("asks before cancelling, and Cancel invitation cancels it", async () => {
    const { cancelInvite, set } = renderWithInvite();
    await userEvent.click(screen.getByRole("button", { name: "Ok" })); // the arrival prompt
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(question()).toBeInTheDocument();
    expect(cancelInvite).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel invitation" }));
    expect(cancelInvite).toHaveBeenCalledWith("inv-1");
    expect(set).toHaveBeenCalledWith({ invites: [] });
    expect(question()).not.toBeInTheDocument();
  });

  it("Go back keeps the invitation", async () => {
    const { cancelInvite, set } = renderWithInvite();
    await userEvent.click(screen.getByRole("button", { name: "Ok" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(question()).not.toBeInTheDocument();
    expect(cancelInvite).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("Escape keeps the invitation", async () => {
    const { cancelInvite } = renderWithInvite();
    await userEvent.click(screen.getByRole("button", { name: "Ok" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.keyboard("{Escape}");
    expect(question()).not.toBeInTheDocument();
    expect(cancelInvite).not.toHaveBeenCalled();
  });
});
