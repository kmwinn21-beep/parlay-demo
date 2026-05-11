import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  return NextResponse.json({ summary: { attend_invest_more_count: 0, attend_same_level_count: 0, reconsider_format_count: 0, evaluate_count: 0, remove_count: 0 }, conferences: [] });
}
