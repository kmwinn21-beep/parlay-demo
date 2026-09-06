/**
 * Every error code the Slack routes can put in a redirect, and what a person
 * should be told when they see it.
 *
 * The routes redirect back to a settings screen with `?error=<code>` rather than
 * answering a raw 500, so the code is the only thing the screen has to go on.
 * Rendering it verbatim would put `slack_wrong_workspace` in front of a user;
 * rendering nothing would leave them on a settings page with no explanation for
 * why the thing they just did had no effect. Hence this table.
 *
 * Two rules it exists to keep:
 *
 *   - Every code a route emits has an entry. tests/slack-ui.mjs reads the route
 *     sources, extracts the literals, and fails if one is missing — so adding a
 *     `settingsError('slack_new_thing')` without a message breaks the build
 *     rather than shipping a blank.
 *   - An unrecognised code still produces a sentence. A user who lands here with
 *     a mangled URL gets "Slack could not be connected" rather than emptiness.
 *
 * The messages say what happened and what to do next. They deliberately do not
 * distinguish a forged state from an expired one — that difference is only
 * interesting to an attacker, and to the person who legitimately took too long
 * over the consent screen both mean "start again".
 */

export const SLACK_ERROR_MESSAGES: Record<string, string> = {
  slack_unauthorized:
    'Your session expired before Slack could finish. Sign in and try again.',
  slack_forbidden:
    'Only an administrator can connect a Slack workspace. Ask an administrator on your account to set it up.',
  slack_no_account:
    'Your user is not attached to an account, so there is no workspace to connect to. Contact support.',
  slack_no_workspace:
    'No Slack workspace has been connected for your account yet. An administrator needs to connect one before you can link your Slack account.',
  slack_not_configured:
    'Slack is not configured on this deployment. SLACK_CLIENT_ID and SLACK_CLIENT_SECRET need to be set.',
  slack_denied:
    'The Slack authorization was cancelled. Nothing was changed.',
  slack_invalid_state:
    'That Slack link was no longer valid — it may have expired. Start again from this page.',
  slack_state_mismatch:
    'That Slack link was started by a different account or a different person. Start again from this page.',
  slack_exchange_failed:
    'Slack did not complete the authorization. Try again, and check that this app is still installed in your Slack workspace.',
  slack_wrong_workspace:
    'You signed in to a different Slack workspace than the one connected to your account. Sign in to the workspace your team uses and try again.',
  slack_store_failed:
    'Slack authorized successfully but the connection could not be saved. Check that ENCRYPTION_KEY is set, then try again.',
};

/**
 * The message for an error param, or null when there is no param at all.
 *
 * Never returns a raw code and never returns an empty string: an unrecognised
 * value falls back to a sentence that is true of every failure in this flow.
 */
export function slackErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return SLACK_ERROR_MESSAGES[code] ?? 'Slack could not be connected. Try again from this page.';
}
