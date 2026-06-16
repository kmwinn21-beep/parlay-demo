'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const DECISION_LABELS: Record<string, string> = {
  confirmed:         'Attend',
  attend_but_reduce: 'Attend (Reduced)',
  watching:          'On the Fence',
  passed:            "Don't Attend",
  pending_approval:  'Evaluating',
};

const DECISION_COLORS: Record<string, string> = {
  confirmed:         '#1D9E75',
  attend_but_reduce: '#085041',
  watching:          '#EF9F27',
  passed:            '#E24B4A',
  pending_approval:  '#185FA5',
};

type PageState =
  | { phase: 'loading' }
  | { phase: 'success'; conferenceName: string; decision: string; isSystemUser: boolean; conferenceId: number }
  | { phase: 'already_used'; conferenceName: string; decisionLogged: string }
  | { phase: 'expired'; conferenceName: string; expiresAt: string }
  | { phase: 'error'; message: string };

function RespondInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const decision = params.get('decision') ?? '';
  const aid = params.get('aid') ?? '';

  const [state, setState] = useState<PageState>({ phase: 'loading' });

  useEffect(() => {
    if (!token || !decision || !aid) {
      setState({ phase: 'error', message: 'This link is not valid.' });
      return;
    }
    fetch('/api/input/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, decision, aid }),
    })
      .then(async res => {
        const data = await res.json() as Record<string, unknown>;
        if (res.ok) {
          setState({
            phase: 'success',
            conferenceName: String(data.conferenceName ?? ''),
            decision: String(data.decision ?? decision),
            isSystemUser: Boolean(data.isSystemUser),
            conferenceId: Number(data.conferenceId ?? 0),
          });
        } else if (data.error === 'already_used') {
          setState({
            phase: 'already_used',
            conferenceName: String(data.conferenceName ?? ''),
            decisionLogged: String(data.decisionLogged ?? ''),
          });
        } else if (data.error === 'expired') {
          setState({
            phase: 'expired',
            conferenceName: String(data.conferenceName ?? ''),
            expiresAt: String(data.expiresAt ?? ''),
          });
        } else {
          setState({ phase: 'error', message: String(data.message ?? 'This link is not valid.') });
        }
      })
      .catch(() => setState({ phase: 'error', message: 'Something went wrong. Please try again.' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#f3f4f6', padding: '24px 16px', fontFamily: 'Arial, sans-serif',
    }}>
      {/* Logo */}
      <div style={{
        marginBottom: 28, fontSize: 22, fontWeight: 700, color: '#0B3C62', letterSpacing: '-.3px',
      }}>
        Parlay
      </div>

      <div style={{
        background: '#ffffff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,.08)',
        maxWidth: 440, width: '100%', overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{ background: '#0B3C62', padding: '16px 24px' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Calendar Intelligence
          </p>
        </div>

        <div style={{ padding: '28px 24px' }}>
          {state.phase === 'loading' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 32, height: 32, margin: '0 auto 16px',
                border: '3px solid rgba(27,118,188,.2)', borderTopColor: '#1B76BC',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              }} />
              <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Recording your input…</p>
            </div>
          )}

          {state.phase === 'success' && (() => {
            const color = DECISION_COLORS[state.decision] ?? '#0B3C62';
            const label = DECISION_LABELS[state.decision] ?? state.decision;
            return (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 52, height: 52, borderRadius: '50%',
                  background: color + '18', margin: '0 auto 20px',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>
                  Input recorded
                </h1>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  {state.conferenceName}
                </p>
                <div style={{
                  borderLeft: `4px solid ${color}`, background: color + '0f',
                  borderRadius: '0 8px 8px 0', padding: '10px 16px', marginBottom: 20,
                }}>
                  <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9ca3af', fontWeight: 600 }}>
                    Your recommendation
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color }}>
                    {label}
                  </p>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151', textAlign: 'center' }}>
                  Your input has been recorded. Thank you.
                </p>
                {state.isSystemUser && state.conferenceId > 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                    <a
                      href={`/calendar-intelligence?conference=${state.conferenceId}`}
                      style={{ color: '#1B76BC', fontWeight: 600 }}
                    >
                      View the full Calendar Intelligence report →
                    </a>
                  </p>
                )}
              </>
            );
          })()}

          {state.phase === 'already_used' && (() => {
            const color = DECISION_COLORS[state.decisionLogged] ?? '#6b7280';
            const label = DECISION_LABELS[state.decisionLogged] ?? state.decisionLogged;
            return (
              <>
                <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>
                  Already recorded
                </h1>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  Your input for <strong>{state.conferenceName}</strong> has already been recorded as:
                </p>
                <div style={{
                  borderLeft: `4px solid ${color}`, background: color + '0f',
                  borderRadius: '0 8px 8px 0', padding: '10px 16px',
                }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color }}>{label}</p>
                </div>
              </>
            );
          })()}

          {state.phase === 'expired' && (
            <>
              <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>
                Link expired
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                This link expired on {state.expiresAt}. Please contact the person who sent it to submit your input.
              </p>
            </>
          )}

          {state.phase === 'error' && (
            <>
              <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>
                Invalid link
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                {state.message}
              </p>
            </>
          )}
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: 11, color: '#9ca3af' }}>
        Parlay · work.useparlay.app
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function RespondPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f3f4f6', fontFamily: 'Arial, sans-serif',
      }}>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</p>
      </div>
    }>
      <RespondInner />
    </Suspense>
  );
}
