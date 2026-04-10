import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import type { IssueWorkProduct } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { projectUrl, relativeTime } from "../lib/utils";
import { ArrowUpRight, CircleDot, Download, FileImage, Hexagon, Package } from "lucide-react";

function labelize(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/_/g, " ");
}

function readMetadataString(product: IssueWorkProduct, key: string) {
  const value = product.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function readMetadataNumber(product: IssueWorkProduct, key: string) {
  const value = product.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatByteSize(byteSize: number | null) {
  if (!byteSize || byteSize <= 0) return null;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageArtifact(product: IssueWorkProduct) {
  const contentType = readMetadataString(product, "contentType");
  return Boolean(contentType?.startsWith("image/"));
}

function ArtifactCard({
  artifact,
  issueTitle,
  issueRef,
  projectTitle,
  projectHref,
}: {
  artifact: IssueWorkProduct;
  issueTitle: string;
  issueRef: string;
  projectTitle: string | null;
  projectHref: string | null;
}) {
  const contentType = readMetadataString(artifact, "contentType");
  const sizeLabel = formatByteSize(readMetadataNumber(artifact, "byteSize"));
  const href = artifact.url;
  const imagePreview = isImageArtifact(artifact) && href ? href : null;

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {imagePreview ? (
        <div className="aspect-[16/10] overflow-hidden border-b border-border bg-muted/40">
          <img
            src={imagePreview}
            alt={artifact.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center border-b border-border bg-gradient-to-br from-muted/70 via-background to-muted/40">
          <div className="flex flex-col items-center gap-3 text-center">
            {contentType?.startsWith("image/") ? (
              <FileImage className="h-10 w-10 text-muted-foreground" />
            ) : (
              <Package className="h-10 w-10 text-muted-foreground" />
            )}
            <p className="max-w-[14rem] text-xs text-muted-foreground">
              {contentType ?? "Artifact"}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Artifact</Badge>
            <Badge variant="secondary">{artifact.provider}</Badge>
            {artifact.status ? <Badge variant="secondary">{labelize(artifact.status)}</Badge> : null}
            {artifact.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
            {sizeLabel ? <Badge variant="secondary">{sizeLabel}</Badge> : null}
          </div>

          <div>
            <h3 className="line-clamp-2 text-base font-semibold">{artifact.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {relativeTime(artifact.updatedAt)}
            </p>
          </div>

          {artifact.summary ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">{artifact.summary}</p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex items-start gap-2 text-sm">
            <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Issue</p>
              <Link to={createIssueDetailPath(issueRef)} className="line-clamp-2 font-medium hover:underline">
                {issueTitle}
              </Link>
            </div>
          </div>

          {projectHref && projectTitle ? (
            <div className="flex items-start gap-2 text-sm">
              <Hexagon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Project</p>
                <Link to={projectHref} className="line-clamp-1 font-medium hover:underline">
                  {projectTitle}
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {href ? (
            <Button asChild size="sm" variant="outline">
              <a href={href} target="_blank" rel="noreferrer">
                {imagePreview ? <ArrowUpRight className="mr-1.5 h-4 w-4" /> : <Download className="mr-1.5 h-4 w-4" />}
                {imagePreview ? "Open" : "Download"}
              </a>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <Link to={createIssueDetailPath(issueRef)}>Open issue</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function Artifacts() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Artifacts" }]);
  }, [setBreadcrumbs]);

  const { data: artifacts, isLoading, error } = useQuery({
    queryKey: queryKeys.artifacts.list(selectedCompanyId!),
    queryFn: () => issuesApi.listCompanyWorkProducts(selectedCompanyId!, { type: "artifact" }),
    enabled: !!selectedCompanyId,
  });
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const issueMap = useMemo(() => {
    const map = new Map<string, { title: string; ref: string }>();
    for (const issue of issues ?? []) {
      map.set(issue.id, {
        title: issue.title,
        ref: issue.identifier ?? issue.id,
      });
    }
    return map;
  }, [issues]);

  const projectMap = useMemo(() => {
    const map = new Map<string, { title: string; href: string }>();
    for (const project of projects ?? []) {
      map.set(project.id, {
        title: project.name,
        href: projectUrl(project),
      });
    }
    return map;
  }, [projects]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Package} message="Select a company to view artifacts." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="grid" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Artifacts</h2>
          <p className="text-sm text-muted-foreground">
            Generated issue outputs across the company, sorted by most recent update.
          </p>
        </div>
        {artifacts && artifacts.length > 0 ? (
          <Badge variant="secondary" className="h-fit px-3 py-1 text-xs font-medium">
            {artifacts.length} artifact{artifacts.length === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

      {!isLoading && (artifacts?.length ?? 0) === 0 ? (
        <EmptyState icon={Package} message="No artifacts yet." />
      ) : null}

      {artifacts && artifacts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {artifacts.map((artifact) => {
            const issue = issueMap.get(artifact.issueId);
            const project = artifact.projectId ? projectMap.get(artifact.projectId) ?? null : null;
            return (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                issueTitle={issue?.title ?? artifact.issueId.slice(0, 8)}
                issueRef={issue?.ref ?? artifact.issueId}
                projectTitle={project?.title ?? null}
                projectHref={project?.href ?? null}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
