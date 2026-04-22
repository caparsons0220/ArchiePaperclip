// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliAuthPage } from "./CliAuth";

const getSessionMock = vi.hoisted(() => vi.fn());
const getCliAuthChallengeMock = vi.hoisted(() => vi.fn());
const approveCliAuthChallengeMock = vi.hoisted(() => vi.fn());
const cancelCliAuthChallengeMock = vi.hoisted(() => vi.fn());

vi.mock("../api/auth", () => ({
  authApi: {
    getSession: () => getSessionMock(),
  },
}));

vi.mock("../api/access", () => ({
  accessApi: {
    getCliAuthChallenge: (id: string, token: string) => getCliAuthChallengeMock(id, token),
    approveCliAuthChallenge: (id: string, token: string) => approveCliAuthChallengeMock(id, token),
    cancelCliAuthChallenge: (id: string, token: string) => cancelCliAuthChallengeMock(id, token),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("CliAuthPage", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    getSessionMock.mockResolvedValue({
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", name: "Jane Example", email: "jane@example.com", image: null },
    });
    getCliAuthChallengeMock.mockResolvedValue({
      id: "challenge-1",
      status: "pending",
      command: "archie company import",
      clientName: null,
      requestedAccess: "board",
      requestedCompanyId: null,
      requestedCompanyName: null,
      approvedAt: null,
      cancelledAt: null,
      expiresAt: "2026-04-22T12:00:00.000Z",
      approvedByUser: null,
      requiresSignIn: false,
      canApprove: true,
    });
    approveCliAuthChallengeMock.mockResolvedValue(undefined);
    cancelCliAuthChallengeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders Archie Bravo CLI approval copy", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/cli-auth/challenge-1?token=secret-token"]}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route path="/cli-auth/:id" element={<CliAuthPage />} />
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("Approve Archie Bravo CLI access");
    expect(container.textContent).toContain("A local Archie Bravo CLI process is requesting board access to this instance.");
    expect(container.textContent).toContain("Archie Bravo CLI");

    await act(async () => {
      root.unmount();
    });
  });
});
