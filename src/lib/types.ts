export interface SummaryMetric {
  label: string;
  value: string;
  detail: string;
}

export interface ReadinessItem {
  id: string;
  label: string;
  value: string;
  description: string;
  ready: boolean;
}

export interface StorageMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface ResearchReference {
  area: string;
  title: string;
  takeaway: string;
  link: string;
}

export interface ClipCardView {
  id: string;
  hookTitle: string;
  hookReason: string | null;
  startTime: number;
  endTime: number;
  status: string;
  score: number | null;
  isSelected: boolean;
  transcriptPreview: string;
  transcriptSource: TranscriptPayload["source"] | null;
  createdAt: string;
  createdAtLabel: string;
  localFilePath: string | null;
  subtitleFormat: string | null;
  video: {
    id: string;
    title: string;
    sourceType: string;
    originalUrlOrPath: string;
    durationSeconds: number | null;
    notes: string | null;
    createdAt: string;
  };
}

export interface HistoryRow extends ClipCardView {
  assetUrl: string | null;
}

export interface DashboardData {
  summary: SummaryMetric[];
  readiness: ReadinessItem[];
  storage: StorageMetric[];
  recommendations: ClipCardView[];
  history: HistoryRow[];
  references: ResearchReference[];
  actions: SystemAction[];
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptPayload {
  text: string;
  words: TranscriptWord[];
  language: string;
  source: "captions" | "manual" | "mock";
}

export interface HookCandidate {
  hookTitle: string;
  hookReason: string;
  startTime: number;
  endTime: number;
  score: number;
  transcriptPreview: string;
}

export interface SystemAction {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
}

export type SubtitlePreset = "punch" | "clean" | "word" | "sentence";
