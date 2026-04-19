import { SummaryMetric } from "@/lib/types";

export function HeroPanel({ summary }: { summary: SummaryMetric[] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl background-grid animate-fade-in-up delay-0">
      <div className="relative z-10 px-8 py-12 sm:px-10 sm:py-16 text-center max-w-4xl mx-auto border border-slate-200/50 dark:border-slate-800/50 rounded-3xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
        <h1 className="hero-title animate-fade-in-up delay-75">
          <span className="gradient-text">Auto-clip video. </span>
          <br className="hidden sm:block" />
          <span className="gradient-text-accent">Siap publish.</span>
        </h1>
        <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-400 mx-auto max-w-2xl animate-fade-in-up delay-150">
          Satu workspace ringkas untuk ingest source, kurasi hook, dan eksport hasil akhir tanpa layout yang terasa berisik.
        </p>

        {/* Stats inline */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-8 border-t border-slate-200/50 dark:border-slate-800/50 pt-8">
          {summary.map((metric, i) => (
            <div
              key={metric.label}
              className="text-center animate-scale-in"
              style={{ animationDelay: `${300 + i * 100}ms` }}
            >
              <p className="stat-number text-slate-800 dark:text-slate-100">{metric.value}</p>
              <p className="micro-label mt-2">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
