import type { HomeCapabilityDefinition } from "../types.js";

export const approvalsCapability: HomeCapabilityDefinition = {
  id: "approvals",
  displayName: "Approvals",
  description: "Inspect and decide approval requests, comments, revision requests, resubmissions, and linked approval issues.",
  category: "approvals",
  family: "approvals",
  keywords: ["approval", "approve", "reject", "revision", "decision"],
};
