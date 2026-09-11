import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MyLifeDrawer } from "../MyLifeDrawer";

describe("MyLifeDrawer", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <MyLifeDrawer isOpen={false} onClose={() => {}}>
        <div>Drawer Content</div>
      </MyLifeDrawer>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Drawer Content")).toBeNull();
  });

  it("renders scrim, sheet container, drag handle, and children when isOpen is true", () => {
    render(
      <MyLifeDrawer isOpen={true} onClose={() => {}}>
        <div data-testid="drawer-child">Drawer Content</div>
      </MyLifeDrawer>
    );

    expect(screen.getByTestId("drawer-child")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onClose when the scrim/backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MyLifeDrawer isOpen={true} onClose={onClose}>
        <div>Drawer Content</div>
      </MyLifeDrawer>
    );

    // Scrim is the backdrop with fixed inset-0 and bg-black/60
    const scrim = container.querySelector(".fixed.inset-0.bg-black\\/60");
    expect(scrim).not.toBeNull();

    if (scrim) {
      fireEvent.click(scrim);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <MyLifeDrawer isOpen={true} onClose={onClose}>
        <div>Drawer Content</div>
      </MyLifeDrawer>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("animates visible state to true after requestAnimationFrame", () => {
    vi.useFakeTimers();
    const { container } = render(
      <MyLifeDrawer isOpen={true} onClose={() => {}}>
        <div>Drawer Content</div>
      </MyLifeDrawer>
    );

    const sheet = screen.getByRole("dialog");
    const scrim = container.querySelector(".fixed.inset-0.bg-black\\/60");

    // Initially before rAF fires
    expect(sheet.style.transform).toBe("translateY(100%)");
    expect(scrim?.className).toContain("opacity-0");

    // Advance timers so rAF fires
    act(() => {
      vi.runAllTimers();
    });

    expect(sheet.style.transform).toBe("translateY(0)");
    expect(scrim?.className).toContain("opacity-100");
    expect(sheet.style.transition).toBe(
      "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)"
    );

    vi.useRealTimers();
  });

  it("applies required styling classes to sheet container and children container", () => {
    render(
      <MyLifeDrawer isOpen={true} onClose={() => {}}>
        <div data-testid="test-content">Content</div>
      </MyLifeDrawer>
    );

    const sheet = screen.getByRole("dialog");
    expect(sheet.className).toContain("fixed");
    expect(sheet.className).toContain("bottom-0");
    expect(sheet.className).toContain("left-0");
    expect(sheet.className).toContain("right-0");
    expect(sheet.className).toContain("z-[46]");
    expect(sheet.className).toContain("max-h-[70vh]");
    expect(sheet.className).toContain("bg-zinc-900");
    expect(sheet.className).toContain("rounded-t-2xl");
    expect(sheet.className).toContain("border-t");
    expect(sheet.className).toContain("border-zinc-700/50");
    expect(sheet.className).toContain("pb-[calc(7rem+env(safe-area-inset-bottom))]");

    // Children parent container
    const contentArea = screen.getByTestId("test-content").parentElement;
    expect(contentArea?.className).toContain("flex-1");
    expect(contentArea?.className).toContain("min-h-0");
    expect(contentArea?.className).toContain("px-5");
    expect(contentArea?.className).toContain("pb-4");
    expect(contentArea?.className).toContain("flex");
    expect(contentArea?.className).toContain("flex-col");
    expect(contentArea?.className).toContain("overflow-y-auto");
  });

  it("locks body scroll when opened and restores it on unmount", () => {
    const { unmount } = render(
      <MyLifeDrawer isOpen={true} onClose={() => {}}>
        <div>Drawer Content</div>
      </MyLifeDrawer>
    );

    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
