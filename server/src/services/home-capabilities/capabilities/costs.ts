import type { HomeCapabilityDefinition } from "../types.js";

export const costsCapability: HomeCapabilityDefinition = {
  id: "costs",
  displayName: "Costs",
  description: "Inspect cost summaries, finance events, quota windows, budgets, budget incidents, and update budget policy.",
  category: "costs",
  family: "costs",
  keywords: ["cost", "budget", "spend", "finance", "quota", "incident"],
};
