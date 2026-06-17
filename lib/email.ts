import nodemailer from 'nodemailer';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://conferencehubpc.netlify.app'
    : 'http://localhost:3000');

function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ devLink?: string }> {
  const transport = createTransport();
  if (!transport) {
    // Dev mode: log the email content and return the link so callers can surface it
    const linkMatch = html.match(/href="(http[^"]+)"/);
    const devLink = linkMatch?.[1];
    console.log(
      `\n📧 [DEV EMAIL — configure SMTP_HOST to send real emails]\n` +
      `  To: ${to}\n  Subject: ${subject}\n  Link: ${devLink ?? '(none)'}\n`
    );
    return { devLink };
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"${APP_NAME}" <noreply@example.com>`,
    to,
    subject,
    html,
  });
  return {};
}

// ─── Email templates ──────────────────────────────────────────────────────────

const baseStyle = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a`;
const btnStyle = `display:inline-block;padding:12px 28px;background:#0B3C62;color:#ffffff;` +
  `text-decoration:none;border-radius:6px;font-weight:600;font-size:15px`;
const footerStyle = `color:#888;font-size:12px;margin-top:24px`;

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<{ devLink?: string }> {
  const link = `${BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail(
    email,
    `Verify your ${APP_NAME} account`,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Welcome to ${APP_NAME}</h2>
      <p>Thanks for signing up! Click the button below to verify your email and activate your account.</p>
      <p style="margin:24px 0"><a href="${link}" style="${btnStyle}">Verify Email Address</a></p>
      <p style="${footerStyle}">Or copy this link into your browser:<br>${link}</p>
      <p style="${footerStyle}">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    </div>`
  );
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<{ devLink?: string }> {
  const link = `${BASE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail(
    email,
    `Reset your ${APP_NAME} password`,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Password Reset Request</h2>
      <p>We received a request to reset the password for your ${APP_NAME} account.</p>
      <p style="margin:24px 0"><a href="${link}" style="${btnStyle}">Reset Password</a></p>
      <p style="${footerStyle}">Or copy this link into your browser:<br>${link}</p>
      <p style="${footerStyle}">This link expires in 1 hour. If you didn't request a password reset, no action is required — your password remains unchanged.</p>
    </div>`
  );
}

export async function sendEmailChangeVerification(
  newEmail: string,
  token: string
): Promise<{ devLink?: string }> {
  const link = `${BASE_URL}/auth/verify-email-change?token=${encodeURIComponent(token)}`;
  return sendEmail(
    newEmail,
    `Confirm your new email address — ${APP_NAME}`,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Confirm Email Change</h2>
      <p>We received a request to change the email address on your ${APP_NAME} account to <strong>${newEmail}</strong>.</p>
      <p>Click the button below to confirm this change. The link expires in 1 hour.</p>
      <p style="margin:24px 0"><a href="${link}" style="${btnStyle}">Confirm New Email</a></p>
      <p style="${footerStyle}">Or copy this link into your browser:<br>${link}</p>
      <p style="${footerStyle}">If you didn't request this change, you can safely ignore this email — your current email address will remain unchanged.</p>
    </div>`
  );
}

export async function sendNotificationEmail(
  email: string,
  subject: string,
  message: string,
  link: string | null,
): Promise<void> {
  await sendEmail(
    email,
    subject,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">New Notification</h2>
      <p style="margin:0 0 16px">${message}</p>
      ${link ? `<p style="margin:24px 0"><a href="${link}" style="${btnStyle}">View Details</a></p>` : ''}
      <p style="${footerStyle}">You are receiving this because you have email notifications enabled. Manage your preferences in account settings.</p>
    </div>`
  ).catch(() => {}); // best-effort — never throws
}

export async function sendDebriefEmail(opts: {
  email: string;
  firstName: string;
  conferenceName: string;
  conferenceId: number;
  meetingsHeld: number;
  touchpoints: number;
  followUpsDue: number;
  sesScore: number | null;
}): Promise<{ devLink?: string }> {
  const BASE_URL_DEBRIEF =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.NODE_ENV === 'production' ? 'https://conferencehubpc.netlify.app' : 'http://localhost:3000');
  const deepLink = `${BASE_URL_DEBRIEF}/conferences/${opts.conferenceId}?fieldreport=true`;
  return sendEmail(
    opts.email,
    `Your ${opts.conferenceName} Field Report is ready — ${opts.followUpsDue} follow-up${opts.followUpsDue !== 1 ? 's' : ''} due`,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Hi ${opts.firstName},</h2>
      <p>Your Field Report for <strong>${opts.conferenceName}</strong> is ready.</p>
      <p>Here's how you did:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 16px 4px 0;color:#555;font-size:14px">Meetings held:</td><td style="font-weight:600;font-size:14px">${opts.meetingsHeld}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#555;font-size:14px">Touchpoints logged:</td><td style="font-weight:600;font-size:14px">${opts.touchpoints}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#555;font-size:14px">Follow-ups due:</td><td style="font-weight:600;font-size:14px">${opts.followUpsDue}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#555;font-size:14px">Sales Execution Score:</td><td style="font-weight:600;font-size:14px">${opts.sesScore != null ? `${opts.sesScore}/100` : 'N/A'}</td></tr>
      </table>
      <p style="margin:24px 0"><a href="${deepLink}" style="${btnStyle}">View Field Report →</a></p>
      <p style="${footerStyle}">From Conversations to Follow-Through.<br>${APP_NAME}</p>
    </div>`
  );
}

export async function sendInviteEmail(
  email: string,
  firstName: string,
  token: string
): Promise<{ devLink?: string }> {
  const link = `${BASE_URL}/auth/accept-invite?token=${encodeURIComponent(token)}`;
  return sendEmail(
    email,
    `You've been invited to ${APP_NAME}`,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Welcome to ${APP_NAME}, ${firstName}!</h2>
      <p>An administrator has created an account for you. Click the button below to set your password and get started.</p>
      <p style="margin:24px 0"><a href="${link}" style="${btnStyle}">Set Your Password</a></p>
      <p style="${footerStyle}">Or copy this link into your browser:<br>${link}</p>
      <p style="${footerStyle}">This invitation expires in 72 hours. If you weren't expecting this, you can safely ignore it.</p>
    </div>`
  );
}

export async function sendEmailChangeNotification(
  oldEmail: string,
  newEmail: string
): Promise<void> {
  await sendEmail(
    oldEmail,
    `Your ${APP_NAME} email address is being changed`,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Email Change Requested</h2>
      <p>A request was made to change the email address on your ${APP_NAME} account from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>
      <p>A confirmation link has been sent to your new address. Your email will only change once that link is clicked.</p>
      <p style="${footerStyle}">If you didn't request this change, please contact your administrator immediately.</p>
    </div>`
  ).catch(() => {}); // best-effort — don't fail the flow if old-email notification fails
}

export async function sendWelcomeEmail({
  to,
  firstName,
  onboardingTrack,
}: {
  to: string;
  firstName: string;
  onboardingTrack: 'track_a' | 'track_b' | string;
}): Promise<void> {
  const isTrackA = onboardingTrack === 'track_a' || onboardingTrack === 'upcoming';
  const icpUrl = `${BASE_URL}/admin?tab=icp`;

  const subject = isTrackA
    ? `Your Parlay trial is live — here's where to start`
    : `Your Parlay trial is ready — let's evaluate your conference season`;

  const bodyText = isTrackA
    ? `Welcome to ${APP_NAME}, ${firstName}. Your 14-day free trial is active and ready to go. Your most important first step is configuring your ICP profile — it determines how Parlay scores every company and attendee at your upcoming conference.`
    : `Welcome to ${APP_NAME}, ${firstName}. Your 14-day free trial is active and ready. Your most important first step is configuring your ICP profile — every past conference list you upload will be scored against these settings.`;

  const transport = createTransport();
  if (!transport) {
    console.log(
      `\n📧 [DEV EMAIL — configure SMTP_HOST to send real emails]\n` +
      `  To: ${to}\n  Subject: ${subject}\n  Link: ${icpUrl}\n`
    );
    return;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"${APP_NAME}" <noreply@example.com>`,
    replyTo: 'support@useparlay.com',
    to,
    subject,
    html: `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">Welcome to ${APP_NAME}</h2>
      <p>${bodyText}</p>
      <p style="margin:24px 0"><a href="${icpUrl}" style="${btnStyle}">Configure your ICP profile →</a></p>
      <p style="${footerStyle}">Questions? Reply to this email.</p>
    </div>`,
  });
}

// ── Input request email ───────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  attend_invest_more:         'Attend & Invest More',
  attend_maintain:            'Attend & Maintain',
  attend_reconsider_format:   'Reconsider Format',
  evaluate_before_committing: 'Evaluate First',
  do_not_prioritize:          'Do Not Prioritize',
  remove_from_calendar:       'Remove from Calendar',
};

const TIER_COLORS: Record<string, string> = {
  attend_invest_more:         '#059669',
  attend_maintain:            '#0d9488',
  attend_reconsider_format:   '#d97706',
  evaluate_before_committing: '#f97316',
  do_not_prioritize:          '#dc2626',
  remove_from_calendar:       '#dc2626',
};

// Used in email links and logo src
const EMAIL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://work.useparlay.app';

interface InputRequestEmailOpts {
  to: string;
  recipientName: string;
  conferenceName: string;
  conferenceYear: number;
  requesterName: string;
  calScore: number | null;
  calTier: string | null;
  tokenLinks: {
    attend: string;
    attendReduced: string;
    onTheFence: string;
    dontAttend: string;
    evaluating: string;
  };
  parlayLink: string;
  expiresAt: string;
  expiryDays?: number;
  isReminder?: boolean;
  pdfAttachmentBase64?: string;
}

export async function sendInputRequestEmail(opts: InputRequestEmailOpts): Promise<{ devLink?: string }> {
  const {
    to, recipientName, conferenceName, conferenceYear,
    requesterName, calScore, calTier,
    tokenLinks, parlayLink, expiresAt, expiryDays, isReminder, pdfAttachmentBase64,
  } = opts;

  const tierLabel = calTier ? (TIER_LABELS[calTier] ?? calTier) : null;
  const tierColor = calTier ? (TIER_COLORS[calTier] ?? '#6b7280') : '#6b7280';
  const scoreDisplay = calScore != null ? Math.round(calScore) : null;

  const scoreBlock = scoreDisplay != null ? `
    <div style="border-left:4px solid ${tierColor};padding:12px 16px;background:${tierColor}18;border-radius:0 6px 6px 0;margin:20px 0">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:600">Cal. Intel. Score</p>
      <p style="margin:0 0 6px;font-size:36px;font-weight:700;line-height:1;color:${tierColor}">${scoreDisplay}<span style="font-size:14px;color:#9ca3af;font-weight:400"> /100</span></p>
      ${tierLabel ? `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background:white;border:1px solid ${tierColor};color:${tierColor};font-size:11px;font-weight:600">${tierLabel}</span>` : ''}
    </div>` : `
    <div style="border-left:4px solid #e5e7eb;padding:12px 16px;background:#f9fafb;border-radius:0 6px 6px 0;margin:20px 0">
      <p style="margin:0;font-size:13px;color:#9ca3af">Scoring in progress — check back in Parlay for the full report.</p>
    </div>`;

  const decisionBtnStyle = (bg: string) =>
    `display:block;width:100%;max-width:340px;margin:6px auto;padding:12px 20px;` +
    `background:${bg};color:#ffffff;text-decoration:none;border-radius:6px;` +
    `font-weight:600;font-size:14px;text-align:center;box-sizing:border-box`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px">

    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B3C62">
      <tr>
        <td style="padding:14px 24px;vertical-align:middle">
          <img src="${EMAIL_BASE_URL}/ParlayLogoWhite_New.png" alt="Parlay" style="height:26px;width:auto;display:block" />
        </td>
        <td style="padding:14px 24px;vertical-align:middle;text-align:right">
          <span style="color:rgba(255,255,255,.85);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;line-height:1.4;display:block">INPUT REQUEST FOR<br>${conferenceName.toUpperCase()} &mdash; ${conferenceYear + 1}</span>
        </td>
      </tr>
    </table>

    <!-- Body -->
    <div style="padding:28px 28px 20px">
      <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">
        Hi ${recipientName}, <strong>${requesterName}</strong> has requested your input on
        <strong>${conferenceName}</strong> for ${conferenceYear}.
        Please respond by ${expiresAt}${expiryDays != null ? ` (${expiryDays} Days)` : ''}.
      </p>

      ${scoreBlock}

      <p style="margin:20px 0 10px;font-size:13px;font-weight:600;color:#374151">Select your recommendation:</p>

      <a href="${tokenLinks.attend}" style="${decisionBtnStyle('#1D9E75')}">✓ Attend</a>
      <a href="${tokenLinks.attendReduced}" style="${decisionBtnStyle('#085041')}">↓ Attend (Reduced)</a>
      <a href="${tokenLinks.onTheFence}" style="${decisionBtnStyle('#EF9F27')}">~ On the Fence</a>
      <a href="${tokenLinks.dontAttend}" style="${decisionBtnStyle('#E24B4A')}">✗ Don't Attend</a>
      <a href="${tokenLinks.evaluating}" style="${decisionBtnStyle('#185FA5')}">? Evaluating</a>

      <p style="margin:22px 0 6px;font-size:13px;color:#4b5563">
        Or <a href="${parlayLink}" style="color:#1B76BC;font-weight:600">open ${conferenceName} in Parlay</a>
        to review the full report and leave a note with your input →
      </p>

      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af">These links expire on ${expiresAt}.</p>
    </div>

    <!-- Footer -->
    <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:11px;color:#9ca3af">
        Sent via Parlay · work.useparlay.app ·
        You received this because ${requesterName} requested your input.
      </p>
    </div>
  </div>
</body>
</html>`;

  const transport = createTransport();
  if (!transport) {
    const devLink = tokenLinks.attend;
    console.log(
      `\n📧 [DEV EMAIL — configure SMTP_HOST to send real emails]\n` +
      `  To: ${to}\n  Subject: Your input on ${conferenceName} — Parlay\n` +
      `  Attend link: ${devLink}\n`
    );
    return { devLink };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"Parlay" <noreply@useparlay.app>`,
    to,
    subject: `${isReminder ? 'REMINDER: ' : ''}${requesterName} wants your input on ${conferenceName}`,
    html,
    attachments: pdfAttachmentBase64 ? [{
      filename: `${conferenceName}-cal-intel-${conferenceYear}.pdf`,
      content: pdfAttachmentBase64,
      encoding: 'base64' as const,
    }] : undefined,
  });
  return {};
}

export async function sendTrialReminderEmail(
  to: string,
  firstName: string,
  daysRemaining: number,
  upgradeUrl: string
): Promise<void> {
  const dayWord = daysRemaining === 1 ? 'day' : 'days';
  const urgency = daysRemaining === 1 ? 'Last chance' : daysRemaining === 2 ? '2 days left' : '3 days left';
  const subject =
    daysRemaining === 1
      ? `Last day of your ${APP_NAME} trial`
      : daysRemaining === 2
      ? `2 days left — your ${APP_NAME} trial ends tomorrow`
      : `3 days left in your ${APP_NAME} trial`;

  await sendEmail(
    to,
    subject,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">${urgency}, ${firstName}</h2>
      <p>Your free trial of ${APP_NAME} ends in <strong>${daysRemaining} ${dayWord}</strong>. Upgrade now to keep access to everything you've set up.</p>
      <p style="margin:24px 0"><a href="${upgradeUrl}" style="${btnStyle}">Upgrade Now</a></p>
      <h3 style="color:#0B3C62;margin-top:32px">Features you'll keep with a paid plan</h3>
      <ul style="padding-left:20px;line-height:1.8">
        <li>ICP scoring and target recommendations</li>
        <li>Pre &amp; post-conference review</li>
        <li>Revenue intelligence and effectiveness analytics</li>
        <li>AI card scanning and floor capture</li>
        <li>CRM export and email integrations</li>
      </ul>
      <p style="${footerStyle}">Questions? Reply to this email or visit ${upgradeUrl}</p>
    </div>`
  );
}
