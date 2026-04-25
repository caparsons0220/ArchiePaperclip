import type { HomeCapabilityDefinition } from "../types.js";

export const projectsCapability: HomeCapabilityDefinition = {
  id: "projects",
  displayName: "Projects",
  description: "Manage safe project and project workspace metadata. Platform runtime controls are excluded from Home chat.",
  category: "projects",
  family: "projects",
  keywords: ["project", "workspace", "repository", "codebase"],
};
