# Reclipa

Reclipa adalah local-first web app untuk content clipping automation. Aplikasi ini memadukan:

- Next.js App Router untuk UI dan route handler lokal
- Prisma + SQLite untuk history run
- yt-dlp / FFmpeg lokal bila tersedia
- Cerebras untuk analisis hook berbasis transcript
- Caption-first workflow: subtitle URL, sidecar `.srt/.vtt/.txt`, atau transcript paste manual
- Fallback heuristik agar dashboard tetap usable meski binary atau API key belum terpasang

## Menjalankan project

```bash
npm install
npm run db:push
npm run dev
```

Jika PowerShell memblokir shim `.ps1`, pakai:

```bash
npm.cmd run db:push
npm.cmd run dev
```

Lalu buka `http://localhost:3000`.

## Environment

Salin `.env.example` menjadi `.env`, lalu isi bila ingin mengaktifkan integrasi cloud:

```bash
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=llama3.1-8b
```

Tanpa key pun app tetap jalan dalam mode heuristik lokal.

## Local tools opsional

Untuk workflow penuh sesuai PRD, siapkan:

- `yt-dlp`
- `ffmpeg`
- `ffprobe`

Jika belum tersedia, Reclipa tetap bisa:

- menerima URL / upload / path lokal
- memakai transcript manual atau sidecar subtitle
- menghasilkan kandidat hook
- menyimpan run ke SQLite

## Struktur utama

- `src/app/page.tsx` dashboard editorial utama
- `src/app/api/*` route handler intake, demo, select clip, dan asset preview
- `src/lib/pipeline.ts` service layer untuk ingest, transcript resolution, hook analysis, dan render
- `src/lib/transcript-utils.ts` parser subtitle dan transcript manual
- `prisma/schema.prisma` model `LocalVideo` dan `ClipResult`
- `storage/` folder kerja lokal untuk upload, temp subtitle, dan output render
