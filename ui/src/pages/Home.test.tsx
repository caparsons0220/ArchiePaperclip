// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
const mockSetPageToolbar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/router", () => ({
  Link: ({
    to,
    children,
  }: {
    to: string;
    children: ReactNode;
  }) => <a href={to}>{children}</a>,
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({
    setBreadcrumbs: mockSetBreadcrumbs,
    setPageToolbar: mockSetPageToolbar,
  }),
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompany: { id: "company-1", name: "Archie Labs" },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderElement(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<>{node}</>);
  });
  return { container, root };
}

describe("Home", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSetBreadcrumbs.mockReset();
    mockSetPageToolbar.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("registers the Open Dashboard toolbar CTA", () => {
    act(() => {
      root.render(<Home />);
    });

    expect(mockSetBreadcrumbs).toHaveBeenCalledWith([{ label: "Home" }]);
    expect(mockSetPageToolbar).toHaveBeenCalled();

    const toolbarNode = mockSetPageToolbar.mock.calls[0]?.[0];
    const toolbar = renderElement(toolbarNode);
    expect(toolbar.container.textContent).toContain("Open Dashboard");
    expect(toolbar.container.querySelector("a")?.getAttribute("href")).toBe("/dashboard");
    act(() => {
      toolbar.root.unmount();
    });
    toolbar.container.remove();
  });

  it("keeps submit local-only and lets chips prefill the composer", () => {
    act(() => {
      root.render(<Home />);
    });

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    const chip = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Plan our next product push"),
    );
    expect(chip).not.toBeNull();

    act(() => {
      chip!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect((textarea as HTMLTextAreaElement).value).toContain("Plan our next product push");

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    act(() => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("This home composer is visual-only for now.");
  });
});
