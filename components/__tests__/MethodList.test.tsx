// components/steps/pettyCashFields::MethodList -- the add/remove/reorder list used for
// the electronic and delivery payment methods.
//
// It owns more state than anything else in the file (adding, name, dragIdx, overIdx)
// but it owns NONE of the data: every mutation goes out through `onChange` with a
// fresh array. That is the property worth pinning -- a `methods.splice(...)` in place
// would appear to work in the browser and silently fail to re-render.
//
// Drag and drop is driven with fireEvent rather than userEvent: jsdom implements no
// HTML5 drag protocol, so the dataTransfer object is supplied by hand. That means
// these tests check the component's REORDER LOGIC, not that a real mouse drag works.

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MethodList } from "../steps/pettyCashFields";

const METHODS = ["Cash", "Octopus", "FPS"];

function setup(props = {}) {
  const onAdd = vi.fn();
  const onChange = vi.fn();
  const utils = render(
    <MethodList
      title="Electronic"
      methods={METHODS}
      onAdd={onAdd}
      onChange={onChange}
      {...props}
    />,
  );
  const rows = () => Array.from(utils.container.querySelectorAll(".method-row"));
  const names = () =>
    rows().map(
      (r) => within(r as HTMLElement).getByText(/.+/, { selector: ".method-name" }).textContent,
    );
  return { onAdd, onChange, rows, names, ...utils };
}

describe("rendering", () => {
  it("renders the title and one row per method, in order", () => {
    const { names } = setup();
    expect(screen.getByText("Electronic")).toBeInTheDocument();
    expect(names()).toEqual(METHODS);
  });

  it("renders an empty list with its add field ready", () => {
    const { rows } = setup({ methods: [] });
    expect(rows()).toHaveLength(0);
    expect(screen.getByPlaceholderText("Enter method name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
  });

  it("says which sales account the list is for", () => {
    setup({ account: "Sales - Electronic Payment" });
    expect(screen.getByText("For your Sales - Electronic Payment account")).toBeInTheDocument();
  });

  it("shows the sparkle only when the list was auto-filled", () => {
    const { container, rerender } = setup();
    expect(container.querySelector(".method-sparkle")).toBeNull();
    rerender(
      <MethodList
        title="Electronic"
        methods={METHODS}
        onAdd={vi.fn()}
        onChange={vi.fn()}
        autoFilled
      />,
    );
    expect(container.querySelector(".method-sparkle")).toBeTruthy();
  });

  it("gives each row an accessible delete and drag control", () => {
    setup();
    expect(screen.getByRole("button", { name: "Delete Octopus" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag to reorder Octopus" })).toBeInTheDocument();
  });
});

// Figma 464:73 row 2: the add field is always there, "+ Add" beside it (no form to open).
describe("adding", () => {
  const field = () => screen.getByPlaceholderText("Enter method name");
  const addButton = () => screen.getByRole("button", { name: /Add/ });

  it("uses a caller-supplied placeholder", () => {
    setup({ placeholder: "Enter delivery method" });
    expect(screen.getByPlaceholderText("Enter delivery method")).toBeInTheDocument();
  });

  it("keeps Add disabled until something is typed", async () => {
    setup();
    expect(addButton()).toBeDisabled();
    await userEvent.type(field(), "PayMe");
    expect(addButton()).toBeEnabled();
  });

  it("treats whitespace as empty", async () => {
    setup();
    await userEvent.type(field(), "   ");
    expect(addButton()).toBeDisabled();
  });

  it("emits the trimmed name and empties the field", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "  PayMe  ");
    await userEvent.click(addButton());
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("PayMe");
    expect(field()).toHaveValue("");
  });

  it("adds on Enter", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "PayMe{Enter}");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("PayMe");
  });

  it("does not add an empty name on Enter", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("forgets the draft on Escape", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "PayMe{Escape}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(field()).toHaveValue("");
  });

  it("refuses a name the list already has, whatever its case, and says so", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "octopus");
    expect(addButton()).toBeDisabled();
    expect(screen.getByText("Octopus is already in this list.")).toBeInTheDocument();
    await userEvent.type(field(), "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not add to the list itself -- the parent owns the data", async () => {
    const { onChange, names } = setup();
    await userEvent.type(field(), "PayMe{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(names()).toEqual(METHODS);
  });
});

describe("removing", () => {
  it("emits the list without the removed entry", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete Octopus" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["Cash", "FPS"]);
  });

  it("removes the first and the last correctly", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete Cash" }));
    expect(a.onChange).toHaveBeenCalledWith(["Octopus", "FPS"]);
    a.unmount();

    const b = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete FPS" }));
    expect(b.onChange).toHaveBeenCalledWith(["Cash", "Octopus"]);
  });

  it("does not mutate the array it was given", async () => {
    const methods = [...METHODS];
    const onChange = vi.fn();
    render(<MethodList title="t" methods={methods} onAdd={vi.fn()} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Octopus" }));
    // An in-place splice would pass the assertion above and still fail to re-render,
    // because React would see the same array reference.
    expect(methods).toEqual(METHODS);
    expect(onChange.mock.calls[0][0]).not.toBe(methods);
  });
});

describe("reordering by drag", () => {
  /** jsdom has no DragEvent, so the transfer object is supplied by hand. */
  const transfer = () => ({
    effectAllowed: "",
    dropEffect: "",
    setData: vi.fn(),
    getData: vi.fn(),
  });

  function drag(rows: Element[], from: number, to: number) {
    const handle = within(rows[from] as HTMLElement).getByRole("button", {
      name: /Drag to reorder/,
    });
    fireEvent.dragStart(handle, { dataTransfer: transfer() });
    fireEvent.dragOver(rows[to], { dataTransfer: transfer() });
    fireEvent.drop(rows[to], { dataTransfer: transfer() });
  }

  it("moves an item down the list", () => {
    const { rows, onChange } = setup();
    drag(rows(), 0, 2);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["Octopus", "FPS", "Cash"]);
  });

  it("moves an item up the list", () => {
    const { rows, onChange } = setup();
    drag(rows(), 2, 0);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["FPS", "Cash", "Octopus"]);
  });

  it("does nothing when dropped on itself", () => {
    const { rows, onChange } = setup();
    drag(rows(), 1, 1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does nothing when a drop arrives with no drag in progress", () => {
    const { rows, onChange } = setup();
    fireEvent.drop(rows()[1], { dataTransfer: transfer() });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the dragged row and the row under the cursor", () => {
    const { rows } = setup();
    const handle = within(rows()[0] as HTMLElement).getByRole("button", {
      name: /Drag to reorder/,
    });
    fireEvent.dragStart(handle, { dataTransfer: transfer() });
    fireEvent.dragOver(rows()[2], { dataTransfer: transfer() });
    expect(rows()[0].className).toContain("is-dragging");
    expect(rows()[2].className).toContain("is-drag-over");
    // Never both on the same row.
    fireEvent.dragOver(rows()[0], { dataTransfer: transfer() });
    expect(rows()[0].className).not.toContain("is-drag-over");
  });

  it("clears the markers when the drag ends without a drop", () => {
    const { rows, container } = setup();
    const handle = within(rows()[0] as HTMLElement).getByRole("button", {
      name: /Drag to reorder/,
    });
    fireEvent.dragStart(handle, { dataTransfer: transfer() });
    fireEvent.dragOver(rows()[1], { dataTransfer: transfer() });
    fireEvent.dragEnd(handle);
    expect(container.querySelector(".is-dragging")).toBeNull();
    expect(container.querySelector(".is-drag-over")).toBeNull();
  });

  it("clears the hover marker on drag leave", () => {
    const { rows, container } = setup();
    const handle = within(rows()[0] as HTMLElement).getByRole("button", {
      name: /Drag to reorder/,
    });
    fireEvent.dragStart(handle, { dataTransfer: transfer() });
    fireEvent.dragOver(rows()[1], { dataTransfer: transfer() });
    fireEvent.dragLeave(rows()[1]);
    expect(container.querySelector(".is-drag-over")).toBeNull();
  });

  it("survives a drag event with no dataTransfer at all", () => {
    // Some browsers and some synthetic events omit it; the guards exist for that.
    const { rows, onChange } = setup();
    const handle = within(rows()[0] as HTMLElement).getByRole("button", {
      name: /Drag to reorder/,
    });
    expect(() => {
      fireEvent.dragStart(handle);
      fireEvent.dragOver(rows()[1]);
      fireEvent.drop(rows()[1]);
    }).not.toThrow();
    expect(onChange).toHaveBeenCalledWith(["Octopus", "Cash", "FPS"]);
  });

  it("does not mutate the array it was given", () => {
    const methods = [...METHODS];
    const onChange = vi.fn();
    const { container } = render(
      <MethodList title="t" methods={methods} onAdd={vi.fn()} onChange={onChange} />,
    );
    const rows = Array.from(container.querySelectorAll(".method-row"));
    drag(rows, 0, 2);
    expect(methods).toEqual(METHODS);
  });

  it("moves a chip with the arrow keys for keyboard users", () => {
    const { rows, onChange } = setup();
    const handle = within(rows()[0] as HTMLElement).getByRole("button", {
      name: /Drag to reorder/,
    });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(["Octopus", "Cash", "FPS"]);
    const last = within(rows()[2] as HTMLElement).getByRole("button", { name: /Drag to reorder/ });
    fireEvent.keyDown(last, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(["Cash", "FPS", "Octopus"]);
    onChange.mockClear();
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
