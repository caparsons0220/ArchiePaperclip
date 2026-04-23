import {
  homeChatStreamEventSchema,
  type CreateHomeChatThread,
  type HomeChatModel,
  type HomeChatStreamEvent,
  type HomeChatStreamRequest,
  type HomeChatThread,
  type HomeChatThreadSummary,
  type UpdateHomeChatThread,
} from "@paperclipai/shared/home-chat";
import { ApiError, api } from "./client";

const BASE = "/api";

async function parseErrorResponse(res: Response) {
  const body = await res.json().catch(() => null);
  throw new ApiError(
    (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
    res.status,
    body,
  );
}

export const homeChatApi = {
  listModels: (companyId: string) =>
    api.get<HomeChatModel[]>(`/companies/${companyId}/home-chat/models`),

  listThreads: (companyId: string) =>
    api.get<HomeChatThreadSummary[]>(`/companies/${companyId}/home-chat/threads`),

  getThread: (companyId: string, threadId: string) =>
    api.get<HomeChatThread>(`/companies/${companyId}/home-chat/threads/${threadId}`),

  createThread: (companyId: string, input: CreateHomeChatThread = {}) =>
    api.post<HomeChatThread>(`/companies/${companyId}/home-chat/threads`, input),

  updateThread: (companyId: string, threadId: string, input: UpdateHomeChatThread) =>
    api.patch<HomeChatThread>(`/companies/${companyId}/home-chat/threads/${threadId}`, input),

  streamThread: async (
    companyId: string,
    threadId: string,
    input: HomeChatStreamRequest,
    onEvent: (event: HomeChatStreamEvent) => Promise<void> | void,
  ) => {
    const res = await fetch(`${BASE}/companies/${companyId}/home-chat/threads/${threadId}/stream`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      await parseErrorResponse(res);
    }

    if (!res.body) {
      throw new Error("Home chat stream returned no body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamError: Error | null = null;

    const flushLine = async (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;
      const parsed = homeChatStreamEventSchema.parse(JSON.parse(line));
      await onEvent(parsed);
      if (parsed.type === "error") {
        streamError = new Error(parsed.error);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await flushLine(line);
        newlineIndex = buffer.indexOf("\n");
      }

      if (done) {
        break;
      }
    }

    if (buffer.trim()) {
      await flushLine(buffer);
    }

    if (streamError) {
      throw streamError;
    }
  },
};
