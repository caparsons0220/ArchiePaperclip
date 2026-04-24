import { Router, type Request as ExpressRequest } from "express";
import type { Db } from "@paperclipai/db";
import {
  createHomeChatThreadSchema,
  homeChatStreamRequestSchema,
  updateHomeChatThreadSchema,
} from "@paperclipai/shared/home-chat";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { companyService, homeChatService, logActivity } from "../services/index.js";

export function homeChatRoutes(db: Db) {
  const router = Router();
  const homeChat = homeChatService(db);
  const companiesSvc = companyService(db);

  function assertBoardCompanyAccess(req: ExpressRequest, companyId: string) {
    assertCompanyAccess(req, companyId);
    assertBoard(req);
  }

  router.get("/companies/:companyId/home-chat/models", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertBoardCompanyAccess(req, companyId);
    res.json(await homeChat.listModels());
  });

  router.get("/companies/:companyId/home-chat/threads", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertBoardCompanyAccess(req, companyId);
    res.json(await homeChat.listThreads(companyId, req.actor.userId ?? "local-board"));
  });

  router.get("/companies/:companyId/home-chat/threads/:threadId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const threadId = req.params.threadId as string;
    await assertBoardCompanyAccess(req, companyId);

    const thread = await homeChat.getThread(companyId, req.actor.userId ?? "local-board", threadId);
    if (!thread) {
      res.status(404).json({ error: "Home chat thread not found" });
      return;
    }

    res.json(thread);
  });

  router.post("/companies/:companyId/home-chat/threads", validate(createHomeChatThreadSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertBoardCompanyAccess(req, companyId);

    const thread = await homeChat.createThread(companyId, req.actor.userId ?? "local-board", req.body);
    const actor = getActorInfo(req);
    const model = (await homeChat.listModels()).find((entry) => entry.id === thread.selectedModelId) ?? null;
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "home_chat.thread_created",
      entityType: "home_chat_thread",
      entityId: thread.id,
      details: {
        selectedModelId: thread.selectedModelId,
        provider: model?.provider ?? null,
      },
    });
    res.status(201).json(thread);
  });

  router.patch("/companies/:companyId/home-chat/threads/:threadId", validate(updateHomeChatThreadSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const threadId = req.params.threadId as string;
    await assertBoardCompanyAccess(req, companyId);

    const thread = await homeChat.updateThread(companyId, req.actor.userId ?? "local-board", threadId, req.body);
    if (!thread) {
      res.status(404).json({ error: "Home chat thread not found" });
      return;
    }

    res.json(thread);
  });

  router.post(
    "/companies/:companyId/home-chat/threads/:threadId/stream",
    validate(homeChatStreamRequestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const threadId = req.params.threadId as string;
      await assertBoardCompanyAccess(req, companyId);

      const company = await companiesSvc.getById(companyId);
      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }

      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      let responseClosed = false;
      req.on("close", () => {
        responseClosed = true;
      });

      const writeEvent = async (event: unknown) => {
        if (responseClosed) return;
        res.write(`${JSON.stringify(event)}\n`);
      };

      const actor = getActorInfo(req);
      try {
        const assistantMessage = await homeChat.streamThreadReply({
          companyId,
          ownerUserId: req.actor.userId ?? "local-board",
          threadId,
          content: req.body.content,
          modelId: req.body.modelId,
          onEvent: writeEvent,
        });

        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "home_chat.message_sent",
          entityType: "home_chat_thread",
          entityId: threadId,
          details: {
            selectedModelId: assistantMessage.modelId,
            provider: assistantMessage.provider,
            contentLength: req.body.content.length,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Home chat streaming failed";
        await writeEvent({ type: "error", error: message });
      } finally {
        if (!responseClosed) {
          res.end();
        }
      }
    },
  );

  return router;
}
