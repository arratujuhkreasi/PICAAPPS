"use client";

import { useState } from "react";
import { Copy, PlayCircle } from "lucide-react";

import { formatDurationRange } from "@/lib/formatters";
import { HistoryRow } from "@/lib/types";
import { cn } from "@/lib/cn";
import { StatusPill } from "./status-pill";

export function ClipHistoryTable({ history }: { history: HistoryRow[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyPath(id: string, value: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1200);
  }

  const row = history[0];

  return (
    <section className="glass-card flex flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <PlayCircle className="w-5 h-5 text-emerald-500" />
          Ready to Post
        </h2>
      </div>

      {!row ? (
        <div className="py-12 text-center h-full flex flex-col items-center justify-center">
          <p className="text-slate-400 dark:text-slate-500 font-medium tracking-[-0.01em]">Belum ada video yang di-render.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-[320px] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-200/50 dark:ring-slate-700/50 bg-black group animate-scale-in delay-150">
            {row.assetUrl ? (
              <video
                controls
                preload="metadata"
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
              >
                <source src={row.assetUrl} type="video/mp4" />
              </video>
            ) : (
              <div className="flex w-full h-full items-center justify-center bg-slate-900">
                <PlayCircle className="w-12 h-12 text-slate-700" />
              </div>
            )}
            
            {/* Status overlay */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
              <StatusPill status={row.status} />
              <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-md">
                <span className="text-xs font-bold text-white tracking-widest">9:16</span>
              </div>
            </div>
          </div>

          <div className="mt-8 w-full max-w-[320px] space-y-4 animate-fade-in-up delay-300">
            <div className="text-center">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg leading-snug">
                {row.hookTitle}
              </h3>
              <p className="text-sm text-slate-500 mt-1 truncate">
                {row.video.title}
              </p>
            </div>

            {row.localFilePath && (
              <button
                onClick={() => copyPath(row.id, row.localFilePath)}
                className="w-full group flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-slate-200/60 dark:border-slate-700/60 transition-all cursor-copy"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Berhasil Disimpan Ke</p>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">
                    {row.localFilePath.split(/[/\\]/).pop()}
                  </p>
                </div>
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0",
                  copiedId === row.id 
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                    : "bg-white dark:bg-slate-700 text-slate-400 group-hover:text-emerald-500"
                )}>
                  <Copy className="w-4 h-4" />
                </div>
              </button>
            )}
            {copiedId === row.id && (
                <p className="text-xs font-medium text-emerald-500 text-center animate-in fade-in slide-in-from-bottom-2">Path disalin! Paste ke explorer Anda.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
