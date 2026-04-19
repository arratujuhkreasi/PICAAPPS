import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canServeClipAsset } from "@/lib/pipeline";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clip = await prisma.clipResult.findUnique({
    where: { id },
  });

  if (!clip?.localFilePath || !(await canServeClipAsset(clip.localFilePath))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stat = await fs.stat(clip.localFilePath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const stream = createReadStream(clip.localFilePath, { start, end });

    // Node.js readable streams can be wrapped in a web ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: any) => controller.enqueue(new Uint8Array(chunk)));
        stream.on("end", () => controller.close());
        stream.on("error", (err: Error) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(readableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize.toString(),
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${path.basename(clip.localFilePath)}"`,
      },
    });
  } else {
    // If no range request, return full file as simple stream to avoid memory bloat
    const stream = createReadStream(clip.localFilePath);
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: any) => controller.enqueue(new Uint8Array(chunk)));
        stream.on("end", () => controller.close());
        stream.on("error", (err: Error) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(readableStream, {
      status: 200,
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${path.basename(clip.localFilePath)}"`,
      },
    });
  }
}
