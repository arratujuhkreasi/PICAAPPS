import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import type { TranscriptPayload, TranscriptWord } from "@/lib/types";

const transcriptExtensions = [".srt", ".vtt", ".txt"];

interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toSeconds(value: number) {
  return Math.max(0, Number(value.toFixed(2)));
}

function normalizeCaptionText(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]+\}/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubtitleTimestamp(raw: string) {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");

  if (parts.length === 3) {
    const [hours, minutes, secondsAndMs] = parts;
    const [seconds, milliseconds = "0"] = secondsAndMs.split(".");
    return (
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds) +
      Number(milliseconds.padEnd(3, "0").slice(0, 3)) / 1000
    );
  }

  if (parts.length === 2) {
    const [minutes, secondsAndMs] = parts;
    const [seconds, milliseconds = "0"] = secondsAndMs.split(".");
    return (
      Number(minutes) * 60 +
      Number(seconds) +
      Number(milliseconds.padEnd(3, "0").slice(0, 3)) / 1000
    );
  }

  return Number.NaN;
}

function estimateWordTiming(wordCount: number, durationSeconds?: number | null) {
  if (!wordCount) {
    return 0.45;
  }

  const usableDuration =
    durationSeconds && durationSeconds > 3
      ? Math.max(4, Math.min(durationSeconds * 0.92, wordCount * 0.82))
      : wordCount * 0.52;

  return usableDuration / wordCount;
}

function cuesToTranscript(cues: TranscriptCue[], source: TranscriptPayload["source"]) {
  const words: TranscriptWord[] = [];
  const textParts: string[] = [];

  for (const cue of cues) {
    const normalized = normalizeCaptionText(cue.text);
    if (!normalized) {
      continue;
    }

    textParts.push(normalized);
    const cueWords = normalized.split(/\s+/).filter(Boolean);
    const step = Math.max((cue.end - cue.start) / Math.max(cueWords.length, 1), 0.18);

    cueWords.forEach((word, index) => {
      const start = toSeconds(cue.start + step * index);
      const end = toSeconds(
        index === cueWords.length - 1 ? cue.end : cue.start + step * (index + 1),
      );
      words.push({
        text: word,
        start,
        end: Math.max(end, start + 0.08),
      });
    });
  }

  return {
    text: textParts.join(" ").trim(),
    words,
    language: "id",
    source,
  } satisfies TranscriptPayload;
}

function parseSrtOrVtt(rawContent: string) {
  const normalized = rawContent.replace(/\r/g, "");
  const blocks = normalized.split(/\n\s*\n/);
  const cues: TranscriptCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) {
      continue;
    }

    const [rawStart, rawEnd] = timingLine.split("-->").map((value) => value.trim());
    const start = parseSubtitleTimestamp(rawStart);
    const end = parseSubtitleTimestamp(rawEnd.split(" ")[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }

    const textLines = lines.filter(
      (line) =>
        line !== timingLine &&
        !/^\d+$/.test(line) &&
        line.toUpperCase() !== "WEBVTT" &&
        !line.startsWith("NOTE"),
    );
    const text = normalizeCaptionText(textLines.join(" "));

    if (text) {
      cues.push({ start, end, text });
    }
  }

  return cues;
}

export function buildFallbackTranscript(title: string) {
  const phrases = [
    "Banyak video panjang gagal karena pembukaan mereka terlalu datar dan tidak memberi alasan emosional untuk bertahan.",
    "Saat pembicara akhirnya menyebut konflik inti, penonton biasanya berhenti scroll dan mulai mendengarkan lebih serius.",
    "Kalimat yang paling kuat sering bukan yang paling panjang, tetapi yang paling langsung menunjukkan risiko atau payoff.",
    "Potongan terbaik muncul ketika ada perubahan nada, klaim tajam, atau pengakuan yang terasa jujur dan spesifik.",
    "Untuk short-form, subtitle pendek dengan ritme cepat membantu penonton menangkap inti tanpa merasa dibebani.",
    `Dalam run ${title}, fokus utamanya adalah memilih momen yang paling cepat menjelaskan nilai dari keseluruhan percakapan.`,
  ];

  return transcriptFromPlainText(phrases.join(" "), "mock");
}

export function transcriptFromPlainText(
  rawText: string,
  source: TranscriptPayload["source"],
  durationSeconds?: number | null,
) {
  const normalized = normalizeCaptionText(rawText);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const step = estimateWordTiming(tokens.length, durationSeconds);
  const words = tokens.map((token, index) => {
    const start = toSeconds(index * step);
    return {
      text: token,
      start,
      end: toSeconds(start + Math.max(step * 0.86, 0.18)),
    };
  });

  return {
    text: normalized,
    words,
    language: "id",
    source,
  } satisfies TranscriptPayload;
}

export async function transcriptFromFile(filePath: string, durationSeconds?: number | null) {
  const rawContent = await fs.readFile(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".srt" || extension === ".vtt") {
    const cues = parseSrtOrVtt(rawContent);
    if (cues.length > 0) {
      return cuesToTranscript(cues, "captions");
    }
  }

  return transcriptFromPlainText(rawContent, "manual", durationSeconds);
}

export async function findSidecarTranscript(videoPath: string) {
  const directory = path.dirname(videoPath);
  const stem = path.basename(videoPath, path.extname(videoPath));

  for (const extension of transcriptExtensions) {
    const candidate = path.join(directory, `${stem}${extension}`);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}
