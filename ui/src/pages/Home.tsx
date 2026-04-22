import { useEffect, useState, type FormEvent } from "react";
import { ArrowUp, Compass, Rocket, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArchieBravoMark } from "@/components/ArchieBravoMark";
import { OpenDashboardToolbarAction } from "@/components/HomeToolbarActions";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";

const PROMPT_CHIPS = [
  "Plan our next product push",
  "Review this week's priorities",
  "Draft a launch brief for the workspace",
];

const STARTER_CARDS = [
  {
    title: "Map the next sprint",
    body: "Outline the most important work, likely blockers, and the best first move.",
  },
  {
    title: "Pressure-test the roadmap",
    body: "Challenge assumptions, surface gaps, and tighten the execution sequence.",
  },
  {
    title: "Turn goals into an agenda",
    body: "Translate strategy into a practical list of next actions for the team.",
  },
  {
    title: "Prepare a board update",
    body: "Summarize progress, open risks, and what needs attention next.",
  },
];

export function Home() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs, setPageToolbar } = useBreadcrumbs();
  const [draft, setDraft] = useState("");
  const [localOnlyNotice, setLocalOnlyNotice] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Home" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    setPageToolbar(<OpenDashboardToolbarAction />);
    return () => setPageToolbar(null);
  }, [setPageToolbar]);

  function applyDraft(value: string) {
    setDraft(value);
    setLocalOnlyNotice(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalOnlyNotice(true);
  }

  const workspaceName = selectedCompany?.name ?? "this workspace";

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-6xl flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <div className="w-full max-w-4xl rounded-[32px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,248,246,0.86))] p-5 shadow-[0_40px_120px_rgba(15,23,42,0.08)] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.9),rgba(12,12,14,0.95))] sm:p-7">
          <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(255,255,255,0.72)_44%,rgba(247,247,244,0.62)_100%)] px-5 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:bg-[radial-gradient(circle_at_top,rgba(38,38,43,0.9),rgba(22,22,27,0.85)_44%,rgba(10,10,12,0.94)_100%)] sm:px-10 sm:py-12">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-32 rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.18),transparent_70%)] blur-3xl" />
            <div className="relative z-10">
              <div className="mx-auto flex max-w-xl items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                <ArchieBravoMark className="h-7 w-7 shrink-0" />
                <span>Archie Bravo</span>
              </div>

              <div className="mx-auto mt-8 max-w-3xl text-center">
                <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
                  What can I help {workspaceName} do next?
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                  This is the new Archie home surface. It is chat-first, visual-only in this pass, and keeps the existing
                  Paperclip dashboard available behind the top-right CTA.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mx-auto mt-8 max-w-3xl">
                <div className="rounded-[28px] border border-border/70 bg-background/95 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                  <Textarea
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.currentTarget.value);
                      setLocalOnlyNotice(false);
                    }}
                    placeholder="Describe what you want Archie to think through, plan, or review..."
                    className="min-h-36 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0"
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <div className="flex flex-wrap gap-2">
                      {PROMPT_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => applyDraft(chip)}
                          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {chip}
                        </button>
                      ))}
                    </div>

                    <Button
                      type="submit"
                      size="icon"
                      className="ml-auto h-10 w-10 rounded-full"
                      aria-label="Submit home prompt"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </form>

              {localOnlyNotice ? (
                <div className="mx-auto mt-3 max-w-3xl rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-100">
                  This home composer is visual-only for now. Nothing has been sent to the backend yet.
                </div>
              ) : null}

              <div className="mx-auto mt-10 flex max-w-3xl items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <WandSparkles className="h-4 w-4 text-muted-foreground" />
                  Get started with
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Compass className="h-3.5 w-3.5" />
                  Manus-inspired landing surface
                </div>
              </div>

              <div className="mx-auto mt-4 grid max-w-3xl gap-3 md:grid-cols-2">
                {STARTER_CARDS.map((card) => (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => applyDraft(card.body)}
                    className="group rounded-[24px] border border-border/70 bg-background/80 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{card.title}</div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.body}</p>
                      </div>
                      <div className="rounded-full border border-border/70 p-2 text-muted-foreground transition-colors group-hover:text-foreground">
                        <Rocket className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
