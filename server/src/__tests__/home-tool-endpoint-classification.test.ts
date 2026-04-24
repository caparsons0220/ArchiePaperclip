import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyHomeToolEndpoint,
  isHomeToolEndpointExplicitlyClassified,
} from "../services/home-tool-endpoint-classification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.resolve(__dirname, "../routes");
const routeMethodPattern = /router\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2/gs;

function mountedPath(file: string, routePath: string) {
  if (file === "routes/companies.ts") {
    return `/companies${routePath === "/" ? "" : routePath}`;
  }
  if (file === "routes/health.ts") {
    return `/health${routePath === "/" ? "" : routePath}`;
  }
  return routePath;
}

function listRouteFiles() {
  return fs
    .readdirSync(routesDir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => path.join(routesDir, name));
}

function extractRouteEndpoints() {
  const endpoints: Array<{ file: string; method: string; path: string }> = [];
  for (const filePath of listRouteFiles()) {
    const source = fs.readFileSync(filePath, "utf8");
    const file = path.relative(path.resolve(__dirname, ".."), filePath).replace(/\\/g, "/");
    for (const match of source.matchAll(routeMethodPattern)) {
      endpoints.push({
        file,
        method: match[1]!.toUpperCase(),
        path: mountedPath(file, match[3]!),
      });
    }
  }
  return endpoints;
}

describe("home tool endpoint classification", () => {
  it("explicitly classifies every Express router endpoint", () => {
    const endpoints = extractRouteEndpoints();
    expect(endpoints.length).toBeGreaterThan(250);

    const missing = endpoints.filter((endpoint) => !isHomeToolEndpointExplicitlyClassified(endpoint));
    expect(missing).toEqual([]);
  });

  it("keeps platform and server controls out of Home tools", () => {
    expect(classifyHomeToolEndpoint({ method: "POST", path: "/adapters/install" })).toMatchObject({
      decision: "exclude",
    });
    expect(classifyHomeToolEndpoint({ method: "PATCH", path: "/instance/settings/general" })).toMatchObject({
      decision: "exclude",
    });
    expect(classifyHomeToolEndpoint({ method: "POST", path: "/plugins/install" })).toMatchObject({
      decision: "exclude",
    });
    expect(classifyHomeToolEndpoint({ method: "GET", path: "/admin/users" })).toMatchObject({
      decision: "exclude",
    });
  });

  it("marks risky user-scoped actions as confirmation-required", () => {
    expect(classifyHomeToolEndpoint({ method: "DELETE", path: "/issues/:id" })).toMatchObject({
      decision: "confirm-required",
    });
    expect(classifyHomeToolEndpoint({ method: "POST", path: "/approvals/:id/approve" })).toMatchObject({
      decision: "confirm-required",
    });
    expect(classifyHomeToolEndpoint({ method: "PATCH", path: "/agents/:agentId/budgets" })).toMatchObject({
      decision: "confirm-required",
    });
    expect(classifyHomeToolEndpoint({ method: "POST", path: "/execution-workspaces/:id/runtime-services/:action" })).toMatchObject({
      decision: "confirm-required",
    });
  });

  it("includes core user company experience endpoints", () => {
    expect(classifyHomeToolEndpoint({ method: "GET", path: "/companies/:companyId/issues" })).toMatchObject({
      decision: "include",
    });
    expect(classifyHomeToolEndpoint({ method: "GET", path: "/companies/:companyId/dashboard" })).toMatchObject({
      decision: "include",
    });
    expect(classifyHomeToolEndpoint({ method: "GET", path: "/companies/:companyId/activity" })).toMatchObject({
      decision: "include",
    });
    expect(classifyHomeToolEndpoint({ method: "GET", path: "/companies/:companyId/agents" })).toMatchObject({
      decision: "include",
    });
  });
});
