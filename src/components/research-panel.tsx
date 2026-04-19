import { ArrowUpRight } from "lucide-react";

import { ResearchReference } from "@/lib/types";

export function ResearchPanel({
  references,
}: {
  references: ResearchReference[];
}) {
  return (
    <section className="glass-card flex flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100">
          References
        </h2>
      </div>

      <div className="grid gap-3">
        {references.map((reference, i) => (
          <a
            key={reference.title}
            href={reference.link}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors animate-slide-in-right"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                {reference.title}
              </h3>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-accent-500 transition-colors shrink-0" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              {reference.takeaway}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}
