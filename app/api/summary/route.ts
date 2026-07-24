import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { DEFAULT_CURRENCY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const rows = (await sql`SELECT type, amount, category, merchant, occurred_on FROM transactions`) as any[];

  let totalExpenses = 0;
  let totalIncome = 0;
  let totalSavings = 0;
  const byCat: Record<string, number> = {};
  const byMerch: Record<string, number> = {};
  const byMonth: Record<string, { expenses: number; income: number }> = {};

  for (const t of rows) {
    const amount = Number(t.amount);
    const month = String(t.occurred_on).slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { expenses: 0, income: 0 };

    if (t.type === "expense") {
      totalExpenses += amount;
      byCat[t.category] = (byCat[t.category] || 0) + amount;
      if (t.merchant) byMerch[t.merchant] = (byMerch[t.merchant] || 0) + amount;
      byMonth[month].expenses += amount;
    } else if (t.type === "income") {
      totalIncome += amount;
      byMonth[month].income += amount;
    } else if (t.type === "saving") {
      totalSavings += amount;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    currency: DEFAULT_CURRENCY,
    total_expenses: round(totalExpenses),
    total_income: round(totalIncome),
    total_savings: round(totalSavings),
    balance: round(totalIncome - totalExpenses),
    by_category: Object.entries(byCat)
      .map(([category, total]) => ({ category, total: round(total) }))
      .sort((a, b) => b.total - a.total),
    by_merchant: Object.entries(byMerch)
      .map(([merchant, total]) => ({ merchant, total: round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    by_month: Object.entries(byMonth)
      .map(([month, v]) => ({ month, expenses: round(v.expenses), income: round(v.income) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    transactions_count: rows.length,
  });
}
