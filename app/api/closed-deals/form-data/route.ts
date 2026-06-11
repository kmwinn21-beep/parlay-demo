import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'MXN', label: 'MXN — Mexican Peso' },
  { code: 'BRL', label: 'BRL — Brazilian Real' },
];

// GET /api/closed-deals/form-data
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ currencies: SUPPORTED_CURRENCIES });
}
