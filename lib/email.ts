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
    from: process.env.SMTP_FROM ?? `"${APP_NAME}" <noreply@procarehr.com>`,
    to,
    subject,
    html,
  });
  return {};
}

// ─── Email templates ──────────────────────────────────────────────────────────

const baseStyle = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a`;
const btnStyle = `display:inline-block;padding:12px 28px;background:#1B76BC;color:#ffffff;` +
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
