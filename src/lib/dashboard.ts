import { type ClipWithVideoRow, prisma } from "@/lib/prisma";
import { formatBytes, formatDateTime } from "@/lib/formatters";
import { getStorageMetrics, getSystemReadiness } from "@/lib/pipeline";
import type {
  ClipCardView,
  DashboardData,
  HistoryRow,
  ResearchReference,
  SummaryMetric,
  SystemAction,
} from "@/lib/types";

const researchReferences: ResearchReference[] = [
  {
    area: "Design language",
    title: "Paper - design, share, ship",
    takeaway:
      "Dipakai sebagai inspirasi visual: editorial layout, whitespace besar, border tegas, dan hierarchy yang fokus pada alur kerja inti.",
    link: "https://paper.design/",
  },
  {
    area: "Highlight detection",
    title: "Unsupervised Modality-Transferable Video Highlight Detection With Natural Language Queries",
    takeaway:
      "Menguatkan pendekatan memilih highlight dari representasi semantik teks, bukan hanya dari sinyal visual mentah.",
    link: "https://arxiv.org/abs/2402.18217",
  },
  {
    area: "Subtitle readability",
    title: "Readability of Punctuation in Automatic Subtitles",
    takeaway:
      "Mendorong subtitle yang ringkas, berpola, dan mudah dibaca cepat; itu sebabnya UI ini menyiapkan mode word-by-word dan short-sentence.",
    link: "https://par.nsf.gov/servlets/purl/10209507",
  },
];

const systemActions: SystemAction[] = [
  {
    id: "test-cerebras",
    label: "Test Cerebras",
    description: "Kirim ping kecil ke Cerebras untuk memastikan key dan model bisa dipakai.",
    endpoint: "/api/system/test-cerebras",
    method: "POST",
  },
  {
    id: "open-output",
    label: "Open Output Folder",
    description: "Buka folder hasil render lokal agar clip bisa langsung diambil atau dicek.",
    endpoint: "/api/system/open-output",
    method: "POST",
  },
  {
    id: "clean-workspace",
    label: "Clean Temp Workspace",
    description: "Hapus file bantu sementara di storage/temp agar workspace tetap ringan.",
    endpoint: "/api/system/clean-workspace",
    method: "POST",
  },
];

function transcriptMeta(transcriptJson: string | null) {
  if (!transcriptJson) {
    return {
      preview: "Transcript preview belum tersedia.",
      source: null,
    } as const;
  }

  try {
    const parsed = JSON.parse(transcriptJson) as {
      transcriptPreview?: string;
      transcript?: string;
      source?: ClipCardView["transcriptSource"];
    };
    let preview = parsed.transcriptPreview ?? parsed.transcript ?? "";
    
    if (typeof preview === "object" && preview !== null) {
      preview = (preview as any).text || JSON.stringify(preview);
    }
    
    if (typeof preview !== "string") {
      preview = String(preview);
    }

    return {
      preview: preview.length > 170 ? `${preview.slice(0, 167)}...` : preview,
      source: parsed.source ?? null,
    } as const;
  } catch {
    return {
      preview: "Transcript preview belum tersedia.",
      source: null,
    } as const;
  }
}

function safeString(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") return val.text || val.title || JSON.stringify(val);
  return String(val);
}

function mapClip(record: ClipWithVideoRow): ClipCardView {
  const transcript = transcriptMeta(record.transcriptJson);

  return {
    id: record.id,
    hookTitle: safeString(record.hookTitle),
    hookReason: record.hookReason ? safeString(record.hookReason) : null,
    startTime: Number(record.startTime) || 0,
    endTime: Number(record.endTime) || 0,
    status: record.status,
    score: record.score,
    isSelected: record.isSelected,
    transcriptPreview: safeString(transcript.preview),
    transcriptSource: transcript.source,
    createdAt: record.createdAt.toISOString(),
    createdAtLabel: formatDateTime(record.createdAt.toISOString()),
    localFilePath: record.localFilePath,
    subtitleFormat: record.subtitleFormat,
    video: {
      id: record.localVideo.id,
      title: safeString(record.localVideo.title),
      sourceType: record.localVideo.sourceType,
      originalUrlOrPath: record.localVideo.originalUrlOrPath,
      durationSeconds: record.localVideo.durationSeconds,
      notes: record.localVideo.notes,
      createdAt: record.localVideo.createdAt.toISOString(),
    },
  };
}

function buildSummary(params: {
  totalVideos: number;
  totalDrafts: number;
  totalRendered: number;
  selectedClips: number;
}): SummaryMetric[] {
  return [
    {
      label: "Runs tersimpan",
      value: String(params.totalVideos).padStart(2, "0"),
      detail: "Sumber video yang sudah pernah masuk ke workstation lokal.",
    },
    {
      label: "Hook aktif",
      value: String(params.totalDrafts).padStart(2, "0"),
      detail: "Kandidat hook yang siap dipilih atau diperhalus lagi.",
    },
    {
      label: "Output dirender",
      value: String(params.totalRendered).padStart(2, "0"),
      detail: "Clip yang sudah memiliki file output MP4 dari pipeline lokal.",
    },
    {
      label: "Pilihan terkunci",
      value: String(params.selectedClips).padStart(2, "0"),
      detail: "Clip yang sedang dianggap paling layak untuk diekspor sekarang.",
    },
  ];
}

export async function getDashboardData(): Promise<DashboardData> {
  const [
    totalVideos,
    totalDrafts,
    totalRendered,
    selectedClips,
    recommendationsRaw,
    historyRaw,
    readiness,
    storage,
  ] = await Promise.all([
    prisma.localVideo.count(),
    prisma.clipResult.count({
      where: {
        status: {
          in: ["draft", "ready", "rendered"],
        },
      },
    }),
    prisma.clipResult.count({
      where: {
        status: "rendered",
      },
    }),
    prisma.clipResult.count({
      where: {
        isSelected: true,
      },
    }),
    prisma.clipResult.findMany({
      include: {
        localVideo: true,
      },
      orderBy: [{ isSelected: "desc" }, { score: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
    prisma.clipResult.findMany({
      where: {
        status: "rendered",
      },
      include: {
        localVideo: true,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 4,
    }),
    getSystemReadiness(),
    getStorageMetrics(),
  ]);

  const summary = buildSummary({
    totalVideos,
    totalDrafts,
    totalRendered,
    selectedClips,
  });

  const recommendations = (recommendationsRaw as ClipWithVideoRow[]).map(mapClip);
  const history: HistoryRow[] = (historyRaw as ClipWithVideoRow[]).map((clip) => ({
    ...mapClip(clip),
    assetUrl: clip.localFilePath ? `/api/clips/${clip.id}/asset` : null,
  }));

  return {
    summary,
    recommendations,
    history,
    readiness,
    storage: storage.map((item) => {
      const bytesMatch = item.detail.match(/^(\d+)\sbytes\s/);
      if (!bytesMatch) {
        return item;
      }

      return {
        ...item,
        detail: item.detail.replace(
          `${bytesMatch[1]} bytes`,
          formatBytes(Number(bytesMatch[1])),
        ),
      };
    }),
    references: researchReferences,
    actions: systemActions,
  };
}
