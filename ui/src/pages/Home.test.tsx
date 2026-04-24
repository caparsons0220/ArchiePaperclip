// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeChatModel, HomeChatThread } from "@paperclipai/shared/home-chat";
import { Home } from "./Home";

const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
const mockSetPageToolbar = vi.hoisted(() => vi.fn());
const mockHomeChatApi = vi.hoisted(() => ({
  listModels: vi.fn(),
  listThreads: vi.fn(),
  getThread: vi.fn(),
  createThread: vi.fn(),
  updateThread: vi.fn(),
  streamThread: vi.fn(),
}));

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

vi.mock("@/api/home-chat", () => ({
  homeChatApi: mockHomeChatApi,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const MODELS: HomeChatModel[] = [
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", isDefault: true },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", isDefault: false },
];

function createThread(input: Partial<HomeChatThread> = {}): HomeChatThread {
  return {
    id: input.id ?? "thread-1",
    companyId: input.companyId ?? "company-1",
    ownerUserId: input.ownerUserId ?? "user-1",
    title: input.title ?? "New chat",
    selectedModelId: input.selectedModelId ?? "gpt-5.4",
    messageCount: input.messageCount ?? (input.messages?.length ?? 0),
    preview: input.preview ?? null,
    lastMessageAt: input.lastMessageAt ?? null,
    createdAt: input.createdAt ?? new Date("2026-04-22T12:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-04-22T12:00:00.000Z"),
    messages: input.messages ?? [],
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function renderElement(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <>{node}</>
      </QueryClientProvider>,
    );
  });

  return { container, root, queryClient };
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
    mockHomeChatApi.listModels.mockResolvedValue(MODELS);
    mockHomeChatApi.listThreads.mockResolvedValue([]);
    mockHomeChatApi.getThread.mockResolvedValue(createThread());
    mockHomeChatApi.createThread.mockResolvedValue(createThread());
    mockHomeChatApi.updateThread.mockResolvedValue(createThread());
    mockHomeChatApi.streamThread.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("registers the Open Dashboard toolbar CTA and hydrates an existing thread", async () => {
    const existingThread = createThread({
      id: "thread-existing",
      title: "Launch plan",
      preview: "Need a board-ready update",
      lastMessageAt: "2026-04-22T13:00:00.000Z",
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Need a board-ready update",
          modelId: "gpt-5.4",
          provider: "openai",
          createdAt: "2026-04-22T12:58:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Start with the risks, then show the next three commitments.",
          modelId: "gpt-5.4",
          provider: "openai",
          createdAt: "2026-04-22T12:59:00.000Z",
        },
      ],
      messageCount: 2,
    });
    mockHomeChatApi.listThreads.mockResolvedValue([existingThread]);
    mockHomeChatApi.getThread.mockResolvedValue(existingThread);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Home />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
    await flushReact();

    expect(mockSetBreadcrumbs).toHaveBeenCalledWith([{ label: "Home" }]);
    expect(mockSetPageToolbar).toHaveBeenCalled();
    expect(mockHomeChatApi.listThreads).toHaveBeenCalledWith("company-1");
    expect(mockHomeChatApi.getThread).toHaveBeenCalledWith("company-1", "thread-existing");
    expect(container.textContent).toContain("Launch plan");
    expect(container.textContent).toContain("Need a board-ready update");
    expect(container.textContent).toContain("Start with the risks, then show the next three commitments.");

    const toolbarNode = mockSetPageToolbar.mock.calls[0]?.[0];
    const toolbar = renderElement(toolbarNode);
    expect(toolbar.container.textContent).toContain("Open Dashboard");
    expect(toolbar.container.querySelector("a")?.getAttribute("href")).toBe("/dashboard");
    act(() => {
      toolbar.root.unmount();
    });
    toolbar.container.remove();
  });

  it("creates a new chat from the home sidebar", async () => {
    const newThread = createThread({
      id: "thread-new",
      title: "New chat",
      messages: [],
    });
    mockHomeChatApi.createThread.mockResolvedValue(newThread);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Home />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const newChatButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("New chat"),
    );
    expect(newChatButton).not.toBeNull();

    await act(async () => {
      newChatButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockHomeChatApi.createThread).toHaveBeenCalledWith("company-1", { selectedModelId: "gpt-5.4" });
    expect(container.textContent).toContain("New chat");
  });

  it("prefills the composer from chips and streams a reply into the active thread", async () => {
    const emptyThread = createThread({
      id: "thread-stream",
      title: "New chat",
      messages: [],
    });
    const finalThread = createThread({
      id: "thread-stream",
      title: "Plan our next product push",
      preview: "Here is a plan.",
      lastMessageAt: "2026-04-22T12:05:00.000Z",
      messageCount: 2,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Plan our next product push",
          modelId: "gpt-5.4",
          provider: "openai",
          createdAt: "2026-04-22T12:04:00.000Z",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "Here is a plan.",
          modelId: "gpt-5.4",
          provider: "openai",
          createdAt: "2026-04-22T12:05:00.000Z",
        },
      ],
    });
    mockHomeChatApi.listThreads.mockResolvedValue([emptyThread]);
    mockHomeChatApi.getThread.mockResolvedValueOnce(emptyThread).mockResolvedValue(finalThread);
    mockHomeChatApi.streamThread.mockImplementation(
      async (
        companyId: string,
        threadId: string,
        input: { content: string; modelId?: string },
        onEvent: (event: unknown) => Promise<void> | void,
      ) => {
        expect(companyId).toBe("company-1");
        expect(threadId).toBe("thread-stream");
        expect(input).toEqual({
          content: "Plan our next product push",
          modelId: "gpt-5.4",
        });

        await onEvent({
          type: "session",
          threadId: "thread-stream",
          selectedModelId: "gpt-5.4",
          title: "Plan our next product push",
        });
        await onEvent({
          type: "assistant_start",
          messageId: "assistant-1",
          modelId: "gpt-5.4",
          provider: "openai",
          createdAt: "2026-04-22T12:05:00.000Z",
        });
        await onEvent({
          type: "assistant_delta",
          messageId: "assistant-1",
          delta: "Here is a plan.",
        });
        await onEvent({
          type: "assistant_done",
          message: {
            id: "assistant-1",
            role: "assistant",
            content: "Here is a plan.",
            modelId: "gpt-5.4",
            provider: "openai",
            createdAt: "2026-04-22T12:05:00.000Z",
          },
        });
      },
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Home />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
    await flushReact();

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    const chip = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Plan our next product push"),
    );
    expect(chip).not.toBeNull();

    await act(async () => {
      chip!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect((textarea as HTMLTextAreaElement).value).toContain("Plan our next product push");

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushReact();
    await flushReact();

    expect(mockHomeChatApi.streamThread).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Plan our next product push");
    expect(container.textContent).toContain("Here is a plan.");
    expect(container.textContent).not.toContain("visual-only");
  });

  it("renders streamed tool cards without confirmation controls", async () => {
    const emptyThread = createThread({
      id: "thread-tools",
      title: "Check the preview",
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Check the preview",
          modelId: "gpt-5.4",
          provider: "openai",
          createdAt: "2026-04-22T12:04:00.000Z",
        },
      ],
      messageCount: 1,
    });
    mockHomeChatApi.listThreads.mockResolvedValue([emptyThread]);
    mockHomeChatApi.getThread.mockResolvedValueOnce(emptyThread).mockResolvedValue(emptyThread);
    mockHomeChatApi.streamThread.mockImplementation(
      async (
        _companyId: string,
        _threadId: string,
        _input: { content: string; modelId?: string },
        onEvent: (event: unknown) => Promise<void> | void,
      ) => {
        await onEvent({
          type: "session",
          threadId: "thread-tools",
          selectedModelId: "gpt-5.4",
          title: "Check the preview",
        });
        await onEvent({
          type: "tool_call_requested",
          toolCallId: "tool-1",
          name: "restart_preview_runtime",
          displayName: "Restart preview runtime",
          input: { projectId: "project-1" },
          riskLevel: "risky",
        });
        await onEvent({
          type: "tool_call_started",
          toolCallId: "tool-1",
          name: "restart_preview_runtime",
          displayName: "Restart preview runtime",
        });
        await onEvent({
          type: "tool_call_result",
          toolCallId: "tool-1",
          name: "restart_preview_runtime",
          displayName: "Restart preview runtime",
          content: "Restarted preview runtime for project workspace \"Preview\" with 1 service (web).",
        });
      },
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Home />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
    await flushReact();

    const chip = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Plan our next product push"),
    );
    expect(chip).not.toBeNull();

    await act(async () => {
      chip!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("Restart preview runtime");
    expect(container.textContent).toContain("completed");
    expect(container.textContent).toContain("Restarted preview runtime for project workspace");
    expect(container.textContent).not.toContain("Confirm");
  });
});
