import { CheckCircle2, AlertCircle } from "lucide-react";

import { ReadinessItem } from "@/lib/types";

export function PipelinePanel({ readiness }: { readiness: ReadinessItem[] }) {
  const readyCount = readiness.filter((item) => item.ready).length;
  const unavailableCount = readiness.length - readyCount;

  return (
    <section className="glass-card flex flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100">
          System Readiness
        </h2>
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
          {readyCount}/{readiness.length} Ready
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {readiness.map((item, i) => (
          <div
            key={item.id}
            className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 animate-fade-in-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {item.ready ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            )}
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {item.label}
                </p>
                <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                  {item.value}
                </span>
              </div>
              <p className="text-xs mt-1 text-slate-500 leading-relaxed">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6 text-sm text-slate-500">
        {unavailableCount > 0
          ? `${unavailableCount} core integration is using fallback systems.`
          : "All local pipelines are functioning."}
      </div>
    </section>
  );
}
