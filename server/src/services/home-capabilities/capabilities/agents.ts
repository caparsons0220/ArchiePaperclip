import type { HomeCapabilityDefinition } from "../types.js";

export const agentsCapability: HomeCapabilityDefinition = {
  id: "agents",
  displayName: "Agents",
  description: "Inspect and manage company agents, org structure, runtime state, task sessions, wakeups, heartbeats, hires, approvals, and runs.",
  category: "agents",
  family: "agents",
  keywords: ["agent", "employee", "org", "wake", "pause", "resume", "heartbeat", "run", "hire"],
};
