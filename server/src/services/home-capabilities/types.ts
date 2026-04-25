export type HomeCapabilityId =
  | "company"
  | "agenda"
  | "agents"
  | "projects"
  | "routines"
  | "approvals"
  | "costs"
  | "skills"
  | "assets"
  | "access"
  | "secrets";

export interface HomeCapabilityDefinition {
  id: HomeCapabilityId;
  displayName: string;
  description: string;
  category: string;
  family: string;
  keywords: string[];
}

export interface HomeActionResult {
  content: string;
  data?: unknown;
}

export type {
  HomeActionContext,
  HomeActionDescriptor,
  HomeActionExecution,
  HomeActionInventoryItem,
  HomeActionSelection,
  HomeCapabilityCategory,
  HomeCapabilityRegistryOptions,
  HomeCapabilityRiskLevel,
} from "./registry.js";
