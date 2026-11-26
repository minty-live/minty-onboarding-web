// StepInvite's arrival prompt -- "The following setup steps require accounting expertise".
//
// It opens on its own every time the step mounts, in minty-web's modal design, and recommends
// inviting an accountant or bookkeeper (no "Xero" in it: owner, 2026-11-26). Two buttons: "Go to
// invite" closes it and stays on the step (so do Escape and a click on the backdrop); "Skip for
// now" goes straight to the next step.
//
// The email field refuses the signed-in person's own address as it is typed (owner, 2026-11-26):
// "That's you ..." under the field and Send disabled. The API's 409 still stands behind it.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepInvite } from "../OnboardingSteps";
import { ToastProvider } from "../Toast";
import type { StepProps } from "../../lib/types";

const loadMyEmail = vi.fn<() => Promise<string | null>>();
vi.mock("../../lib/profileApi", () => ({ loadMyEmail: () => loadMyEmail() }));

beforeEach(() => {
  loadMyEmail.mockResolvedValue("me@example.com");
});

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
  it("opens on arrival and recommends an accountant without naming Xero", () => {
    renderStep();
    expect(prompt()).toBeInTheDocument();
    expect(prompt()).toHaveTextContent(
      "We recommend inviting your accountant or bookkeeper to help with these steps.",
    );
    expect(prompt()).not.toHaveTextContent(/Xero/);
  });

  it("has Go to invite and Skip for now, and no Ok", () => {
    renderStep();
    expect(screen.getByRole("button", { name: "Go to invite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ok" })).not.toBeInTheDocument();
  });

  it("Go to invite closes it and stays on the step", async () => {
    const { next } = renderStep();
    await userEvent.click(screen.getByRole("button", { name: "Go to invite" }));
    expect(prompt()).not.toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
  });

  it("Skip for now goes straight to the next step", async () => {
    const { next } = renderStep();
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(prompt()).not.toBeInTheDocument();
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

describe("inviting yourself", () => {
  const SELF = "That's you — you're already in this entity. No need to invite yourself.";
  const send = () => screen.getByRole("button", { name: "Send Invitation" });

  async function fillAllBut(email: string) {
    await userEvent.click(screen.getByRole("button", { name: "Go to invite" }));
    await userEvent.type(screen.getByPlaceholderText("Enter first name"), "Me");
    await userEvent.type(screen.getByPlaceholderText("Enter last name"), "Owner");
    await userEvent.click(screen.getByText("Select a role"));
    await userEvent.click(screen.getAllByRole("option")[0]);
    await userEvent.type(screen.getByPlaceholderText("Enter email address"), email);
  }

  it("says so under the field and disables Send, whatever the case and spaces", async () => {
    renderStep();
    await waitFor(() => expect(loadMyEmail).toHaveBeenCalled());
    await fillAllBut("ME@Example.com ");
    const field = screen.getByPlaceholderText("Enter email address");
    expect(await screen.findByText(SELF)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toContain("invite-email-self");
    expect(send()).toBeDisabled();
  });

  it("clears as soon as the email is someone else's", async () => {
    renderStep();
    await fillAllBut("me@example.com");
    expect(await screen.findByText(SELF)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Enter email address"), "x");
    expect(screen.queryByText(SELF)).not.toBeInTheDocument();
    expect(send()).toBeEnabled();
  });

  it("leaves Send to the API when the person's email can't be read", async () => {
    loadMyEmail.mockRejectedValue(new Error("offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderStep();
    await fillAllBut("me@example.com");
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.queryByText(SELF)).not.toBeInTheDocument();
    expect(send()).toBeEnabled();
    error.mockRestore();
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
    await userEvent.click(screen.getByRole("button", { name: "Go to invite" })); // the arrival prompt
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
    await userEvent.click(screen.getByRole("button", { name: "Go to invite" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(question()).not.toBeInTheDocument();
    expect(cancelInvite).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("Escape keeps the invitation", async () => {
    const { cancelInvite } = renderWithInvite();
    await userEvent.click(screen.getByRole("button", { name: "Go to invite" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.keyboard("{Escape}");
    expect(question()).not.toBeInTheDocument();
    expect(cancelInvite).not.toHaveBeenCalled();
  });
});
