"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Scissors, Sparkles } from "lucide-react";

import { formatDurationRange } from "@/lib/formatters";
import { type ClipCardView, type SubtitlePreset } from "@/lib/types";
import { cn } from "@/lib/cn";
import { StatusPill } from "./status-pill";

const presets: Array<{ id: SubtitlePreset; label: string }> = [
  { id: "punch", label: "Punch" },
  { id: "clean", label: "Clean" },
];

export function ClipRecommendations({ clips }: { clips: ClipCardView[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<SubtitlePreset>("punch");

  async function selectClip(clipId: string) {
    setPendingId(clipId);
    try {
      const response = await fetch(`/api/clips/${clipId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleStyle: selectedPreset }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Gagal memilih clip.");
      startTransition(() => router.refresh());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setPendingId(null);
    }
  }

  const clip = clips[0]; // Exactly 1 hook

  return (
    <section className="glass-card flex flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent-500" />
          The Viral Hook
        </h2>
        
        {/* Preset Selector */}
        <div className="flex p-1 bg-slate-100/80 dark:bg-slate-800/50 rounded-lg">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPreset(p.id)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                selectedPreset === p.id
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!clip ? (
        <div className="py-12 text-center">
          <p className="text-slate-400 dark:text-slate-500 font-medium tracking-[-0.01em]">Masukkan URL video untuk mendapatkan 1 menit terbaik.</p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-accent-500/20 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-800/40 dark:to-slate-900/40 p-6 sm:p-8 shadow-sm animate-scale-in delay-150">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-accent-500/10 blur-3xl animate-fade-in delay-500" />
          
          <div className="relative z-10 flex flex-col gap-6 animate-fade-in-up delay-300">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill status={clip.status} />
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                  ⏱ {formatDurationRange(clip.startTime, clip.endTime)}
                </span>
              </div>
              
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-[-0.02em] leading-tight">
                {clip.hookTitle}
              </h3>
              
              <p className="text-sm font-medium text-accent-600 dark:text-accent-400">
                Alasan AI: {clip.hookReason}
              </p>

              <div className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50">
                <p className="text-sm text-slate-600 dark:text-slate-300 italic align-middle leading-relaxed">
                  "{clip.transcriptPreview}"
                </p>
              </div>
            </div>

            <button
              disabled={pendingId === clip.id}
              onClick={() => selectClip(clip.id)}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-accent-600 px-8 py-4 text-sm font-bold tracking-wide text-white transition-all hover:bg-accent-700 hover:shadow-lg hover:shadow-accent-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {pendingId === clip.id ? (
                <>
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                  MERENDER...
                </>
              ) : (
                <>
                  <Scissors className="h-5 w-5" />
                  RENDER KE PORTRAIT (9:16)
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

