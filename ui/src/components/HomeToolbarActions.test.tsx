// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackToChatToolbarAction } from "./HomeToolbarActions";

vi.mock("@/lib/router", () => ({
  Link: ({
    to,
    children,
  }: {
    to: string;
    children: ReactNode;
  }) => <a href={to}>{children}</a>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("BackToChatToolbarAction", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("renders the back-to-chat CTA to /home", () => {
    act(() => {
      root.render(<BackToChatToolbarAction />);
    });

    expect(container.textContent).toContain("Back to Chat");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/home");
  });
});
