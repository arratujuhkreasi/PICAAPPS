Product Requirements Document (PRD)
Project Name: Reclipa (AI-Powered Content Clipping Automation)
Target Platform: Local Web Application (Berjalan di PC/Localhost)
Tech Stack: Next.js, React.js, Tailwind CSS, Node.js, SQLite (Lokal), Local FFmpeg, Cerebras API
1. Overview
Reclipa adalah aplikasi web internal berbasis lokal (tanpa sistem login dan biaya server) yang dirancang khusus untuk mengotomatisasi alur kerja seorang content clipper. Aplikasi ini berjalan sepenuhnya di PC pengguna, memanfaatkan resource komputer lokal untuk memproses video panjang, menggunakan AI Cerebras yang super cepat untuk mencari "hook" paling viral, memotongnya menjadi video berdurasi maksimal 1 menit, dan menambahkan subtitle yang akurat. Hasil akhir langsung tersimpan di hard drive lokal siap untuk diunggah ke YouTube Shorts dan TikTok.
2. Requirements
Kebutuhan Pengguna (User Needs):
Menghemat waktu editing manual dan pencarian momen menarik dari video berdurasi panjang tanpa biaya langganan aplikasi.
Memastikan konten yang dihasilkan memiliki potensi viral tinggi berdasarkan analisis teks/konteks menggunakan LLM berkecepatan tinggi.
Membutuhkan antarmuka yang sangat bersih, minimalis, dan cepat (terinspirasi dari paper.design).
Kebutuhan Sistem (System Requirements):
Sistem berjalan di localhost (PC pengguna) tanpa batasan timeout proses.
Sistem menerima input berupa Link URL (YouTube/TikTok) atau File Upload (MP4/MOV) dari komputer lokal.
Eksekusi FFmpeg secara lokal untuk mengunduh, mengekstrak audio, memotong (trim) video, dan render hardcode subtitle.
AI Agent (Cerebras) mampu menganalisis transkrip dan menentukan timestamp (mulai & selesai) untuk hook berdurasi < 60 detik.
Database ringan berjalan di lokal (SQLite) untuk menyimpan riwayat tanpa perlu koneksi database eksternal.
3. Core Features
Source Ingestion:
Input URL YouTube / TikTok untuk di-download otomatis menggunakan script lokal (misal: yt-dlp).
Fitur pilih file lokal (Drag & Drop) untuk memproses video yang sudah ada di PC.
AI Viral Hook Finder:
Ekstraksi audio dan konversi ke teks (Speech-to-Text) menggunakan model gratis (bisa Groq API atau Whisper Lokal).
Prompting ke Cerebras API untuk menganalisis teks dengan kecepatan kilat dan mencari momen paling emosional, kontroversial, atau menarik (hook).
Automated Video Editor (1-Minute Clipper):
Memotong video secara presisi berdasarkan timestamp yang diberikan AI menggunakan resource PC (Local FFmpeg).
Smart Subtitling Engine:
Membuat subtitle per kata (word-by-word) atau per kalimat pendek yang akurat.
Burn-in (menempelkan) subtitle ke dalam video dengan gaya font tebal ala konten Shorts.
Export & Local Storage:
Membuka folder output secara otomatis atau menyediakan tombol untuk menyimpan/memutar langsung hasil akhir (.mp4) dari disk lokal.
4. User Flow
Berikut adalah alur kerja pengguna dari saat membuka localhost hingga mendapatkan video jadi:
graph TD
    A[Buka Reclipa di Localhost] --> B{Pilih Sumber Video}
    B -->|Paste URL| C[yt-dlp Download Video & Audio ke PC]
    B -->|Pilih File Lokal| D[Sistem Membaca Path File]
    C --> E[FFmpeg: Ekstraksi Audio]
    D --> E
    E --> F[AI: Speech-to-Text Transkripsi]
    F --> G[Cerebras API: Analisis Hook Viral & Timestamp]
    G --> H[Tampilkan Rekomendasi Hook di UI]
    H --> I{User Konfirmasi?}
    I -->|Edit/Pilih Lain| G
    I -->|Setuju| J[Local FFmpeg: Potong Video < 60 detik]
    J --> K[Local FFmpeg: Generate & Burn Subtitle]
    K --> L[Video Tersimpan di Folder PC]
    L --> M[Preview Video di Browser]


5. Architecture
Sistem dirancang sebagai Local-first Web App. Next.js menangani antarmuka (UI) dan bertindak sebagai server lokal yang memanggil binary di OS Anda (seperti FFmpeg dan yt-dlp).
graph TD
    subgraph Local PC Environment
        subgraph Next.js Local Server
            UI[Paper.design UI - React]
            API[Next.js API Routes]
        end

        subgraph Local OS Binaries
            YTDLP[yt-dlp / Downloader]
            FFMPEG[FFmpeg Engine]
        end

        subgraph Local Database
            DB[(SQLite - Prisma/Better-SQLite3)]
        end
    end

    subgraph External APIs (100% Free)
        STT[Groq Whisper API]
        LLM[Cerebras API - Llama 3 / Mistral]
    end

    UI -->|Request| API
    API -->|Download URL| YTDLP
    YTDLP -->|Simpan MP4| FFMPEG
    API -->|Kirim Audio| STT
    STT -->|Transkrip| LLM
    LLM -->|Timestamp & Hook| API
    API -->|Execute Trim & Subtitle| FFMPEG
    FFMPEG -->|Video Final| DB
    API -->|Simpan History| DB


6. Design & Technical Constraints
Design Guidelines (Paper.design style):
Warna: Background putih bersih (#FFFFFF atau #FAFAFA), teks abu-abu gelap/hitam (#111111), aksen minimalis (hitam tebal).
Tipografi: Menggunakan font Serif modern atau Sans-serif yang sangat bersih.
Elemen: UI tanpa embel-embel, fokus pada input dan hasil. Tombol terlihat flat dengan garis tegas.
Technology Stack & Zero-Cost Strategy:
Frontend/Backend: Next.js (App Router), berjalan dengan perintah npm run dev atau npm run start di PC Anda.
Database: SQLite. Tidak perlu cloud database (Supabase/Turso). Cukup gunakan file lokal database.sqlite menggunakan ORM seperti Prisma agar pengaturan lebih instan.
AI Hook Finder: Cerebras API. Memanfaatkan kecepatan inferensi tinggi untuk membaca ribuan kata transkrip dalam hitungan detik.
AI Transkripsi: Menggunakan Groq API (Whisper) karena free tier-nya sangat cepat dan tidak membebani RAM/GPU komputer lokal Anda.
Video Processing: FFmpeg & yt-dlp wajib terinstal di PC (environment variables OS). fluent-ffmpeg pada Node.js akan mengeksekusi perintah tanpa khawatir masalah timeout.
Deployment: Tidak diperlukan (Localhost). Jika ingin dijalankan dengan mudah, nantinya bisa dibungkus menggunakan Docker atau skrip .bat/.sh sederhana untuk start server.
7. Entity Relationship Diagram (ERD)
Database SQLite akan menyimpan history lokal agar Anda bisa melacak video mana saja yang sudah pernah dijadikan Shorts/TikTok.
erDiagram
    LOCAL_VIDEO {
        string id PK
        string original_url_or_path
        string title
        int duration_seconds
        datetime created_at
    }

    CLIP_RESULT {
        string id PK
        string local_video_id FK
        string hook_title
        string transcript_json
        float start_time
        float end_time
        string local_file_path
        string status "processing/done/failed"
        datetime created_at
    }

    LOCAL_VIDEO ||--o{ CLIP_RESULT : "generates"



8. Development Phases
Phase 1: Local Environment Setup (Minggu 1)
Setup project Next.js dan Tailwind CSS.
Install dan konfigurasi SQLite lokal (misal dengan Prisma ORM).
Memastikan FFmpeg dan yt-dlp terinstal dan dapat diakses via Terminal PC Anda.
Phase 2: UI & Download Manager (Minggu 2)
Membangun desain antarmuka paper.design.
Membuat fungsi Next.js API untuk memanggil yt-dlp agar bisa mengunduh video dari URL dan menyimpannya di folder proyek (misal: /public/temp_videos).
Phase 3: Cerebras Brain & STT Integration (Minggu 3)
Integrasi Groq API (Whisper) untuk transkripsi audio ke teks beserta timestamp per kata.
Integrasi Cerebras API (menggunakan library OpenAI SDK yang diubah base URL-nya ke Cerebras) untuk menentukan hook viral.
Phase 4: Local Video Processing Engine (Minggu 4)
Membuat fungsi fluent-ffmpeg di Node.js untuk memotong video berdasarkan timestamp.
Melakukan burn-in subtitle ke video menggunakan FFmpeg lokal (menyusun file .srt atau .ass secara dinamis dan melakukan render).
Phase 5: Local Optimization & Scripting (Minggu 5)
Membuat script start.bat (Windows) atau start.sh (Mac/Linux) agar Anda bisa menjalankan aplikasi web ini hanya dengan satu kali klik.
Membersihkan (clean-up) file temporary agffmgear hard drive Anda tidak penuh oleh video mentahan.
