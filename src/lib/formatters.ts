export function formatDurationRange(startTime: number, endTime: number) {
  function format(value: number) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${format(startTime)} - ${format(endTime)}`;
}

export function formatBytes(value: number) {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function formatSourceType(value: string) {
  switch (value) {
    case "url":
      return "URL";
    case "upload":
      return "Upload";
    case "local":
      return "Path lokal";
    case "demo":
      return "Demo";
    default:
      return value;
  }
}

export function formatTranscriptSource(value: "captions" | "manual" | "mock" | null) {
  switch (value) {
    case "captions":
      return "Caption source";
    case "manual":
      return "Manual transcript";
    case "mock":
      return "Fallback draft";
    default:
      return "Transcript belum ada";
  }
}

export function formatSubtitlePreset(value: string | null) {
  switch (value) {
    case "punch":
      return "Punch";
    case "clean":
      return "Clean";
    case "word":
      return "Word";
    case "sentence":
      return "Sentence";
    default:
      return "Belum dipilih";
  }
}
