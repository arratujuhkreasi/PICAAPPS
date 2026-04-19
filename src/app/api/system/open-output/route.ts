import { NextResponse } from "next/server";

import { openOutputFolder } from "@/lib/pipeline";

export async function POST() {
  try {
    const result = await openOutputFolder();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gagal membuka folder output.",
      },
      { status: 500 },
    );
  }
}
