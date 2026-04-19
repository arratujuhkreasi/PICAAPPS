import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { projectRoot } from "@/lib/paths";

export interface LocalVideoRow {
  id: string;
  originalUrlOrPath: string;
  title: string;
  durationSeconds: number | null;
  sourceType: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClipResultRow {
  id: string;
  localVideoId: string;
  hookTitle: string;
  hookReason: string | null;
  transcriptJson: string | null;
  subtitleFormat: string | null;
  startTime: number;
  endTime: number;
  localFilePath: string | null;
  status: string;
  score: number | null;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClipWithVideoRow extends ClipResultRow {
  localVideo: LocalVideoRow;
}

function resolveDatabasePath() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (raw.startsWith("file:")) {
    return path.resolve(projectRoot, raw.slice(5));
  }

  return path.resolve(projectRoot, raw);
}

const databasePath = resolveDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.exec(`
  CREATE TABLE IF NOT EXISTS local_video (
    id TEXT PRIMARY KEY,
    original_url_or_path TEXT NOT NULL,
    title TEXT NOT NULL,
    duration_seconds INTEGER,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ingested',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clip_result (
    id TEXT PRIMARY KEY,
    local_video_id TEXT NOT NULL,
    hook_title TEXT NOT NULL,
    hook_reason TEXT,
    transcript_json TEXT,
    subtitle_format TEXT,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    local_file_path TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    score REAL,
    is_selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(local_video_id) REFERENCES local_video(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_clip_result_local_video_created_at
    ON clip_result(local_video_id, created_at);
`);

function nowIso() {
  return new Date().toISOString();
}

function mapLocalVideo(row: Record<string, unknown>): LocalVideoRow {
  return {
    id: String(row.id),
    originalUrlOrPath: String(row.original_url_or_path),
    title: String(row.title),
    durationSeconds:
      row.duration_seconds === null || row.duration_seconds === undefined
        ? null
        : Number(row.duration_seconds),
    sourceType: String(row.source_type),
    status: String(row.status),
    notes: row.notes ? String(row.notes) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapClip(row: Record<string, unknown>): ClipResultRow {
  return {
    id: String(row.id),
    localVideoId: String(row.local_video_id),
    hookTitle: String(row.hook_title),
    hookReason: row.hook_reason ? String(row.hook_reason) : null,
    transcriptJson: row.transcript_json ? String(row.transcript_json) : null,
    subtitleFormat: row.subtitle_format ? String(row.subtitle_format) : null,
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    localFilePath: row.local_file_path ? String(row.local_file_path) : null,
    status: String(row.status),
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    isSelected: Boolean(row.is_selected),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapClipWithVideo(row: Record<string, unknown>): ClipWithVideoRow {
  return {
    ...mapClip(row),
    localVideo: {
      id: String(row.video_id),
      originalUrlOrPath: String(row.video_original_url_or_path),
      title: String(row.video_title),
      durationSeconds:
        row.video_duration_seconds === null || row.video_duration_seconds === undefined
          ? null
          : Number(row.video_duration_seconds),
      sourceType: String(row.video_source_type),
      status: String(row.video_status),
      notes: row.video_notes ? String(row.video_notes) : null,
      createdAt: new Date(String(row.video_created_at)),
      updatedAt: new Date(String(row.video_updated_at)),
    },
  };
}

function buildWhereClause(where?: Record<string, unknown>, prefix: string = "") {
  if (!where) {
    return { clause: "", params: [] as unknown[] };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  const p = prefix ? `${prefix}.` : "";

  if (typeof where.localVideoId === "string") {
    conditions.push(`${p}local_video_id = ?`);
    params.push(where.localVideoId);
  }

  if (typeof where.status === "string") {
    conditions.push(`${p}status = ?`);
    params.push(where.status);
  }

  if (
    where.status &&
    typeof where.status === "object" &&
    Array.isArray((where.status as { in?: unknown[] }).in)
  ) {
    const values = (where.status as { in: unknown[] }).in;
    conditions.push(`${p}status IN (${values.map(() => "?").join(", ")})`);
    params.push(...values);
  }

  if (typeof where.isSelected === "boolean") {
    conditions.push(`${p}is_selected = ?`);
    params.push(where.isSelected ? 1 : 0);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildOrderClause(orderBy?: Array<Record<string, "asc" | "desc">>) {
  if (!orderBy?.length) {
    return "";
  }

  const mapping: Record<string, string> = {
    isSelected: "c.is_selected",
    score: "c.score",
    createdAt: "c.created_at",
    updatedAt: "c.updated_at",
  };

  const items = orderBy
    .flatMap((entry) =>
      Object.entries(entry).map(([field, direction]) => {
        const column = mapping[field];
        return column ? `${column} ${direction.toUpperCase()}` : null;
      }),
    )
    .filter(Boolean);

  return items.length > 0 ? `ORDER BY ${items.join(", ")}` : "";
}

export const prisma = {
  localVideo: {
    count() {
      const row = database.prepare("SELECT COUNT(*) as count FROM local_video").get() as {
        count: number;
      };
      return Promise.resolve(row.count);
    },
    deleteMany(args?: any) {
      database.prepare("DELETE FROM local_video").run();
      return Promise.resolve();
    },
    findMany() {
      const rows = database.prepare("SELECT * FROM local_video").all() as Array<Record<string, unknown>>;
      return Promise.resolve(rows.map(mapLocalVideo));
    },
    create({ data }: { data: Omit<LocalVideoRow, "id" | "createdAt" | "updatedAt"> }) {
      const id = randomUUID();
      const timestamp = nowIso();

      database
        .prepare(
          `INSERT INTO local_video (
            id, original_url_or_path, title, duration_seconds, source_type, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          data.originalUrlOrPath,
          data.title,
          data.durationSeconds,
          data.sourceType,
          data.status,
          data.notes,
          timestamp,
          timestamp,
        );

      const row = database.prepare("SELECT * FROM local_video WHERE id = ?").get(id) as Record<
        string,
        unknown
      >;
      return Promise.resolve(mapLocalVideo(row));
    },
  },
  clipResult: {
    count({ where }: { where?: Record<string, unknown> } = {}) {
      const { clause, params } = buildWhereClause(where);
      const row = database
        .prepare(`SELECT COUNT(*) as count FROM clip_result ${clause}`)
        .get(...params) as { count: number };
      return Promise.resolve(row.count);
    },
    deleteMany({ where }: { where?: Record<string, unknown> } = {}) {
      const { clause, params } = buildWhereClause(where);
      database.prepare(`DELETE FROM clip_result ${clause}`).run(...params);
      return Promise.resolve();
    },
    createMany({
      data,
    }: {
      data: Array<{
        localVideoId: string;
        hookTitle: string;
        hookReason?: string | null;
        transcriptJson?: string | null;
        subtitleFormat?: string | null;
        startTime: number;
        endTime: number;
        localFilePath?: string | null;
        status: string;
        score?: number | null;
        isSelected?: boolean;
      }>;
    }) {
      const insert = database.prepare(
        `INSERT INTO clip_result (
          id, local_video_id, hook_title, hook_reason, transcript_json, subtitle_format, start_time,
          end_time, local_file_path, status, score, is_selected, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const transaction = database.transaction((rows: typeof data) => {
        for (const row of rows) {
          const id = randomUUID();
          const timestamp = nowIso();
          insert.run(
            id,
            row.localVideoId,
            row.hookTitle,
            row.hookReason,
            row.transcriptJson,
            row.subtitleFormat,
            row.startTime,
            row.endTime,
            row.localFilePath,
            row.status,
            row.score,
            row.isSelected ? 1 : 0,
            timestamp,
            timestamp,
          );
        }
      });

      transaction(data);
      return Promise.resolve();
    },
    findUnique({
      where,
      include,
    }: {
      where: { id: string };
      include?: { localVideo?: boolean };
    }) {
      if (include?.localVideo) {
        const row = database
          .prepare(
            `SELECT
              c.*,
              v.id as video_id,
              v.original_url_or_path as video_original_url_or_path,
              v.title as video_title,
              v.duration_seconds as video_duration_seconds,
              v.source_type as video_source_type,
              v.status as video_status,
              v.notes as video_notes,
              v.created_at as video_created_at,
              v.updated_at as video_updated_at
            FROM clip_result c
            JOIN local_video v ON v.id = c.local_video_id
            WHERE c.id = ?`,
          )
          .get(where.id) as Record<string, unknown> | undefined;

        return Promise.resolve(row ? mapClipWithVideo(row) : null);
      }

      const row = database
        .prepare("SELECT * FROM clip_result WHERE id = ?")
        .get(where.id) as Record<string, unknown> | undefined;
      return Promise.resolve(row ? mapClip(row) : null);
    },
    updateMany({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Partial<ClipResultRow>;
    }) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (typeof data.isSelected === "boolean") {
        updates.push("is_selected = ?");
        params.push(data.isSelected ? 1 : 0);
      }

      if (typeof data.status === "string") {
        updates.push("status = ?");
        params.push(data.status);
      }

      updates.push("updated_at = ?");
      params.push(nowIso());

      const { clause, params: whereParams } = buildWhereClause(where);
      database
        .prepare(`UPDATE clip_result SET ${updates.join(", ")} ${clause}`)
        .run(...params, ...whereParams);
      return Promise.resolve();
    },
    update({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ClipResultRow>;
    }) {
      const updates: string[] = [];
      const params: unknown[] = [];

      const mappings: Array<[keyof ClipResultRow, string]> = [
        ["hookTitle", "hook_title"],
        ["hookReason", "hook_reason"],
        ["transcriptJson", "transcript_json"],
        ["subtitleFormat", "subtitle_format"],
        ["startTime", "start_time"],
        ["endTime", "end_time"],
        ["localFilePath", "local_file_path"],
        ["status", "status"],
        ["score", "score"],
      ];

      for (const [key, column] of mappings) {
        const value = data[key];
        if (value !== undefined) {
          updates.push(`${column} = ?`);
          params.push(value);
        }
      }

      if (typeof data.isSelected === "boolean") {
        updates.push("is_selected = ?");
        params.push(data.isSelected ? 1 : 0);
      }

      updates.push("updated_at = ?");
      params.push(nowIso());
      params.push(where.id);

      database
        .prepare(`UPDATE clip_result SET ${updates.join(", ")} WHERE id = ?`)
        .run(...params);

      const row = database.prepare("SELECT * FROM clip_result WHERE id = ?").get(where.id) as Record<
        string,
        unknown
      >;
      return Promise.resolve(mapClip(row));
    },
    findMany({
      where,
      include,
      orderBy,
      take,
    }: {
      where?: Record<string, unknown>;
      include?: { localVideo?: boolean };
      orderBy?: Array<Record<string, "asc" | "desc">>;
      take?: number;
    } = {}) {
      const { clause, params } = buildWhereClause(where, include?.localVideo ? "c" : "");
      const orderClause = buildOrderClause(orderBy);
      const limitClause = take ? `LIMIT ${take}` : "";

      if (include?.localVideo) {
        const rows = database
          .prepare(
            `SELECT
              c.*,
              v.id as video_id,
              v.original_url_or_path as video_original_url_or_path,
              v.title as video_title,
              v.duration_seconds as video_duration_seconds,
              v.source_type as video_source_type,
              v.status as video_status,
              v.notes as video_notes,
              v.created_at as video_created_at,
              v.updated_at as video_updated_at
            FROM clip_result c
            JOIN local_video v ON v.id = c.local_video_id
            ${clause}
            ${orderClause}
            ${limitClause}`,
          )
          .all(...params) as Array<Record<string, unknown>>;
        return Promise.resolve(rows.map(mapClipWithVideo));
      }

      const rows = database
        .prepare(`SELECT * FROM clip_result ${clause} ${orderClause} ${limitClause}`)
        .all(...params) as Array<Record<string, unknown>>;
      return Promise.resolve(rows.map(mapClip));
    },
  },
};
