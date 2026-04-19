import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { type ClipWithVideoRow, prisma } from "@/lib/prisma";
import type {
  HookCandidate,
  ReadinessItem,
  StorageMetric,
  SubtitlePreset,
  TranscriptPayload,
  TranscriptWord,
} from "@/lib/types";
import { outputRoot, projectRoot, tempRoot, uploadRoot } from "@/lib/paths";
import {
  buildFallbackTranscript,
  findSidecarTranscript,
  transcriptFromFile,
  transcriptFromPlainText,
} from "@/lib/transcript-utils";

const binaryCache = new Map<string, boolean>();
const cerebrasFallbackModels = ["llama3.1-8b", "gpt-oss-120b"];
const videoExtensions = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const transcriptExtensions = new Set([".srt", ".vtt", ".txt"]);

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureWorkspaceDirectories() {
  await Promise.all([
    fs.mkdir(uploadRoot, { recursive: true }),
    fs.mkdir(outputRoot, { recursive: true }),
    fs.mkdir(tempRoot, { recursive: true }),
  ]);
}

async function inspectDirectory(targetPath: string): Promise<{ files: number; bytes: number }> {
  if (!(await fileExists(targetPath))) {
    return { files: 0, bytes: 0 };
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  let files = 0;
  let bytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await inspectDirectory(fullPath);
      files += nested.files;
      bytes += nested.bytes;
      continue;
    }

    if (entry.isFile()) {
      const stats = await fs.stat(fullPath);
      files += 1;
      bytes += stats.size;
    }
  }

  return { files, bytes };
}

async function clearTempWorkspace(targetPath: string): Promise<{ files: number; bytes: number }> {
  if (!(await fileExists(targetPath))) {
    return { files: 0, bytes: 0 };
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  let files = 0;
  let bytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await clearTempWorkspace(fullPath);
      files += nested.files;
      bytes += nested.bytes;

      const remaining = await fs.readdir(fullPath);
      if (remaining.length === 0) {
        await fs.rmdir(fullPath);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (videoExtensions.has(extension)) {
      continue;
    }

    const stats = await fs.stat(fullPath);
    await fs.rm(fullPath, { force: true });
    files += 1;
    bytes += stats.size;
  }

  return { files, bytes };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeTitle(rawTitle?: string | null, fallback = "Untitled source") {
  const title = rawTitle?.trim();
  return title && title.length > 0 ? title : fallback;
}

function toSeconds(value: number) {
  return Math.max(0, Number(value.toFixed(2)));
}

function escapeSubtitlePath(targetPath: string) {
  return targetPath.replaceAll("\\", "/").replace(":", "\\:");
}

function formatTimestamp(value: number) {
  const totalMs = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  const parts = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0"));
  return `${parts.join(":")},${String(milliseconds).padStart(3, "0")}`;
}

function chunkWords(words: TranscriptWord[], size: number) {
  const chunks: TranscriptWord[][] = [];

  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size));
  }

  return chunks;
}

function buildSrtContent(words: TranscriptWord[], style: SubtitlePreset) {
  const normalizedStyle = style === "clean" ? "sentence" : style === "punch" ? "word" : style;
  const chunks = normalizedStyle === "word" ? chunkWords(words, 2) : chunkWords(words, 5);

  return chunks
    .map((chunk, index) => {
      const start = formatTimestamp(chunk[0]?.start ?? 0);
      const end = formatTimestamp(chunk[chunk.length - 1]?.end ?? 0.5);
      const rawText = chunk.map((word) => word.text).join(" ");
      const text = style === "punch" ? rawText.toUpperCase() : rawText;
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
}

function subtitlePresetStyle(style: SubtitlePreset) {
  if (style === "clean" || style === "sentence") {
    return "FontName=Arial,Fontsize=14,Alignment=2,MarginV=54,Outline=1,Shadow=0,BorderStyle=3,BackColour=&H4A000000,PrimaryColour=&H00FFFFFF";
  }

  return "FontName=Impact,Fontsize=14,Alignment=2,MarginV=72,Outline=2,Shadow=0,BorderStyle=3,BackColour=&H14000000,PrimaryColour=&H0036F3FF";
}

async function runCommand(executable: string, args: string[], timeoutMs = 120000) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(async (resolve, reject) => {
    
    // Check local binary first
    let commandToRun = executable;
    const isWindows = process.platform === "win32";
    const localBinaryPath = isWindows ? path.join(projectRoot, `${executable}.exe`) : path.join(projectRoot, executable);
    
    // Check without caching to avoid circular dependencies locally
    try {
        await fs.access(localBinaryPath, fsConstants.F_OK);
        commandToRun = localBinaryPath;
    } catch {}

    const child = spawn(commandToRun, args, {
      cwd: projectRoot,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${commandToRun}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        code: code ?? 1,
      });
    });
  });
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  if (fenced.startsWith("{") && fenced.endsWith("}")) {
    return fenced;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("No JSON object found in model response.");
}

async function hasBinary(binary: string) {
  const cached = binaryCache.get(binary);
  if (cached !== undefined) {
    return cached;
  }

  const isWindows = process.platform === "win32";
  const localBinaryPath = isWindows ? path.join(projectRoot, `${binary}.exe`) : path.join(projectRoot, binary);

  if (await fileExists(localBinaryPath)) {
    binaryCache.set(binary, true);
    return true;
  }

  const command = isWindows ? "where.exe" : "which";

  try {
    const result = await runCommand(command, [binary], 15000);
    const isReady = result.code === 0;
    binaryCache.set(binary, isReady);
    return isReady;
  } catch {
    binaryCache.set(binary, false);
    return false;
  }
}

async function probeVideoDuration(sourcePath: string) {
  if (!(await hasBinary("ffprobe")) || !(await fileExists(sourcePath))) {
    return null;
  }

  try {
    const result = await runCommand(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        sourcePath,
      ],
      25000,
    );
    const duration = Number.parseFloat(result.stdout.trim());
    return Number.isFinite(duration) ? Math.round(duration) : null;
  } catch {
    return null;
  }
}

async function writeSupportFile(file: File, prefix: string) {
  await ensureWorkspaceDirectories();
  const extension = path.extname(file.name) || ".txt";
  const fileName = `${Date.now()}-${slugify(prefix || file.name || randomUUID())}${extension}`;
  const targetPath = path.join(tempRoot, fileName);
  await fs.writeFile(targetPath, Buffer.from(await file.arrayBuffer()));
  return targetPath;
}

async function extractAudioFromVideo(videoPath: string): Promise<string | null> {
  console.log("extractAudioFromVideo started for:", videoPath);
  const ffmpegReady = await hasBinary("ffmpeg");
  if (!ffmpegReady) {
    console.log("FFMPEG binary not ready!");
    return null;
  }

  const audioPath = path.join(tempRoot, `${randomUUID()}-audio.mp3`);
  
  try {
    const result = await runCommand("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "32k",
      audioPath
    ], 300000);
    
    if (result.code === 0 && await fileExists(audioPath)) {
      console.log("extractAudioFromVideo success:", audioPath);
      return audioPath;
    } else {
      console.log("extractAudioFromVideo failed. FFMPEG stderr:", result.stderr);
    }
  } catch (e) { console.log("extractAudioFromVideo crash:", e); }
  return null;
}

interface GroqVerboseJson {
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

async function transcribeWithGroq(audioPath: string): Promise<TranscriptPayload | null> {
  if (!process.env.GROQ_API_KEY) return null;

  try {
    const buffer = await fs.readFile(audioPath);
    const blob = new Blob([buffer], { type: "audio/mpeg" });
    const formData = new FormData();
    formData.append("file", blob, "audio.mp3");
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      console.error("Groq Whisper error", await response.text());
      return null;
    }

    const payload = await response.json() as GroqVerboseJson;
    
    let groqWords = payload.words;
    if (!groqWords || groqWords.length === 0) {
      if ((payload as any).segments && Array.isArray((payload as any).segments)) {
        groqWords = [];
        for (const seg of (payload as any).segments) {
          if (seg.words && Array.isArray(seg.words)) {
            groqWords.push(...seg.words);
          } else {
            const tokens = seg.text.trim().split(/\s+/).filter(Boolean);
            const step = Math.max((seg.end - seg.start) / Math.max(tokens.length, 1), 0.1);
            tokens.forEach((t: string, i: number) => {
              groqWords!.push({ word: t, start: seg.start + (i * step), end: seg.start + ((i+1) * step) });
            });
          }
        }
      }
    }

    if (!groqWords || groqWords.length === 0) {
       console.log("Transcribe With Groq words array still empty!");
       return transcriptFromPlainText(payload.text, "manual");
    }

    console.log("Transcribe with Groq SUCCESS! Word count:", groqWords.length);
    const words: TranscriptWord[] = groqWords.map(w => ({
      text: w.word.trim(),
      start: w.start,
      end: w.end,
    }));

    return {
      text: payload.text,
      words,
      language: "id",
      source: "manual"
    };
  } catch (error) {
    console.error("Transcribe groq error", error);
    return null;
  }
}

async function resolveTranscript(params: {
  title: string;
  durationSeconds?: number | null;
  sourcePath?: string | null;
  transcriptText?: string;
  transcriptFilePath?: string | null;
  downloadedCaptionPath?: string | null;
}) {
  if (process.env.GROQ_API_KEY && params.sourcePath && await fileExists(params.sourcePath)) {
    const audioPath = await extractAudioFromVideo(params.sourcePath);
    if (audioPath) {
      const groqTranscript = await transcribeWithGroq(audioPath);
      if (groqTranscript) {
        return groqTranscript;
      }
    }
  }

  if (params.transcriptFilePath && (await fileExists(params.transcriptFilePath))) {
    return transcriptFromFile(params.transcriptFilePath, params.durationSeconds);
  }

  if (params.transcriptText?.trim()) {
    return transcriptFromPlainText(params.transcriptText, "manual", params.durationSeconds);
  }

  if (params.downloadedCaptionPath && (await fileExists(params.downloadedCaptionPath))) {
    return transcriptFromFile(params.downloadedCaptionPath, params.durationSeconds);
  }

  if (params.sourcePath && (await fileExists(params.sourcePath))) {
    const sibling = await findSidecarTranscript(params.sourcePath);
    if (sibling) {
      return transcriptFromFile(sibling, params.durationSeconds);
    }
  }

  return buildFallbackTranscript(params.title);
}

async function findDownloadedArtifacts(prefix: string) {
  const files = await fs.readdir(uploadRoot);
  const matched = files.filter((file) => file.startsWith(prefix));

  let videoPath: string | null = null;
  let captionPath: string | null = null;

  for (const file of matched) {
    const fullPath = path.join(uploadRoot, file);
    const extension = path.extname(file).toLowerCase();

    if (!videoPath && videoExtensions.has(extension)) {
      videoPath = fullPath;
    }

    if (!captionPath && transcriptExtensions.has(extension)) {
      captionPath = fullPath;
    }
  }

  return { videoPath, captionPath };
}

function sentenceWindows(words: TranscriptWord[]) {
  const windows: Array<{ text: string; start: number; end: number }> = [];
  const punctuation = /[.!?]$/;
  let current: TranscriptWord[] = [];

  for (const word of words) {
    current.push(word);
    if (punctuation.test(word.text)) {
      windows.push({
        text: current.map((item) => item.text).join(" "),
        start: current[0]?.start ?? 0,
        end: current[current.length - 1]?.end ?? 0,
      });
      current = [];
    }
  }

  if (current.length > 0) {
    windows.push({
      text: current.map((item) => item.text).join(" "),
      start: current[0]?.start ?? 0,
      end: current[current.length - 1]?.end ?? 0,
    });
  }

  return windows;
}

function scoreSentence(text: string) {
  const emotionalKeywords = [
    "konflik",
    "tajam",
    "berhenti",
    "risiko",
    "payoff",
    "jujur",
    "spesifik",
    "gagal",
    "terbaik",
  ];

  let score = 6.8;

  for (const keyword of emotionalKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score += 0.45;
    }
  }

  score += Math.min(text.length / 120, 1.3);
  return Number(score.toFixed(1));
}

function buildHeuristicHooks(transcript: TranscriptPayload): HookCandidate[] {
  const windows = sentenceWindows(transcript.words);

  const bestWindow = windows
    .map((window, index) => {
      const score = scoreSentence(window.text);
      const start = toSeconds(Math.max(0, window.start - 1.2));
      return {
        hookTitle: "The Best 60-Second Hook",
        hookReason: "Dipilih sebagai hook 1 menit terbaik berdasarkan konflik awal.",
        startTime: start,
        endTime: start + 60, // Fixed 60 seconds
        score,
        transcriptPreview: window.text,
      };
    })
    .sort((left, right) => right.score - left.score)[0]; // Return only the top 1

  return bestWindow ? [bestWindow] : [];
}

async function analyzeHooksWithCerebras(transcript: TranscriptPayload) {
  if (!process.env.CEREBRAS_API_KEY) {
    return buildHeuristicHooks(transcript);
  }

  const preferredModel = process.env.CEREBRAS_MODEL || "llama3.1-8b";
  const candidateModels = [
    preferredModel,
    ...cerebrasFallbackModels.filter((model) => model !== preferredModel),
  ];

  for (const model of candidateModels) {
    try {
      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_completion_tokens: 700,
          messages: [
            {
              role: "system",
              content: `Kamu adalah seorang Ahli Strategi Konten Viral (TikTok, YouTube Shorts, IG Reels) dan Master Editor Video. Tugas utamamu adalah menganalisis transkrip dari sebuah video panjang dan mengekstrak segmen-segmen "Golden Nugget" untuk dijadikan video pendek yang berpotensi sangat viral.

INPUT:
Kamu akan menerima transkrip video lengkap yang sudah dilengkapi dengan timestamp (waktu).

KRITERIA EKSTRAKSI (WAJIB DIPATUHI):
1. HOOK YANG MEMATIKAN (MAGNETIC HOOK): 
   Setiap klip HARUS dimulai dengan kalimat yang memicu rasa penasaran tinggi, kontroversi ringan, fakta mengejutkan, atau emosi yang kuat di 3-5 detik pertama. Penonton tidak boleh punya alasan untuk men-scroll lewat.
2. KEUTUHAN KALIMAT (NO BROKEN SENTENCES - SANGAT KRITIS):
   - Kamu DILARANG KERAS memotong kalimat di tengah kata atau frasa.
   - Titik awal (Start Time) harus tepat sebelum kata pertama dari kalimat pembuka dimulai.
   - Titik akhir (End Time) harus menutup sebuah pernyataan atau cerita dengan tuntas. Jangan tinggalkan kalimat yang menggantung atau memotong napas pembicara.
3. DURASI FLEKSIBEL NAMUN PADAT:
   Tidak ada batasan durasi pasti (bisa 15 detik, bisa 90 detik). Prioritas utamanya adalah retensi penonton. Jika ada bagian yang membosankan di tengah segmen, abaikan segmen tersebut atau cari pemotongan yang lebih dinamis.
4. PAYOFF / PENYELESAIAN:
   Klip harus memberikan nilai (edukasi, hiburan, komedi, atau inspirasi) yang tuntas di akhir video, sehingga penonton merasa puas atau ingin menonton ulang (looping).

FORMAT OUTPUT:
Kamu hanya boleh merespons dengan format JSON murni tanpa tambahan teks markdown lain, menggunakan struktur berikut:
{
  "clips": [
    {
      "id": 1,
      "start_time": "[Format MM:SS atau HH:MM:SS]",
      "end_time": "[Format MM:SS atau HH:MM:SS]",
      "hook_quote": "[Kutipan persis dari kalimat pertama yang menjadi hook]",
      "transcript_snippet": "[Transkrip penuh dari segmen yang dipilih]",
      "viral_reasoning": "[Analisis tajam: Mengapa hook ini akan menahan audiens dan membuat video ini viral?]",
      "viral_score_prediction": [Angka 1-100],
      "suggested_title": "[Saran judul atau teks caption layar yang mengundang klik]"
    }
  ]
}`,
            },
            {
              role: "user",
              content: JSON.stringify({
                transcript: transcript.text,
                language: transcript.language,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const rawContent = payload.choices?.[0]?.message?.content;
      if (!rawContent) {
        return buildHeuristicHooks(transcript);
      }

      const parsed = JSON.parse(extractJsonObject(rawContent)) as { 
        clips?: Array<{
          start_time: string;
          end_time: string;
          hook_quote: string;
          transcript_snippet: string;
          viral_reasoning: string;
          viral_score_prediction: number | string;
          suggested_title: string;
        }> 
      };

      if (!parsed.clips?.length) {
        return buildHeuristicHooks(transcript);
      }

      return parsed.clips.slice(0, 1).map((clip) => {
        const parseTime = (timeStr: string) => {
           if (!timeStr) return 0;
           const parts = timeStr.trim().split(':').map(Number);
           if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + (parts[2] || 0);
           if (parts.length === 2) return (parts[0] * 60) + (parts[1] || 0);
           return Number(timeStr) || 0;
        };
        
        return {
          hookTitle: clip.suggested_title || "Viral Hook",
          hookReason: clip.viral_reasoning || "Dipilih berdasarkan viral prompt.",
          startTime: parseTime(clip.start_time),
          endTime: parseTime(clip.end_time),
          score: Number(clip.viral_score_prediction) || 95,
          transcriptPreview: clip.transcript_snippet || clip.hook_quote || "",
        };
      });
    } catch {
      continue;
    }
  }

  return buildHeuristicHooks(transcript);
}

async function createClipDrafts(params: {
  localVideoId: string;
  transcript: TranscriptPayload;
  hooks: HookCandidate[];
}) {
  await prisma.clipResult.deleteMany({
    where: {
      localVideoId: params.localVideoId,
      status: "draft",
    },
  });

  await prisma.clipResult.createMany({
    data: params.hooks.map((hook) => ({
      localVideoId: params.localVideoId,
      hookTitle: hook.hookTitle,
      hookReason: hook.hookReason,
      transcriptJson: JSON.stringify({
        transcript: params.transcript.text,
        words: params.transcript.words,
        transcriptPreview: hook.transcriptPreview,
        source: params.transcript.source,
      }),
      subtitleFormat: "word",
      startTime: hook.startTime,
      endTime: hook.endTime,
      score: hook.score,
      status: "draft",
      localFilePath: null,
    })),
  });
}

async function processVideoRecord(params: {
  record: {
    id: string;
    title: string;
    originalUrlOrPath: string;
    durationSeconds?: number | null;
  };
  transcriptText?: string;
  transcriptFilePath?: string | null;
  downloadedCaptionPath?: string | null;
}) {
  const transcript = await resolveTranscript({
    title: params.record.title,
    durationSeconds: params.record.durationSeconds,
    sourcePath: params.record.originalUrlOrPath,
    transcriptText: params.transcriptText,
    transcriptFilePath: params.transcriptFilePath,
    downloadedCaptionPath: params.downloadedCaptionPath,
  });
  const hooks = await analyzeHooksWithCerebras(transcript);

  await createClipDrafts({
    localVideoId: params.record.id,
    transcript,
    hooks,
  });

  return {
    transcript,
    hooks,
  };
}

async function ingestUrl(params: {
  url: string;
  title?: string;
  transcriptText?: string;
  transcriptFile?: File;
}) {
  await ensureWorkspaceDirectories();

  // WIPE AUTOMATIS: Menghapus seluruh video dan draft sebelumnya (Alat menjadi 1-Video Workflow)
  const allVideos = await prisma.localVideo.findMany();
  for (const v of allVideos) {
    await prisma.clipResult.deleteMany({ where: { localVideoId: v.id } });
  }
  await prisma.localVideo.deleteMany({});

  const transcriptFilePath = params.transcriptFile
    ? await writeSupportFile(params.transcriptFile, `${params.title || "url"}-transcript`)
    : null;
  let storedPath = params.url;
  let downloadedCaptionPath: string | null = null;
  let notes =
    "URL tersimpan. Reclipa akan memakai caption yt-dlp bila tersedia, atau transcript manual yang Anda lampirkan.";

  if (await hasBinary("yt-dlp")) {
    const prefix = `${Date.now()}-${slugify(params.title || "source") || randomUUID()}`;
    const template = path.join(uploadRoot, `${prefix}.%(ext)s`);
    try {
      const result = await runCommand(
        "yt-dlp",
        [
          "--no-playlist",
          "--write-auto-subs",
          "--write-subs",
          "--sub-langs",
          "id.*,en.*",
          "--sub-format",
          "vtt",
          "--convert-subs",
          "srt",
          "-o",
          template,
          params.url,
        ],
        240000,
      );
      if (result.code === 0) {
        const artifacts = await findDownloadedArtifacts(prefix);
        if (artifacts.videoPath) {
          storedPath = artifacts.videoPath;
        }
        downloadedCaptionPath = artifacts.captionPath;
        notes = artifacts.captionPath
          ? "Video dan caption berhasil ditarik via yt-dlp; Cerebras akan menganalisis transcript subtitle."
          : "Video berhasil diunduh via yt-dlp, tetapi caption tidak ditemukan; gunakan transcript manual bila perlu.";
      } else {
        console.error("Yt-dlp failed with code", result.code, result.stderr);
        notes = "yt-dlp terdeteksi tetapi proses unduh gagal. Run tetap dibuat dan bisa memakai transcript manual.";
      }
    } catch (e) {
      console.error("Yt-dlp execution crashed:", e);
      notes =
        "yt-dlp terdeteksi tetapi proses unduh gagal. Run tetap dibuat dan bisa memakai transcript manual.";
    }
  }

  const record = await prisma.localVideo.create({
    data: {
      title: normalizeTitle(params.title, "URL source"),
      originalUrlOrPath: storedPath,
      durationSeconds: storedPath !== params.url ? await probeVideoDuration(storedPath) : null,
      sourceType: "url",
      status: "ingested",
      notes,
    },
  });

  await processVideoRecord({
    record,
    transcriptText: params.transcriptText,
    transcriptFilePath,
    downloadedCaptionPath,
  });
  return record;
}

async function ingestLocalPath(params: {
  localPath: string;
  title?: string;
  transcriptText?: string;
  transcriptFile?: File;
}) {
  await ensureWorkspaceDirectories();

  const exists = await fileExists(params.localPath);
  if (!exists) {
    throw new Error("Path file tidak ditemukan.");
  }

  const transcriptFilePath = params.transcriptFile
    ? await writeSupportFile(params.transcriptFile, `${params.title || "local"}-transcript`)
    : null;

  const record = await prisma.localVideo.create({
    data: {
      title: normalizeTitle(params.title, path.basename(params.localPath)),
      originalUrlOrPath: params.localPath,
      durationSeconds: await probeVideoDuration(params.localPath),
      sourceType: "local",
      status: "ingested",
      notes:
        "File lokal dipakai langsung. Reclipa akan mencari sidecar subtitle atau memakai transcript manual bila tersedia.",
    },
  });

  await processVideoRecord({
    record,
    transcriptText: params.transcriptText,
    transcriptFilePath,
  });
  return record;
}

async function ingestUpload(params: {
  file: File;
  title?: string;
  transcriptText?: string;
  transcriptFile?: File;
}) {
  await ensureWorkspaceDirectories();
  
  // WIPE AUTOMATIS: Menghapus seluruh video dan draft sebelumnya (Alat menjadi 1-Video Workflow)
  const allVideos = await prisma.localVideo.findMany();
  for (const v of allVideos) {
    await prisma.clipResult.deleteMany({ where: { localVideoId: v.id } });
  }
  await prisma.localVideo.deleteMany({});

  const buffer = Buffer.from(await params.file.arrayBuffer());
  const extension = path.extname(params.file.name) || ".mp4";
  const storedName = `${Date.now()}-${slugify(params.title || params.file.name || randomUUID())}${extension}`;
  const targetPath = path.join(uploadRoot, storedName);
  await fs.writeFile(targetPath, buffer);

  const transcriptFilePath = params.transcriptFile
    ? await writeSupportFile(params.transcriptFile, `${params.title || params.file.name}-transcript`)
    : null;

  const record = await prisma.localVideo.create({
    data: {
      title: normalizeTitle(params.title, params.file.name),
      originalUrlOrPath: targetPath,
      durationSeconds: await probeVideoDuration(targetPath),
      sourceType: "upload",
      status: "ingested",
      notes:
        "Upload disalin ke storage lokal Reclipa. Subtitle sidecar atau transcript manual bisa dipakai untuk analisis Cerebras.",
    },
  });

  await processVideoRecord({
    record,
    transcriptText: params.transcriptText,
    transcriptFilePath,
  });
  return record;
}

async function renderSelectedClip(clipId: string, subtitleStyle: SubtitlePreset) {
  await ensureWorkspaceDirectories();

  const clip = (await prisma.clipResult.findUnique({
    where: { id: clipId },
    include: {
      localVideo: true,
    },
  })) as ClipWithVideoRow | null;

  if (!clip) {
    throw new Error("Clip tidak ditemukan.");
  }

  await prisma.clipResult.updateMany({
    where: {
      localVideoId: clip.localVideoId,
    },
    data: {
      isSelected: false,
    },
  });

  const sourcePath = clip.localVideo.originalUrlOrPath;
  const sourceExists = await fileExists(sourcePath);
  const ffmpegReady = await hasBinary("ffmpeg");
  const transcript = clip.transcriptJson
    ? (JSON.parse(clip.transcriptJson) as {
        words?: TranscriptWord[];
      })
    : null;

  let nextStatus = "ready";
  let outputPath: string | null = null;

  if (sourceExists && ffmpegReady && transcript?.words?.length) {
    const clipSlug = slugify(`${clip.localVideo.title}-${clip.hookTitle}`) || randomUUID();
    const subtitlePath = path.join(tempRoot, `${clipSlug}.srt`);
    const targetPath = path.join(outputRoot, `${clipSlug}.mp4`);

    const trimmedWords = transcript.words
      .filter((word) => word.end >= clip.startTime && word.start <= clip.endTime)
      .map((word) => ({
        ...word,
        start: toSeconds(Math.max(0, word.start - clip.startTime)),
        end: toSeconds(Math.max(0.1, word.end - clip.startTime)),
      }));

    await fs.writeFile(subtitlePath, buildSrtContent(trimmedWords, subtitleStyle), "utf8");

    try {
      const duration = toSeconds(clip.endTime - clip.startTime);
      // ADDING CROP 9:16 BEHIND SUBTITLES FOR PORTRAIT OUTPUT
      const subtitleFilter = `crop=ih*9/16:ih,subtitles=filename='${escapeSubtitlePath(subtitlePath)}':force_style='${subtitlePresetStyle(subtitleStyle)}'`;

      const burnResult = await runCommand(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(clip.startTime),
          "-i",
          sourcePath,
          "-t",
          String(duration),
          "-vf",
          subtitleFilter,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          targetPath,
        ],
        240000,
      );

      if (burnResult.code === 0 && (await fileExists(targetPath))) {
        nextStatus = "rendered";
        outputPath = targetPath;
      }
    } catch {
      nextStatus = "ready";
    }
  }

  return prisma.clipResult.update({
    where: { id: clipId },
    data: {
      isSelected: true,
      subtitleFormat: subtitleStyle,
      status: nextStatus,
      localFilePath: outputPath,
    },
  });
}

export async function getSystemReadiness(): Promise<ReadinessItem[]> {
  const [ffmpegReady, ffprobeReady, ytdlpReady] = await Promise.all([
    hasBinary("ffmpeg"),
    hasBinary("ffprobe"),
    hasBinary("yt-dlp"),
  ]);

  return [
    {
      id: "sqlite",
      label: "SQLite history",
      value: "online",
      description: "Semua run dan kandidat clip disimpan ke database lokal Prisma/SQLite.",
      ready: true,
    },
    {
      id: "transcript",
      label: "Transcript source",
      value: ytdlpReady ? "captions + manual" : "manual-first",
      description:
        "Reclipa memakai caption URL yang sudah ada, sidecar SRT/VTT/TXT, atau transcript paste manual.",
      ready: true,
    },
    {
      id: "ytdlp",
      label: "yt-dlp downloader",
      value: ytdlpReady ? "installed" : "optional",
      description: ytdlpReady
        ? "URL YouTube/TikTok bisa ditarik lengkap beserta subtitle bila tersedia."
        : "URL tetap diterima, tetapi caption otomatis URL hanya aktif jika yt-dlp terpasang.",
      ready: ytdlpReady,
    },
    {
      id: "ffmpeg",
      label: "FFmpeg render",
      value: ffmpegReady && ffprobeReady ? "installed" : "fallback",
      description:
        ffmpegReady && ffprobeReady
          ? "Potong video, cek durasi, dan burn subtitle langsung dari mesin lokal."
          : "Hook tetap bisa dipilih, tetapi output MP4 baru tersedia setelah FFmpeg aktif.",
      ready: ffmpegReady && ffprobeReady,
    },
    {
      id: "cerebras",
      label: "Cerebras analysis",
      value: process.env.CEREBRAS_API_KEY ? "connected" : "heuristic",
      description: process.env.CEREBRAS_API_KEY
        ? "Cerebras menganalisis transcript untuk menentukan hook, skor, dan angle clip."
        : "Jika key belum diisi, aplikasi turun ke heuristik lokal untuk scoring hook.",
      ready: Boolean(process.env.CEREBRAS_API_KEY),
    },
  ];
}

export async function getStorageMetrics(): Promise<StorageMetric[]> {
  await ensureWorkspaceDirectories();

  const [uploads, output, temp] = await Promise.all([
    inspectDirectory(uploadRoot),
    inspectDirectory(outputRoot),
    inspectDirectory(tempRoot),
  ]);

  return [
    {
      id: "uploads",
      label: "Upload cache",
      value: `${uploads.files} file`,
      detail:
        uploads.bytes > 0
          ? `${uploads.bytes} bytes video sumber tersimpan di workspace.`
          : "Belum ada video upload yang disalin ke workspace.",
    },
    {
      id: "output",
      label: "Rendered output",
      value: `${output.files} file`,
      detail:
        output.bytes > 0
          ? `${output.bytes} bytes output siap diambil dari folder render.`
          : "Belum ada hasil MP4 final di folder output.",
    },
    {
      id: "temp",
      label: "Temp workspace",
      value: `${temp.files} file`,
      detail:
        temp.bytes > 0
          ? `${temp.bytes} bytes file bantu subtitle dan transcript.`
          : "Folder temp sedang bersih.",
    },
  ];
}

export async function handleIntakeFromJson(payload: {
  sourceType: "url" | "local";
  title?: string;
  url?: string;
  localPath?: string;
  transcriptText?: string;
  transcriptFile?: File;
}) {
  if (payload.sourceType === "url") {
    return ingestUrl({
      url: payload.url ?? "",
      title: payload.title,
      transcriptText: payload.transcriptText,
      transcriptFile: payload.transcriptFile,
    });
  }

  return ingestLocalPath({
    localPath: payload.localPath ?? "",
    title: payload.title,
    transcriptText: payload.transcriptText,
    transcriptFile: payload.transcriptFile,
  });
}

export async function handleUploadIntake(params: {
  file: File;
  title?: string;
  transcriptText?: string;
  transcriptFile?: File;
}) {
  return ingestUpload(params);
}

export async function handleSelectClip(params: {
  clipId: string;
  subtitleStyle: SubtitlePreset;
}) {
  return renderSelectedClip(params.clipId, params.subtitleStyle);
}

export async function canServeClipAsset(targetPath: string | null) {
  if (!targetPath) {
    return false;
  }

  const normalized = path.resolve(targetPath);
  return normalized.startsWith(path.resolve(outputRoot)) && (await fileExists(normalized));
}

export async function testCerebrasConnection() {
  if (!process.env.CEREBRAS_API_KEY) {
    throw new Error("CEREBRAS_API_KEY belum diisi.");
  }

  const preferredModel = process.env.CEREBRAS_MODEL || "llama3.1-8b";
  const candidateModels = [
    preferredModel,
    ...cerebrasFallbackModels.filter((model) => model !== preferredModel),
  ];
  let lastError = "Unknown Cerebras error.";

  for (const model of candidateModels) {
    try {
      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_completion_tokens: 80,
          messages: [
            {
              role: "system",
              content: "Return a one-line confirmation that the API key and model are working.",
            },
            {
              role: "user",
              content: "Say 'Reclipa Cerebras connection OK' and mention the active model.",
            },
          ],
        }),
      });

      if (!response.ok) {
        lastError = `Cerebras error ${response.status}: ${await response.text()}`;
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        model?: string;
      };

      return {
        ok: true,
        model: payload.model ?? model,
        message: `Reclipa Cerebras connection OK on ${payload.model ?? model}.`,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown Cerebras error.";
    }
  }

  throw new Error(lastError);
}

export async function openOutputFolder() {
  await ensureWorkspaceDirectories();

  const targetPath = outputRoot;
  const resolved = path.resolve(targetPath);

  if (process.platform === "win32") {
    await runCommand("explorer.exe", [resolved], 10000);
    return { opened: true, path: resolved };
  }

  if (process.platform === "darwin") {
    await runCommand("open", [resolved], 10000);
    return { opened: true, path: resolved };
  }

  await runCommand("xdg-open", [resolved], 10000);
  return { opened: true, path: resolved };
}

export async function cleanWorkspaceTemp() {
  await ensureWorkspaceDirectories();
  const deleted = await clearTempWorkspace(tempRoot);

  return {
    ok: true,
    path: tempRoot,
    deletedFiles: deleted.files,
    freedBytes: deleted.bytes,
    message:
      deleted.files > 0
        ? `Temp workspace dibersihkan (${deleted.files} file bantu).`
        : "Folder temp sudah bersih.",
  };
}
