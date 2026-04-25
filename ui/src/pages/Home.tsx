import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  HomeChatEffectiveTool,
  HomeChatMessage,
  HomeChatModel,
  HomeChatStreamEvent,
  HomeChatThread,
  HomeChatThreadSummary,
} from "@paperclipai/shared/home-chat";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Compass,
  LoaderCircle,
  MessageSquarePlus,
  Rocket,
  Sparkles,
  Wrench,
  WandSparkles,
} from "lucide-react";
import { homeChatApi } from "@/api/home-chat";
import { ApiError } from "@/api/client";
import { ArchieBravoMark } from "@/components/ArchieBravoMark";
import { OpenDashboardToolbarAction } from "@/components/HomeToolbarActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";

const PROMPT_CHIPS = [
  "Plan our next product push",
  "Review this week's priorities",
  "Draft a launch brief for the workspace",
];

const STARTER_CARDS = [
  {
    title: "Map the next sprint",
    body: "Outline the most important work, likely blockers, and the best first move.",
  },
  {
    title: "Pressure-test the roadmap",
    body: "Challenge assumptions, surface gaps, and tighten the execution sequence.",
  },
  {
    title: "Turn goals into an agenda",
    body: "Translate strategy into a practical list of next actions for the team.",
  },
  {
    title: "Prepare a board update",
    body: "Summarize progress, open risks, and what needs attention next.",
  },
];

type HomeToolCard = {
  threadId: string;
  toolCallId: string;
  name: string;
  displayName: string;
  input: Record<string, unknown>;
  status: "requested" | "running" | "completed" | "failed";
  riskLevel?: "safe" | "low" | "risky";
  content?: string;
  error?: string;
};

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPreview(content: string): string {
  const compact = compactWhitespace(content);
  if (compact.length <= 96) return compact;
  return `${compact.slice(0, 93).trimEnd()}...`;
}

function deriveThreadTitle(content: string): string {
  const compact = compactWhitespace(content);
  if (!compact) return "New chat";
  if (compact.length <= 72) return compact;
  return `${compact.slice(0, 69).trimEnd()}...`;
}

function getDefaultModelId(models: HomeChatModel[]) {
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "gpt-5.4";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function getEnabledActions(tool: HomeChatEffectiveTool) {
  return (tool.actions ?? []).filter((action) => action.enabled);
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimestamp(value: Date | string | null | undefined) {
  const date = parseDate(value);
  if (!date) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function summarizeThread(thread: HomeChatThread): HomeChatThreadSummary {
  const { messages: _messages, ...summary } = thread;
  return summary;
}

function upsertThreadSummary(
  current: HomeChatThreadSummary[] | undefined,
  thread: HomeChatThread,
): HomeChatThreadSummary[] {
  const summary = summarizeThread(thread);
  return [summary, ...(current ?? []).filter((item) => item.id !== summary.id)];
}

function syncThreadCache(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string,
  thread: HomeChatThread,
) {
  queryClient.setQueryData(queryKeys.homeChat.thread(companyId, thread.id), thread);
  queryClient.setQueryData<HomeChatThreadSummary[]>(
    queryKeys.homeChat.threads(companyId),
    (current) => upsertThreadSummary(current, thread),
  );
}

function patchCachedThread(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string,
  threadId: string,
  updater: (thread: HomeChatThread) => HomeChatThread,
) {
  queryClient.setQueryData<HomeChatThread | undefined>(
    queryKeys.homeChat.thread(companyId, threadId),
    (current) => {
      if (!current) return current;
      const next = updater(current);
      queryClient.setQueryData<HomeChatThreadSummary[]>(
        queryKeys.homeChat.threads(companyId),
        (threadList) => upsertThreadSummary(threadList, next),
      );
      return next;
    },
  );
}

function appendMessage(
  thread: HomeChatThread,
  message: HomeChatMessage,
  overrides?: Partial<Pick<HomeChatThread, "title" | "selectedModelId">>,
): HomeChatThread {
  return {
    ...thread,
    ...overrides,
    messages: [...thread.messages, message],
    messageCount: thread.messages.length + 1,
    preview: buildPreview(message.content),
    lastMessageAt: message.createdAt,
    updatedAt: new Date(),
  };
}

function replaceMessage(
  thread: HomeChatThread,
  messageId: string,
  updater: (message: HomeChatMessage) => HomeChatMessage,
): HomeChatThread {
  const nextMessages = thread.messages.map((message) => (message.id === messageId ? updater(message) : message));
  const lastMessage = nextMessages.at(-1) ?? null;
  return {
    ...thread,
    messages: nextMessages,
    messageCount: nextMessages.length,
    preview: lastMessage ? buildPreview(lastMessage.content) : null,
    lastMessageAt: lastMessage?.createdAt ?? null,
    updatedAt: new Date(),
  };
}

export function Home() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs, setPageToolbar } = useBreadcrumbs();
  const [draft, setDraft] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [toolCards, setToolCards] = useState<HomeToolCard[]>([]);

  const companyId = selectedCompany?.id ?? null;
  const workspaceName = selectedCompany?.name ?? "this workspace";

  useEffect(() => {
    setBreadcrumbs([{ label: "Home" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    setPageToolbar(<OpenDashboardToolbarAction />);
    return () => setPageToolbar(null);
  }, [setPageToolbar]);

  useEffect(() => {
    setActiveThreadId(null);
    setPendingModelId(null);
    setDraft("");
    setComposerError(null);
    setToolCards([]);
  }, [companyId]);

  const modelsQuery = useQuery({
    queryKey: companyId ? queryKeys.homeChat.models(companyId) : ["home-chat", "no-company", "models"],
    queryFn: () => homeChatApi.listModels(companyId!),
    enabled: Boolean(companyId),
    retry: false,
  });

  const effectiveToolsQuery = useQuery({
    queryKey: companyId ? queryKeys.homeChat.effectiveTools(companyId) : ["home-chat", "no-company", "effective-tools"],
    queryFn: () => homeChatApi.listEffectiveTools(companyId!),
    enabled: Boolean(companyId),
    retry: false,
    staleTime: 60_000,
  });

  const threadsQuery = useQuery({
    queryKey: companyId ? queryKeys.homeChat.threads(companyId) : ["home-chat", "no-company", "threads"],
    queryFn: () => homeChatApi.listThreads(companyId!),
    enabled: Boolean(companyId),
    retry: false,
  });

  const activeThreadQuery = useQuery({
    queryKey: companyId && activeThreadId
      ? queryKeys.homeChat.thread(companyId, activeThreadId)
      : ["home-chat", "no-company", "thread"],
    queryFn: () => homeChatApi.getThread(companyId!, activeThreadId!),
    enabled: Boolean(companyId && activeThreadId),
    retry: false,
  });

  const models = modelsQuery.data ?? [];
  const threads = threadsQuery.data ?? [];
  const activeThread = activeThreadQuery.data ?? null;
  const availableCapabilities = (effectiveToolsQuery.data ?? [])
    .filter((tool) => tool.name !== "ai_tools" && getEnabledActions(tool).length > 0);

  useEffect(() => {
    if (!threadsQuery.data) return;
    if (activeThreadId && threadsQuery.data.some((thread) => thread.id === activeThreadId)) return;
    setActiveThreadId(threadsQuery.data[0]?.id ?? null);
  }, [activeThreadId, threadsQuery.data]);

  useEffect(() => {
    if (models.length === 0) return;
    if (pendingModelId && models.some((model) => model.id === pendingModelId)) return;
    setPendingModelId(getDefaultModelId(models));
  }, [models, pendingModelId]);

  const selectedModelId = activeThread?.selectedModelId ?? pendingModelId ?? getDefaultModelId(models);
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const showStarterCards = !activeThread || activeThread.messages.length === 0;
  const activeToolCards = useMemo(
    () => toolCards.filter((card) => card.threadId === activeThreadId),
    [activeThreadId, toolCards],
  );

  function upsertToolCard(threadId: string, event: HomeChatStreamEvent) {
    if (
      event.type !== "tool_call_requested"
      && event.type !== "tool_call_started"
      && event.type !== "tool_call_result"
      && event.type !== "tool_call_failed"
    ) {
      return;
    }

    setToolCards((current) => {
      const existing = current.find((card) => card.threadId === threadId && card.toolCallId === event.toolCallId);
      const base: HomeToolCard = existing ?? {
        threadId,
        toolCallId: event.toolCallId,
        name: event.name,
        displayName: event.displayName,
        input: {},
        status: "requested",
      };
      const next: HomeToolCard = event.type === "tool_call_requested"
        ? {
          ...base,
          name: event.name,
          displayName: event.displayName,
          input: event.input,
          riskLevel: event.riskLevel,
          status: "requested",
        }
        : event.type === "tool_call_started"
          ? { ...base, name: event.name, displayName: event.displayName, status: "running" }
          : event.type === "tool_call_result"
            ? { ...base, name: event.name, displayName: event.displayName, status: "completed", content: event.content }
            : { ...base, name: event.name, displayName: event.displayName, status: "failed", error: event.error };
      return [next, ...current.filter((card) => !(card.threadId === threadId && card.toolCallId === event.toolCallId))].slice(0, 20);
    });
  }

  const createThreadMutation = useMutation({
    mutationFn: ({ companyId: nextCompanyId, selectedModelId }: { companyId: string; selectedModelId?: string }) =>
      homeChatApi.createThread(nextCompanyId, selectedModelId ? { selectedModelId } : {}),
    onSuccess: (thread, variables) => {
      syncThreadCache(queryClient, variables.companyId, thread);
      setActiveThreadId(thread.id);
    },
  });

  const updateThreadMutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      threadId: string;
      selectedModelId?: string;
      title?: string;
    }) =>
      homeChatApi.updateThread(input.companyId, input.threadId, {
        selectedModelId: input.selectedModelId,
        title: input.title,
      }),
    onSuccess: (thread, variables) => {
      syncThreadCache(queryClient, variables.companyId, thread);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ companyId: nextCompanyId, content }: { companyId: string; content: string }) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

      const ensureThread = async () => {
        if (activeThreadId) {
          const cached = queryClient.getQueryData<HomeChatThread>(queryKeys.homeChat.thread(nextCompanyId, activeThreadId));
          if (cached) return cached;
          const fetched = await homeChatApi.getThread(nextCompanyId, activeThreadId);
          syncThreadCache(queryClient, nextCompanyId, fetched);
          return fetched;
        }

        return await createThreadMutation.mutateAsync({
          companyId: nextCompanyId,
          selectedModelId: selectedModelId || undefined,
        });
      };

      const thread = await ensureThread();
      const model = models.find((entry) => entry.id === (selectedModelId || thread.selectedModelId)) ?? selectedModel;
      const optimisticUserMessage: HomeChatMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: "user",
        content: trimmedContent,
        modelId: model?.id ?? thread.selectedModelId,
        provider: model?.provider ?? "openai",
        createdAt: new Date().toISOString(),
      };

      patchCachedThread(queryClient, nextCompanyId, thread.id, (current) => appendMessage(
        current,
        optimisticUserMessage,
        current.messages.some((message) => message.role === "user")
          ? { selectedModelId: optimisticUserMessage.modelId }
          : {
            title: deriveThreadTitle(trimmedContent),
            selectedModelId: optimisticUserMessage.modelId,
          },
      ));

      try {
        await homeChatApi.streamThread(
          nextCompanyId,
          thread.id,
          {
            content: trimmedContent,
            modelId: model?.id ?? selectedModelId ?? thread.selectedModelId,
          },
          async (event) => {
            upsertToolCard(thread.id, event);

            if (event.type === "session") {
              patchCachedThread(queryClient, nextCompanyId, thread.id, (current) => ({
                ...current,
                title: event.title,
                selectedModelId: event.selectedModelId,
                updatedAt: new Date(),
              }));
              return;
            }

            if (event.type === "assistant_start") {
              patchCachedThread(queryClient, nextCompanyId, thread.id, (current) => {
                if (current.messages.some((message) => message.id === event.messageId)) {
                  return current;
                }
                return appendMessage(current, {
                  id: event.messageId,
                  role: "assistant",
                  content: "",
                  modelId: event.modelId,
                  provider: event.provider,
                  createdAt: event.createdAt,
                });
              });
              return;
            }

            if (event.type === "assistant_delta") {
              patchCachedThread(queryClient, nextCompanyId, thread.id, (current) => replaceMessage(
                current,
                event.messageId,
                (message) => ({
                  ...message,
                  content: `${message.content}${event.delta}`,
                }),
              ));
              return;
            }

            if (event.type === "assistant_done") {
              patchCachedThread(queryClient, nextCompanyId, thread.id, (current) => {
                if (!current.messages.some((message) => message.id === event.message.id)) {
                  return appendMessage(current, event.message);
                }

                return replaceMessage(current, event.message.id, () => event.message);
              });
            }
          },
        );
      } catch (error) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.homeChat.threads(nextCompanyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.homeChat.thread(nextCompanyId, thread.id) }),
        ]);
        throw error;
      }

      return thread.id;
    },
    onSuccess: async (threadId, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.homeChat.threads(variables.companyId) }),
        threadId
          ? queryClient.invalidateQueries({ queryKey: queryKeys.homeChat.thread(variables.companyId, threadId) })
          : Promise.resolve(),
      ]);
    },
    onError: (error) => {
      setComposerError(getErrorMessage(error, "Failed to send home chat message"));
    },
  });

  function applyDraft(value: string) {
    setDraft(value);
    setComposerError(null);
  }

  async function handleCreateThread() {
    if (!companyId) return;
    setComposerError(null);

    try {
      await createThreadMutation.mutateAsync({
        companyId,
        selectedModelId: selectedModelId || undefined,
      });
    } catch (error) {
      setComposerError(getErrorMessage(error, "Failed to create a new chat"));
    }
  }

  async function handleModelChange(nextModelId: string) {
    setComposerError(null);

    if (!companyId || !nextModelId) return;

    if (!activeThreadId) {
      setPendingModelId(nextModelId);
      return;
    }

    patchCachedThread(queryClient, companyId, activeThreadId, (thread) => ({
      ...thread,
      selectedModelId: nextModelId,
      updatedAt: new Date(),
    }));

    try {
      await updateThreadMutation.mutateAsync({
        companyId,
        threadId: activeThreadId,
        selectedModelId: nextModelId,
      });
    } catch (error) {
      setComposerError(getErrorMessage(error, "Failed to update the model"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.homeChat.threads(companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.homeChat.thread(companyId, activeThreadId) }),
      ]);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;

    const content = draft.trim();
    if (!content) return;

    setComposerError(null);
    setDraft("");

    try {
      await sendMessageMutation.mutateAsync({
        companyId,
        content,
      });
    } catch {
      // Mutation-level error handling already surfaces the message to the composer.
    }
  }

  const threadListLoading = threadsQuery.isLoading && threads.length === 0;
  const activeThreadLoading = Boolean(activeThreadId) && activeThreadQuery.isLoading && !activeThread;
  const isBusy = createThreadMutation.isPending || sendMessageMutation.isPending;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-7xl flex-col">
      <div className="flex flex-1 flex-col py-6">
        <div className="grid flex-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,247,244,0.88))] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.06)] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(12,12,14,0.96))]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Your Threads
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Private chats inside {workspaceName}.
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void handleCreateThread();
                }}
                disabled={!companyId || createThreadMutation.isPending}
              >
                {createThreadMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
                New chat
              </Button>
            </div>

            <ScrollArea className="mt-4 h-[26rem] rounded-2xl border border-border/60 bg-background/70 p-2 lg:h-[calc(100dvh-15rem)]">
              <div className="space-y-2">
                {threadListLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-border/60 p-3">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mt-2 h-3 w-full" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ))
                ) : null}

                {!threadListLoading && threads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                    Start a new chat to create your first company-scoped Archie thread.
                  </div>
                ) : null}

                {threads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => {
                        setActiveThreadId(thread.id);
                        setComposerError(null);
                      }}
                      className={[
                        "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                        isActive
                          ? "border-foreground/15 bg-foreground/[0.045] shadow-sm"
                          : "border-border/60 bg-background/60 hover:border-foreground/15 hover:bg-foreground/[0.03]",
                      ].join(" ")}
                    >
                      <div className="line-clamp-2 text-sm font-semibold text-foreground">{thread.title}</div>
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {thread.preview ?? "No messages yet."}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span>{thread.messageCount} msg</span>
                        <span>{formatTimestamp(thread.lastMessageAt ?? thread.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="mt-4 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Available actions
                </div>
                <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px] font-semibold">
                  Home
                </Badge>
              </div>

              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                {effectiveToolsQuery.isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-7 w-full rounded-full" />
                    </div>
                  ))
                ) : null}

                {!effectiveToolsQuery.isLoading && availableCapabilities.length === 0 ? (
                  <div className="text-sm leading-6 text-muted-foreground">
                    No Home actions are available for this company.
                  </div>
                ) : null}

                {availableCapabilities.map((tool) => {
                  const enabledActions = getEnabledActions(tool);
                  const visibleActions = enabledActions.slice(0, 5);
                  return (
                    <div key={tool.name} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-foreground">{tool.displayName}</div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{enabledActions.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleActions.map((action) => (
                          <span
                            key={action.name}
                            className="max-w-full truncate rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                            title={action.description}
                          >
                            {action.displayName}
                          </span>
                        ))}
                        {enabledActions.length > visibleActions.length ? (
                          <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                            +{enabledActions.length - visibleActions.length}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="rounded-[32px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,248,246,0.84))] p-5 shadow-[0_40px_120px_rgba(15,23,42,0.08)] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.9),rgba(12,12,14,0.95))] sm:p-6">
            <div className="relative flex h-full min-h-[42rem] flex-col overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(255,255,255,0.72)_44%,rgba(247,247,244,0.62)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:bg-[radial-gradient(circle_at_top,rgba(38,38,43,0.9),rgba(22,22,27,0.85)_44%,rgba(10,10,12,0.94)_100%)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-32 rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.18),transparent_70%)] blur-3xl" />

              <div className="relative z-10 flex flex-1 flex-col">
                <div className="border-b border-border/60 px-5 py-5 sm:px-8">
                  <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                        <ArchieBravoMark className="h-7 w-7 shrink-0" />
                        <span>Archie Bravo</span>
                      </div>
                      <div className="mt-3">
                        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                          {activeThread?.title || `What can I help ${workspaceName} do next?`}
                        </h1>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                          Archie is scoped to {workspaceName}. Your threads are private, but the context and prompting stay company-aware.
                        </p>
                      </div>
                    </div>

                    <div className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground lg:flex">
                      <Compass className="h-3.5 w-3.5" />
                      Multi-thread company copilot
                    </div>
                  </div>
                </div>

                <div className="flex-1 px-5 py-5 sm:px-8">
                  {activeThreadLoading ? (
                    <div className="mx-auto max-w-4xl space-y-3">
                      <Skeleton className="h-16 w-[70%] rounded-3xl" />
                      <Skeleton className="ml-auto h-20 w-[68%] rounded-3xl" />
                      <Skeleton className="h-16 w-[60%] rounded-3xl" />
                    </div>
                  ) : null}

                  {!activeThreadLoading && activeThread && activeThread.messages.length > 0 ? (
                    <ScrollArea className="mx-auto h-[24rem] max-w-4xl rounded-[24px] border border-border/60 bg-background/55 px-4 py-4 sm:h-[calc(100dvh-25rem)] sm:px-6">
                      <div className="space-y-4">
                        {activeThread.messages.map((message) => {
                          const isUser = message.role === "user";
                          return (
                            <div
                              key={message.id}
                              className={isUser ? "flex justify-end" : "flex justify-start"}
                            >
                              <div
                                className={[
                                  "max-w-[85%] rounded-[24px] px-4 py-3 shadow-sm sm:max-w-[78%]",
                                  isUser
                                    ? "bg-foreground text-background"
                                    : "border border-border/60 bg-background/90 text-foreground",
                                ].join(" ")}
                              >
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                                  <span>{isUser ? "You" : "Archie"}</span>
                                  <span>•</span>
                                  <span>{formatTimestamp(message.createdAt)}</span>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-6">
                                  {message.content || (isUser ? "" : "Thinking...")}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {activeToolCards.map((card) => {
                          return (
                            <div key={card.toolCallId} className="flex justify-start">
                              <div className="max-w-[88%] rounded-[20px] border border-border/70 bg-background/95 px-4 py-3 shadow-sm sm:max-w-[78%]">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
                                    {card.status === "completed" ? (
                                      <CheckCircle2 className="h-4 w-4" />
                                    ) : card.status === "failed" ? (
                                      <AlertTriangle className="h-4 w-4" />
                                    ) : (
                                      <Wrench className="h-4 w-4" />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-foreground">{card.displayName}</div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      {card.status.replaceAll("_", " ")}
                                      {card.riskLevel ? ` - ${card.riskLevel}` : ""}
                                    </div>
                                  </div>
                                </div>

                                {card.content || card.error ? (
                                  <div className={["mt-3 text-sm leading-6", card.error ? "text-destructive" : "text-muted-foreground"].join(" ")}>
                                    {card.error ?? card.content}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : null}

                  {!activeThreadLoading && showStarterCards ? (
                    <div className="mx-auto flex max-w-4xl flex-1 flex-col justify-center py-8">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <WandSparkles className="h-4 w-4 text-muted-foreground" />
                          Get started with
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[11px] font-semibold">
                            {selectedModel?.label ?? "Select a model"}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {STARTER_CARDS.map((card) => (
                          <button
                            key={card.title}
                            type="button"
                            onClick={() => applyDraft(card.body)}
                            className="group rounded-[24px] border border-border/70 bg-background/80 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-foreground">{card.title}</div>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.body}</p>
                              </div>
                              <div className="rounded-full border border-border/70 p-2 text-muted-foreground transition-colors group-hover:text-foreground">
                                <Rocket className="h-4 w-4" />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-border/60 px-5 py-4 sm:px-8">
                  <form onSubmit={(event) => { void handleSubmit(event); }} className="mx-auto max-w-4xl">
                    <div className="rounded-[28px] border border-border/70 bg-background/95 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                      <Textarea
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.currentTarget.value);
                          setComposerError(null);
                        }}
                        placeholder="Describe what you want Archie to think through, plan, or review..."
                        className="min-h-32 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0"
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                        <div className="flex flex-wrap gap-2">
                          {PROMPT_CHIPS.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => applyDraft(chip)}
                              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {chip}
                            </button>
                          ))}
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                          <Select value={selectedModelId} onValueChange={(value) => { void handleModelChange(value); }}>
                            <SelectTrigger className="h-10 min-w-[180px] rounded-full bg-background text-xs">
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                              {models.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="submit"
                            size="icon"
                            className="h-10 w-10 rounded-full"
                            aria-label="Submit home prompt"
                            disabled={!companyId || isBusy || draft.trim().length === 0}
                          >
                            {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>

                  {composerError ? (
                    <div className="mx-auto mt-3 max-w-4xl rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {composerError}
                    </div>
                  ) : null}

                  {!companyId ? (
                    <div className="mx-auto mt-3 max-w-4xl rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                      Select a company to start a company-scoped Archie thread.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
