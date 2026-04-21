import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { Agent, PluginApiRequestInput, PluginContext } from "@paperclipai/plugin-sdk";
import { decomposeMission } from "./decompose.js";
import type { MissionSettings } from "./mission-service.js";
import {
  initializeMission,
  listMissionSummaries,
  loadMissionPanelData,
  loadMissionSummary,
  readMissionSettings,
  writeMissionSettings,
} from "./mission-service.js";
import { advanceMission, waiveMissionFinding } from "./mission-runtime.js";

type MissionAgentSummary = {
  id: string;
  name: string;
  status: Agent["status"];
  title: string | null;
};

let activeCtx: PluginContext | null = null;

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new Error(`${field} is required`);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return undefined;
}

function settingsPatchFromParams(params: Record<string, unknown>): Partial<MissionSettings> {
  const patch: Partial<MissionSettings> = {};

  const maxValidationRounds = optionalInteger(params.maxValidationRounds);
  if (maxValidationRounds !== undefined) patch.maxValidationRounds = maxValidationRounds;

  const requireBlackBoxValidation = optionalBoolean(params.requireBlackBoxValidation);
  if (requireBlackBoxValidation !== undefined) patch.requireBlackBoxValidation = requireBlackBoxValidation;

  const defaultWorkerAgentId = nullableString(params.defaultWorkerAgentId);
  if (defaultWorkerAgentId !== undefined) patch.defaultWorkerAgentId = defaultWorkerAgentId;

  const defaultValidatorAgentId = nullableString(params.defaultValidatorAgentId);
  if (defaultValidatorAgentId !== undefined) patch.defaultValidatorAgentId = defaultValidatorAgentId;

  if (params.defaultBillingCodePolicy === "mission-issue" || params.defaultBillingCodePolicy === "stable-prefix") {
    patch.defaultBillingCodePolicy = params.defaultBillingCodePolicy;
  }

  const autoAdvance = optionalBoolean(params.autoAdvance);
  if (autoAdvance !== undefined) patch.autoAdvance = autoAdvance;

  return patch;
}

function paramsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actorFromParams(params: Record<string, unknown>) {
  return {
    actorAgentId: optionalString(params.actorAgentId),
    actorUserId: optionalString(params.actorUserId),
    actorRunId: optionalString(params.actorRunId),
  };
}

function actorFromApiRequest(input: PluginApiRequestInput) {
  return {
    actorAgentId: input.actor.agentId ?? null,
    actorUserId: input.actor.userId ?? null,
    actorRunId: input.actor.runId ?? null,
  };
}

function maxValidationRoundsFrom(value: unknown): number | undefined {
  return optionalInteger(value);
}

function requireActiveCtx() {
  if (!activeCtx) throw new Error("Missions plugin is not initialized");
  return activeCtx;
}

async function runDecompose(ctx: PluginContext, params: Record<string, unknown>) {
  const companyId = requireString(params.companyId, "companyId");
  const issueId = requireString(params.issueId, "issueId");
  return decomposeMission(ctx, {
    companyId,
    issueId,
    dryRun: optionalBoolean(params.dryRun),
    actor: actorFromParams(params),
  });
}

async function runAdvance(ctx: PluginContext, params: Record<string, unknown>) {
  const companyId = requireString(params.companyId, "companyId");
  const issueId = requireString(params.issueId, "issueId");
  const settings = await readMissionSettings(ctx, companyId);
  return advanceMission(ctx, {
    companyId,
    issueId,
    maxValidationRounds: maxValidationRoundsFrom(params.maxValidationRounds) ?? settings.maxValidationRounds,
    ...actorFromParams(params),
  });
}

async function runWaive(ctx: PluginContext, params: Record<string, unknown>) {
  const companyId = requireString(params.companyId, "companyId");
  const issueId = requireString(params.issueId, "issueId");
  const findingId = requireString(params.findingId ?? params.findingKey, "findingId");
  const rationale = requireString(params.rationale, "rationale");
  return waiveMissionFinding(ctx, {
    companyId,
    issueId,
    findingId,
    rationale,
    ...actorFromParams(params),
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    activeCtx = ctx;

    ctx.data.register("mission-panel", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const issueId = requireString(params.issueId, "issueId");
      return loadMissionPanelData(ctx, companyId, issueId);
    });

    ctx.data.register("mission-summary", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const issueId = requireString(params.issueId, "issueId");
      return loadMissionSummary({ ctx, companyId, missionRootIssueId: issueId });
    });

    ctx.data.register("mission-list", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return listMissionSummaries(ctx, companyId);
    });

    ctx.data.register("mission-settings", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return readMissionSettings(ctx, companyId);
    });

    ctx.data.register("mission-agents", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const agents = await ctx.agents.list({ companyId, limit: 200 });
      return agents
        .map<MissionAgentSummary>((agent) => ({
          id: agent.id,
          name: agent.name,
          status: agent.status,
          title: agent.title,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    ctx.actions.register("initialize-mission", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const issueId = requireString(params.issueId, "issueId");
      return initializeMission(ctx, companyId, issueId);
    });

    ctx.actions.register("decompose", async (params) => runDecompose(ctx, params));

    ctx.actions.register("advance", async (params) => runAdvance(ctx, params));

    ctx.actions.register("waive", async (params) => runWaive(ctx, params));

    ctx.actions.register("save-mission-settings", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return writeMissionSettings(ctx, companyId, settingsPatchFromParams(params));
    });
  },

  async onApiRequest(input) {
    const ctx = requireActiveCtx();
    const body = paramsRecord(input.body);
    const issueId = input.params.issueId;
    const actor = actorFromApiRequest(input);

    if (input.routeKey === "init") {
      return {
        status: 201,
        body: await initializeMission(ctx, input.companyId, issueId),
      };
    }

    if (input.routeKey === "summary") {
      return {
        body: await loadMissionSummary({ ctx, companyId: input.companyId, missionRootIssueId: issueId }),
      };
    }

    if (input.routeKey === "decompose") {
      return {
        body: await decomposeMission(ctx, {
          companyId: input.companyId,
          issueId,
          dryRun: optionalBoolean(body.dryRun),
          actor,
        }),
      };
    }

    if (input.routeKey === "advance") {
      const settings = await readMissionSettings(ctx, input.companyId);
      return {
        body: await advanceMission(ctx, {
          companyId: input.companyId,
          issueId,
          maxValidationRounds: maxValidationRoundsFrom(body.maxValidationRounds) ?? settings.maxValidationRounds,
          ...actor,
        }),
      };
    }

    if (input.routeKey === "waive") {
      return {
        body: await waiveMissionFinding(ctx, {
          companyId: input.companyId,
          issueId,
          findingId: requireString(input.params.findingKey, "findingKey"),
          rationale: requireString(body.rationale, "rationale"),
          ...actor,
        }),
      };
    }

    if (input.routeKey === "list") {
      const companyId = requireString(input.query.companyId, "companyId");
      return {
        body: await listMissionSummaries(ctx, companyId),
      };
    }

    return {
      status: 404,
      body: { error: `Unknown missions route: ${input.routeKey}` },
    };
  },

  async onHealth() {
    return {
      status: "ok",
      message: "Missions plugin worker is running",
      details: {
        dataKeys: ["mission-panel", "mission-summary", "mission-list", "mission-settings", "mission-agents"],
        actionKeys: ["initialize-mission", "decompose", "advance", "waive", "save-mission-settings"],
        routeKeys: ["init", "summary", "decompose", "advance", "waive", "list"],
      },
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
