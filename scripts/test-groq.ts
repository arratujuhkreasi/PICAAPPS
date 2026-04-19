import path from "path";
import { config } from "dotenv";
config();

import { fileURLToPath } from "url";
import { dirname } from "path";
import { spawn } from "child_process";
import fs from "fs/promises";
import { randomUUID } from "crypto";

const tempRoot = path.join(process.cwd(), "storage/temp");

async function hasBinary(binary: string) { return true; }

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(executable: string, args: string[], timeoutMs = 120000) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(async (resolve, reject) => {
    let commandToRun = executable;
    const isWindows = process.platform === "win32";
    const localBinaryPath = isWindows ? path.join(process.cwd(), `${executable}.exe`) : path.join(process.cwd(), executable);
    
    try {
        await fs.access(localBinaryPath);
        commandToRun = localBinaryPath;
    } catch {}

    const child = spawn(commandToRun, args, {
      cwd: process.cwd(),
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function extractAudioFromVideo(videoPath: string): Promise<string | null> {
  const ffmpegReady = await hasBinary("ffmpeg");
  if (!ffmpegReady) return null;

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
      return audioPath;
    } else {
        console.error("FFMPEG failed:", result.stderr);
    }
  } catch(e) {
      console.error("FFMPEG crash:", e);
  }
  return null;
}

interface GroqVerboseJson {
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

async function transcribeWithGroq(audioPath: string) {
  console.log("Transcribing with GROQ key format:", process.env.GROQ_API_KEY?.substring(0, 10));
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
    return payload;
  } catch (error) {
    console.error("Transcribe groq error", error);
    return null;
  }
}

async function runTest() {
  const videosDir = path.join(process.cwd(), "storage/uploads");
  const files = await fs.readdir(videosDir);
  const videoFile = files.find(f => f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mkv"));
  
  if (!videoFile) {
      console.log("No video files found in storage/upload to test.");
      return;
  }
  
  const videoPath = path.join(videosDir, videoFile);
  console.log("Testing with video:", videoPath);
  
  const audioPath = await extractAudioFromVideo(videoPath);
  if (!audioPath) {
      console.error("Failed to extract audio.");
      return;
  }
  
  console.log("Audio extracted properly to:", audioPath);
  const groqRes = await transcribeWithGroq(audioPath);
  if (groqRes) {
      console.log("Groq RESPONSE KEYS:", Object.keys(groqRes));
      console.log("Groq TEXT:", groqRes.text);
      if (groqRes.words) {
         console.log("WORDS length:", groqRes.words.length);
      }
      if ((groqRes as any).segments) {
         console.log("SEGMENTS length:", (groqRes as any).segments.length);
      }
  }
}

runTest();
