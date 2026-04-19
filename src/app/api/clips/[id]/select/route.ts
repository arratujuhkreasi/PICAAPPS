import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { handleSelectClip } from "@/lib/pipeline";
import { selectClipSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = selectClipSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message ?? "Payload tidak valid." },
        { status: 400 },
      );
    }

    const record = await handleSelectClip({
      clipId: id,
      subtitleStyle: payload.data.subtitleStyle,
    });

    revalidatePath("/");
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gagal memilih clip.",
      },
      { status: 500 },
    );
  }
}
