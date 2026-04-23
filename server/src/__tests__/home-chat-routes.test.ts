import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHomeChatService = vi.hoisted(() => ({
  listModels: vi.fn(),
  listThreads: vi.fn(),
  getThread: vi.fn(),
  createThread: vi.fn(),
  updateThread: vi.fn(),
  streamThreadReply: vi.fn(),
}));

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  companyService: () => mockCompanyService,
  homeChatService: () => mockHomeChatService,
  logActivity: mockLogActivity,
}));

async function createApp(actor: Express.Request["actor"]) {
  const [{ homeChatRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/home-chat.js"),
    import("../middleware/index.js"),
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", homeChatRoutes({} as never));
  app.use(errorHandler);
  return app;
}

describe("home chat routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cross-company thread access before hitting the service", async () => {
    const app = await createApp({
      type: "board",
      userId: "user-1",
      source: "session",
      isInstanceAdmin: false,
      companyIds: ["company-1"],
      memberships: [{ companyId: "company-1", membershipRole: "operator", status: "active" }],
    });

    const res = await request(app).get("/api/companies/company-2/home-chat/threads");

    expect(res.status).toBe(403);
    expect(mockHomeChatService.listThreads).not.toHaveBeenCalled();
  });
});
