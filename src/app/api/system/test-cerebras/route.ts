import { NextResponse } from "next/server";

import { testCerebrasConnection } from "@/lib/pipeline";

export async function POST() {
  try {
    const result = await testCerebrasConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gagal menguji Cerebras.",
      },
      { status: 500 },
    );
  }
}
