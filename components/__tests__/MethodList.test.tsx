// components/steps/pettyCashFields::MethodList -- the add/remove/reorder list used for
// the electronic and delivery payment methods.
//
// It owns more state than anything else in the file (adding, name, dragIdx, overIdx)
// but it owns NONE of the data: every mutation goes out through `onChange` with a
// fresh array. That is the property worth pinning -- a `methods.splice(...)` in place
// would appear to work in the browser and silently fail to re-render.
//
// Dragging is pointer events on the handle (mouse, finger and pen alike; owner, 2026-11-26).
// jsdom has no PointerEvent and no layout, so a MouseEvent stands in for it and each row is given
// a 50px box by hand: these tests check the REORDER LOGIC; e2e/sales-methods.spec.ts drags for real.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

describe("rows (owner, 2026-11-26)", () => {
  it("draws each method as a full-width row, not a chip", () => {
    const { container, rows } = setup();
    expect(container.querySelector("ul.method-list")).toBeTruthy();
    expect(rows()).toHaveLength(3);
    expect(container.querySelector(".pc-chip")).toBeNull();
    METHODS.forEach((m, i) => {
      const row = rows()[i] as HTMLElement;
      expect(within(row).getByRole("button", { name: "Drag to reorder " + m })).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Delete " + m })).toBeInTheDocument();
    });
  });

  it("draws no list at all while it is empty", () => {
    const { container } = setup({ methods: [] });
    expect(container.querySelector("ul.method-list")).toBeNull();
  });
});

describe("the Add button and a new row", () => {
  const field = () => screen.getByPlaceholderText("Enter method name");
  const addButton = () => screen.getByRole("button", { name: /Add/ });

  // Always the primary button: its disabled state is the app's grey, not-allowed look (globals.css
  // `.btn-primary[disabled]`). The outline button had no disabled look and seemed clickable.
  it("is a disabled primary while empty or a duplicate, and enabled once a new name is typed", async () => {
    setup();
    expect(addButton()).toBeDisabled();
    expect(addButton()).toHaveClass("btn-primary");
    expect(addButton()).not.toHaveClass("btn-ghost");
    await userEvent.type(field(), "PayMe");
    expect(addButton()).toBeEnabled();
    expect(addButton()).toHaveClass("btn-primary");
    await userEvent.clear(field());
    await userEvent.type(field(), "octopus");
    expect(addButton()).toBeDisabled();
  });

  it("keeps the focus in the field after Add is clicked", async () => {
    setup();
    await userEvent.type(field(), "PayMe");
    await userEvent.click(addButton());
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue("");
  });

  it("highlights the new row for 1.5 seconds", () => {
    vi.useFakeTimers();
    try {
      const onAdd = vi.fn();
      const { rerender, container } = render(
        <MethodList title="Electronic" methods={METHODS} onAdd={onAdd} onChange={vi.fn()} />,
      );
      fireEvent.change(field(), { target: { value: "PayMe" } });
      fireEvent.click(addButton());
      // The parent owns the data: it hands the list back with the new method.
      rerender(
        <MethodList
          title="Electronic"
          methods={[...METHODS, "PayMe"]}
          onAdd={onAdd}
          onChange={vi.fn()}
        />,
      );
      const fresh = () => container.querySelectorAll(".method-row.is-new");
      expect(fresh()).toHaveLength(1);
      expect(fresh()[0]).toHaveTextContent("PayMe");
      act(() => {
        vi.advanceTimersByTime(1400);
      });
      expect(fresh()).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(fresh()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("reordering by drag", () => {
  // jsdom has no PointerEvent: a MouseEvent carries clientY and button, the rest is assigned on.
  beforeAll(() => {
    if (!("PointerEvent" in window)) {
      class FakePointerEvent extends MouseEvent {
        pointerId: number;
        pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 1;
          this.pointerType = init.pointerType ?? "mouse";
        }
      }
      (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Gives row i the box 50*i .. 50*i+50 (jsdom lays nothing out). */
  function layOut(rows: Element[]) {
    rows.forEach((r, i) =>
      vi.spyOn(r, "getBoundingClientRect").mockReturnValue({
        top: i * 50,
        bottom: i * 50 + 50,
        height: 50,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: i * 50,
        toJSON: () => ({}),
      } as DOMRect),
    );
  }
  const handleOf = (row: Element) =>
    within(row as HTMLElement).getByRole("button", { name: /Drag to reorder/ });

  function drag(rows: Element[], from: number, to: number) {
    layOut(rows);
    const handle = handleOf(rows[from]);
    fireEvent.pointerDown(handle, { clientY: from * 50 + 25, button: 0 });
    fireEvent.pointerMove(handle, { clientY: to * 50 + 25 });
    fireEvent.pointerUp(handle, { clientY: to * 50 + 25 });
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

  it("does nothing when the pointer is lifted with no drag in progress", () => {
    const { rows, onChange } = setup();
    fireEvent.pointerUp(handleOf(rows()[1]), { clientY: 10 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("past the ends, drops at the first or the last place", () => {
    const { rows, onChange } = setup();
    layOut(rows());
    const handle = handleOf(rows()[1]);
    fireEvent.pointerDown(handle, { clientY: 75, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 900 });
    fireEvent.pointerUp(handle, { clientY: 900 });
    expect(onChange).toHaveBeenLastCalledWith(["Cash", "FPS", "Octopus"]);
  });

  it("marks the dragged row and the row under the pointer", () => {
    const { rows } = setup();
    layOut(rows());
    const handle = handleOf(rows()[0]);
    fireEvent.pointerDown(handle, { clientY: 25, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 125 });
    expect(rows()[0].className).toContain("is-dragging");
    expect(rows()[2].className).toContain("is-drag-over");
    // Never both on the same row.
    fireEvent.pointerMove(handle, { clientY: 25 });
    expect(rows()[0].className).not.toContain("is-drag-over");
  });

  it("a cancelled pointer drops the drag with no change", () => {
    const { rows, container, onChange } = setup();
    layOut(rows());
    const handle = handleOf(rows()[0]);
    fireEvent.pointerDown(handle, { clientY: 25, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 125 });
    fireEvent.pointerCancel(handle);
    expect(container.querySelector(".is-dragging")).toBeNull();
    expect(container.querySelector(".is-drag-over")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape during a drag drops it with no change", () => {
    const { rows, container, onChange } = setup();
    layOut(rows());
    const handle = handleOf(rows()[0]);
    fireEvent.pointerDown(handle, { clientY: 25, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 125 });
    fireEvent.keyDown(handle, { key: "Escape" });
    fireEvent.pointerUp(handle, { clientY: 125 });
    expect(container.querySelector(".is-dragging")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a right-click", () => {
    const { rows, container, onChange } = setup();
    layOut(rows());
    const handle = handleOf(rows()[0]);
    fireEvent.pointerDown(handle, { clientY: 25, button: 2 });
    fireEvent.pointerMove(handle, { clientY: 125 });
    fireEvent.pointerUp(handle, { clientY: 125 });
    expect(container.querySelector(".is-dragging")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
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
    expect(onChange.mock.calls[0][0]).not.toBe(methods);
  });

  it("moves a row with the arrow keys for keyboard users", () => {
    const { rows, onChange } = setup();
    const handle = handleOf(rows()[0]);
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(["Octopus", "Cash", "FPS"]);
    fireEvent.keyDown(handleOf(rows()[2]), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(["Cash", "FPS", "Octopus"]);
    // Left and Right still work.
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(["Octopus", "Cash", "FPS"]);
    onChange.mockClear();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
