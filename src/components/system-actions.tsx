"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, LoaderCircle, Sparkles, Trash2 } from "lucide-react";

import { formatBytes } from "@/lib/formatters";
import { StorageMetric, SystemAction } from "@/lib/types";

function actionIcon(id: string) {
  if (id === "open-output") return FolderOpen;
  if (id === "clean-workspace") return Trash2;
  return Sparkles;
}

export function SystemActions({
  actions,
  storage,
}: {
  actions: SystemAction[];
  storage: StorageMetric[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runAction(action: SystemAction) {
    setBusyId(action.id);
    setMessage(null);

    try {
      const response = await fetch(action.endpoint, { method: action.method });
      const payload = (await response.json()) as any;

      if (!response.ok) throw new Error(payload.error ?? "Aksi gagal.");

      if (action.id === "test-cerebras") {
        setMessage(`Cerebras siap (${payload.model ?? "aktif"}).`);
      } else if (action.id === "clean-workspace") {
        setMessage(`Cleaned: ${payload.deletedFiles ?? 0} files, ${formatBytes(payload.freedBytes ?? 0)}`);
      } else {
        setMessage(payload.path ? `Opened: ${payload.path}` : "Success.");
      }

      startTransition(() => router.refresh());
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="glass-card flex flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100">
          System Actions
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {storage.map((item, i) => (
          <div
            key={item.id}
            className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-center animate-scale-in"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <p className="text-[10px] uppercase font-semibold text-slate-500 mb-1">{item.label}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {actions.map((action, i) => {
          const Icon = actionIcon(action.id);
          return (
            <div
              key={action.id}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/20 animate-slide-in-right"
              style={{ animationDelay: `${(i * 80) + 100}ms` }}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {action.label}
                </span>
              </div>
              <button
                onClick={() => runAction(action)}
                disabled={busyId === action.id}
                className="secondary-button h-8 px-3 text-xs"
              >
                {busyId === action.id ? <LoaderCircle className="w-3 h-3 animate-spin" /> : "Run"}
              </button>
            </div>
          );
        })}
      </div>

      {message && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium text-center">
          {message}
        </div>
      )}
    </section>
  );
}
