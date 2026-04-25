import type { HomeCapabilityDefinition } from "../types.js";

export const agendaCapability: HomeCapabilityDefinition = {
  id: "agenda",
  displayName: "Agenda",
  description: "Manage agenda items, issue comments, issue documents, work products, attachments, approvals, read state, checkout, and release.",
  category: "agenda",
  family: "agenda",
  keywords: ["agenda", "issue", "task", "comment", "document", "work product", "checkout", "release"],
};
