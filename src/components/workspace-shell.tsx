"use client";

import dynamic from "next/dynamic";

import { type DashboardData } from "@/lib/types";
import { PipelinePanel } from "./pipeline-panel";
import { ResearchPanel } from "./research-panel";

const SourceIntake = dynamic(
  () => import("@/components/source-intake").then((mod) => mod.SourceIntake),
  {
    ssr: false,
    loading: () => <SectionSkeleton title="Source" lines={3} />,
  },
);

const ClipRecommendations = dynamic(
  () =>
    import("@/components/clip-recommendations").then((mod) => mod.ClipRecommendations),
  {
    ssr: false,
    loading: () => <SectionSkeleton title="Hooks" lines={3} />,
  },
);

const ClipHistoryTable = dynamic(
  () => import("@/components/clip-history-table").then((mod) => mod.ClipHistoryTable),
  {
    ssr: false,
    loading: () => <SectionSkeleton title="History" lines={3} />,
  },
);

const SystemActions = dynamic(
  () => import("@/components/system-actions").then((mod) => mod.SystemActions),
  {
    ssr: false,
    loading: () => <SectionSkeleton title="Workspace" lines={2} />,
  },
);

function SectionSkeleton({
  title,
  lines,
}: {
  title: string;
  lines: number;
}) {
  return (
    <section className="glass-card rounded-2xl px-6 py-6 border border-slate-200/50 dark:border-slate-800/50">
      <div className="h-6 w-32 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800 mb-6" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={`${title}-${index}`}
            className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50"
          />
        ))}
      </div>
    </section>
  );
}

export function WorkspaceShell({ data }: { data: DashboardData }) {
  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] animate-fade-in-up delay-300">
        <SourceIntake readiness={data.readiness} />
        <PipelinePanel readiness={data.readiness} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 animate-fade-in-up delay-400">
        <ClipRecommendations clips={data.recommendations} />
        <ClipHistoryTable history={data.history} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr] border-t border-slate-200/50 dark:border-slate-800/50 pt-8 mt-4 animate-fade-in-up delay-500">
        <SystemActions actions={data.actions} storage={data.storage} />
        <ResearchPanel references={data.references} />
      </div>
    </div>
  );
}
