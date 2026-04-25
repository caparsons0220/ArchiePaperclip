import { accessCapability } from "./access.js";
import { agendaCapability } from "./agenda.js";
import { agentsCapability } from "./agents.js";
import { approvalsCapability } from "./approvals.js";
import { assetsCapability } from "./assets.js";
import { companyCapability } from "./company.js";
import { costsCapability } from "./costs.js";
import { projectsCapability } from "./projects.js";
import { routinesCapability } from "./routines.js";
import { secretsCapability } from "./secrets.js";
import { skillsCapability } from "./skills.js";
import type { HomeCapabilityDefinition, HomeCapabilityId } from "../types.js";

export const HOME_CAPABILITIES: HomeCapabilityDefinition[] = [
  companyCapability,
  agendaCapability,
  agentsCapability,
  projectsCapability,
  routinesCapability,
  approvalsCapability,
  costsCapability,
  skillsCapability,
  assetsCapability,
  accessCapability,
  secretsCapability,
];

export const HOME_CAPABILITY_BY_ID = new Map<HomeCapabilityId, HomeCapabilityDefinition>(
  HOME_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export type { HomeCapabilityDefinition, HomeCapabilityId } from "../types.js";
