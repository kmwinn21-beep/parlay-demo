import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { sendWelcomeEmail, sendTrialReminderEmail, sendInviteEmail } from '@/lib/email';

const UPGRADE_URL = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://work.useparlay.app'}/?upgrade=true`;

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json() as {
      template: 'welcome' | 'trial_reminder' | 'invite';
      to: string;
      track?: string;
      days?: number;
    };

    const { template, to, track = 'track_a', days = 3 } = body;

    if (!to || !template) {
      return NextResponse.json({ error: 'to and template are required' }, { status: 400 });
    }

    switch (template) {
      case 'welcome':
        await sendWelcomeEmail({ to, firstName: 'Test', onboardingTrack: track });
        break;
      case 'trial_reminder':
        await sendTrialReminderEmail(to, 'Test', Math.max(1, Math.min(3, Number(days))), UPGRADE_URL);
        break;
      case 'invite':
        await sendInviteEmail(to, 'Test', 'preview-token-not-valid');
        break;
      default:
        return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ops/test-email] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
