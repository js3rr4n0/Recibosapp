import { NextResponse } from "next/server";
import { CATEGORIES, DEFAULT_CURRENCY, scannerEnabled } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    default_currency: DEFAULT_CURRENCY,
    categories: CATEGORIES,
    scanner_enabled: scannerEnabled(),
  });
}
