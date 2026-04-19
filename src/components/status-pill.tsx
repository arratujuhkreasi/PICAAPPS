import { cn } from "@/lib/cn";

const statusStyles: Record<string, string> = {
  draft:
    "bg-white/60 text-slate-600 border-slate-200/60 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50",
  ready:
    "bg-emerald-50/80 text-emerald-700 border-emerald-200/60 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25",
  rendered:
    "bg-accent-50/80 text-accent-700 border-accent-200/60 dark:bg-accent-500/15 dark:text-accent-400 dark:border-accent-500/25",
  failed:
    "bg-amber-50/80 text-amber-700 border-amber-200/60 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/25",
  ingested:
    "bg-slate-100/80 text-slate-600 border-slate-200/60 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600/40",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
        statusStyles[status] ??
          "bg-white/60 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50",
      )}
    >
      {status}
    </span>
  );
}
