import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { handleIntakeFromJson, handleUploadIntake } from "@/lib/pipeline";
import { intakeJsonSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const maybeFile = formData.get("file");
      const maybeTranscriptFile = formData.get("transcriptFile");
      const sourceType = String(formData.get("sourceType") ?? "upload");
      const title = String(formData.get("title") ?? "");
      const url = String(formData.get("url") ?? "");
      const localPath = String(formData.get("localPath") ?? "");
      const transcriptText = String(formData.get("transcriptText") ?? "");

      let record;

      if (maybeFile instanceof File) {
        record = await handleUploadIntake({
          file: maybeFile,
          title,
          transcriptText,
          transcriptFile: maybeTranscriptFile instanceof File ? maybeTranscriptFile : undefined,
        });
      } else if (sourceType === "url" || sourceType === "local") {
        record = await handleIntakeFromJson({
          sourceType,
          title,
          url,
          localPath,
          transcriptText,
          transcriptFile: maybeTranscriptFile instanceof File ? maybeTranscriptFile : undefined,
        });
      } else {
        return NextResponse.json({ error: "File upload tidak valid." }, { status: 400 });
      }

      revalidatePath("/");
      return NextResponse.json({ ok: true, record });
    }

    const payload = intakeJsonSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message ?? "Payload tidak valid." },
        { status: 400 },
      );
    }

    const record = await handleIntakeFromJson(payload.data);
    revalidatePath("/");
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gagal memproses source.",
      },
      { status: 500 },
    );
  }
}
