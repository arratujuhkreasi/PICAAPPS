import { NextResponse } from "next/server";

import { cleanWorkspaceTemp } from "@/lib/pipeline";

export async function POST() {
  try {
    const result = await cleanWorkspaceTemp();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Gagal membersihkan workspace temp.",
      },
      { status: 500 },
    );
  }
}
