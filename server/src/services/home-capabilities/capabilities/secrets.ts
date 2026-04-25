import type { HomeCapabilityDefinition } from "../types.js";

export const secretsCapability: HomeCapabilityDefinition = {
  id: "secrets",
  displayName: "Secrets",
  description: "List redacted secret metadata and create, update, rotate, or delete company secrets. Secret values are never read back.",
  category: "secrets",
  family: "secrets",
  keywords: ["secret", "api key", "credential", "rotate", "redacted"],
};
