"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Link2, LoaderCircle, Upload } from "lucide-react";

import { ReadinessItem } from "@/lib/types";
import { cn } from "@/lib/cn";

type Mode = "url" | "upload" | "local";

const modeCopy: Record<Mode, { title: string; icon: typeof Link2 }> = {
  url: { title: "URL", icon: Link2 },
  upload: { title: "Upload", icon: Upload },
  local: { title: "Local", icon: Film },
};

export function SourceIntake({ readiness }: { readiness: ReadinessItem[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const missingInfra = readiness.filter((item) => !item.ready).length;

  async function submitIntake() {
    setBusy(true);
    setMessage(null);

    try {
      let response: Response;
      if (mode === "upload" || transcriptFile) {
        if (mode === "upload" && !file) throw new Error("Pilih file video terlebih dahulu.");
        
        const formData = new FormData();
        formData.set("sourceType", mode);
        formData.set("title", title);
        formData.set("url", url);
        formData.set("localPath", localPath);
        formData.set("transcriptText", transcriptText);
        if (file) formData.set("file", file);
        if (transcriptFile) formData.set("transcriptFile", transcriptFile);

        response = await fetch("/api/intake", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: mode, title, url, localPath, transcriptText }),
        });
      }

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Gagal menjalankan intake.");

      setMessage("Source ditambahkan. Menganalisis kandidat...");
      setTitle(""); setUrl(""); setLocalPath(""); setFile(null);
      setTranscriptFile(null); setTranscriptText("");
      startTransition(() => router.refresh());
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card flex flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200/50 dark:border-slate-800/50 pb-4">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100">
          Intake Source
        </h2>
        {missingInfra > 0 && (
          <span className="text-xs px-2 py-1 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            {missingInfra} Fallback
          </span>
        )}
      </div>

      {/* Segmented Control */}
      <div className="flex p-1 bg-slate-100/80 dark:bg-slate-800/50 rounded-xl mb-6 self-start backdrop-blur-sm animate-fade-in-up delay-100">
        {(Object.keys(modeCopy) as Mode[]).map((item) => {
          const Icon = modeCopy[item].icon;
          const isActive = mode === item;
          return (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 text-sm font-semibold transition-all rounded-lg",
                isActive
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              )}
            >
              <Icon size={14} />
              {modeCopy[item].title}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 w-full animate-fade-in-up delay-200">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-shell w-full animate-fade-in delay-300"
          placeholder="Run Label (Opsional)"
        />

        {mode === "url" && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input-shell w-full animate-fade-in delay-300"
            placeholder="https://youtube.com/..."
          />
        )}

        {mode === "local" && (
          <input
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            className="input-shell w-full animate-fade-in delay-300"
            placeholder="Absolute MP4 file path"
          />
        )}

        {mode === "upload" && (
          <label className="flex items-center gap-3 px-4 py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors animate-fade-in delay-300">
            <Upload className="text-slate-400 w-5 h-5" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {file ? file.name : "Choose video (.mp4)"}
            </span>
            <input
              type="file"
              accept="video/mp4"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        )}

        <div className="pt-2 animate-fade-in delay-400">
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            rows={3}
            className="input-shell w-full py-2 text-sm"
            placeholder="Manual Transcript Overlay (Optional)"
          />
        </div>
      </div>

      <div className="mt-auto pt-6 flex items-center justify-between animate-fade-in-up delay-300">
        {message && (
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 animate-in fade-in">
            {message}
          </span>
        )}
        <button
          type="button"
          onClick={submitIntake}
          disabled={busy || (!url && !localPath && !file)}
          className="primary-button ml-auto px-6 h-[42px]"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Analisis"}
        </button>
      </div>
    </section>
  );
}
