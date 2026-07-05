'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { FloatingNav } from './FloatingNav';
import { FooterChat } from './FooterChat';
import { ChatPanelProvider } from './ChatPanelContext';
import { BottomNavProvider } from './BottomNavContext';
import { FloatingNavHiddenProvider } from './FloatingNavHiddenContext';
import { UserProvider } from './UserContext';
import { TrialBanner } from './TrialBanner';
import ImpersonationBanner from './ImpersonationBanner';
import { OnboardingProvider } from '@/lib/OnboardingContext';
import { WelcomeInterstitial } from './onboarding/WelcomeInterstitial';
import { UpgradeModalProvider } from '@/lib/UpgradeModalContext';
import { PlanSelectionModal } from './PlanSelectionModal';
import { useUpgradeModal } from '@/lib/UpgradeModalContext';
import { UpgradeQueryTrigger } from './UpgradeQueryTrigger';
import { ActiveConferenceProvider } from '@/components/ActiveConferenceContext';
import { MeetingNotesDrawerProvider, useMeetingNotesDrawer } from '@/lib/MeetingNotesDrawerContext';
import { MeetingNotesDrawer } from '@/components/MeetingNotesDrawer';
import { ClosedDealDraftProvider, useClosedDealDraft } from '@/lib/ClosedDealDraftContext';
import { ClosedWonDealModal } from '@/components/ClosedWonDealModal';
import { ConferenceReviewModalsProvider, useConferenceReviewModals } from '@/lib/ConferenceReviewModalsContext';
import { PreConferenceReviewModal } from '@/components/PreConferenceReview';
import { PostConferenceReviewModal } from '@/components/PostConferenceReview';
import { ConferenceEffectivenessModalBody } from '@/components/ConferenceEffectivenessModal';

function GlobalMeetingDrawer() {
  const { meetingId, closeMeetingNotes } = useMeetingNotesDrawer();
  return <MeetingNotesDrawer meetingId={meetingId} onClose={closeMeetingNotes} />;
}

function GlobalClosedDealBar() {
  const { isOpen, isMinimized, draftLabel, expandDeal, closeDeal } = useClosedDealDraft();
  if (!isOpen || !isMinimized) return null;
  return (
    <div
      className="hidden lg:flex fixed bottom-0 left-64 ml-2 z-[60] items-center gap-2.5 px-4 py-2.5 bg-white border border-b-0 rounded-t-xl shadow-lg w-[200px] select-none"
      style={{ borderColor: 'rgb(var(--brand-accent-rgb))' }}
    >
      <svg className="w-4 h-4 text-brand-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
      <button type="button" onClick={expandDeal} className="text-sm font-medium text-gray-800 truncate hover:text-brand-primary transition-colors flex-1 text-left min-w-0">
        {draftLabel || 'Deal draft'}
      </button>
      <button type="button" onClick={closeDeal} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Discard draft">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function GlobalReviewModalsBar() {
  const {
    preConference, expandPreConference, closePreConference,
    postConference, expandPostConference, closePostConference,
    effectiveness, expandEffectiveness, closeEffectiveness,
  } = useConferenceReviewModals();

  const pills = [
    preConference.isOpen && preConference.isMinimized && {
      key: 'pre-conference', label: preConference.conferenceName || 'Pre-Conference', expand: expandPreConference, close: closePreConference,
    },
    postConference.isOpen && postConference.isMinimized && {
      key: 'post-conference', label: postConference.conferenceName || 'Activity Debrief', expand: expandPostConference, close: closePostConference,
    },
    effectiveness.isOpen && effectiveness.isMinimized && {
      key: 'effectiveness', label: effectiveness.conferenceName || 'Effectiveness', expand: expandEffectiveness, close: closeEffectiveness,
    },
  ].filter((p): p is { key: string; label: string; expand: () => void; close: () => void } => Boolean(p));

  if (pills.length === 0) return null;

  return (
    <div className="hidden lg:flex fixed bottom-0 left-64 ml-2 z-[60] flex-col-reverse gap-2 items-start">
      {pills.map(p => (
        <div
          key={p.key}
          className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-b-0 rounded-t-xl shadow-lg w-[220px] select-none"
          style={{ borderColor: 'rgb(var(--brand-accent-rgb))' }}
        >
          <svg className="w-4 h-4 text-brand-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <button type="button" onClick={p.expand} className="text-sm font-medium text-gray-800 truncate hover:text-brand-primary transition-colors flex-1 text-left min-w-0">
            {p.label}
          </button>
          <button type="button" onClick={p.close} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Close">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function GlobalReviewModalsMobileTab() {
  const {
    preConference, expandPreConference,
    postConference, expandPostConference,
    effectiveness, expandEffectiveness,
  } = useConferenceReviewModals();

  const tabs = [
    preConference.isOpen && preConference.isMinimized && {
      key: 'pre-conference', label: preConference.conferenceName || 'Pre-Conference', expand: expandPreConference,
    },
    postConference.isOpen && postConference.isMinimized && {
      key: 'post-conference', label: postConference.conferenceName || 'Activity Debrief', expand: expandPostConference,
    },
    effectiveness.isOpen && effectiveness.isMinimized && {
      key: 'effectiveness', label: effectiveness.conferenceName || 'Effectiveness', expand: expandEffectiveness,
    },
  ].filter((t): t is { key: string; label: string; expand: () => void } => Boolean(t));

  if (tabs.length === 0) return null;

  return (
    <div className="lg:hidden fixed right-0 top-1/2 -translate-y-1/2 z-[55] flex flex-col gap-2">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={t.expand}
          title={t.label}
          aria-label={`Expand ${t.label}`}
          className="w-10 h-10 flex items-center justify-center bg-white border border-r-0 rounded-l-xl shadow-lg"
          style={{ borderColor: 'rgb(var(--brand-accent-rgb))' }}
        >
          <svg className="w-4 h-4 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { isOpen, defaultPlan, closeUpgradeModal } = useUpgradeModal();
  return (
    <>
      <ChatPanelProvider>
      <FloatingNavHiddenProvider>
      <BottomNavProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          {/* Sidebar — desktop only */}
          <div className="hidden lg:flex">
            <Sidebar />
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <ImpersonationBanner />
            <TrialBanner />
            <Header />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
              {children}
            </main>
          </div>

          {/* Floating nav — mobile only */}
          <div className="lg:hidden">
            <FloatingNav />
          </div>
        </div>

        {/* Footer chat — handles its own desktop/mobile rendering */}
        <FooterChat />
      </BottomNavProvider>
      </FloatingNavHiddenProvider>
      </ChatPanelProvider>

      {/* Onboarding overlays — useSearchParams requires Suspense boundary */}
      <Suspense fallback={null}>
        <WelcomeInterstitial />
      </Suspense>

      {/* Opens upgrade modal when ?upgrade=true is present in URL */}
      <Suspense fallback={null}>
        <UpgradeQueryTrigger />
      </Suspense>

      {/* Plan selection modal — single instance, controlled via UpgradeModalContext */}
      <PlanSelectionModal isOpen={isOpen} onClose={closeUpgradeModal} defaultPlan={defaultPlan} />

      {/* Global meeting notes drawer — persists across page navigations */}
      <GlobalMeetingDrawer />

      {/* Global closed deal modal — persists across page navigations */}
      <ClosedWonDealModal />
      <GlobalClosedDealBar />

      {/* Global pre-conference / post-conference / effectiveness review modals — persist across page navigations */}
      <PreConferenceReviewModal />
      <PostConferenceReviewModal />
      <ConferenceEffectivenessModalBody />
      <GlobalReviewModalsBar />
      <GlobalReviewModalsMobileTab />
    </>
  );
}

function EmbedChecker({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  if (searchParams.get('embed') === 'true') {
    // Render only the page content with no chrome (sidebar, header, nav, footer)
    return <main className="h-screen overflow-y-auto p-4 lg:p-6 bg-gray-50">{children}</main>;
  }
  return <AppShellInner>{children}</AppShellInner>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Auth pages render without the shell (no sidebar/header/nav)
  // Exception: /auth/account is a protected app page that needs the full shell
  if (pathname.startsWith('/auth/') && pathname !== '/auth/account') {
    return <>{children}</>;
  }

  return (
    <UserProvider>
      <OnboardingProvider>
      <UpgradeModalProvider>
      <ActiveConferenceProvider>
      <MeetingNotesDrawerProvider>
      <ClosedDealDraftProvider>
      <ConferenceReviewModalsProvider>
        <Suspense fallback={<AppShellInner>{children}</AppShellInner>}>
          <EmbedChecker>{children}</EmbedChecker>
        </Suspense>
      </ConferenceReviewModalsProvider>
      </ClosedDealDraftProvider>
      </MeetingNotesDrawerProvider>
      </ActiveConferenceProvider>
      </UpgradeModalProvider>
      </OnboardingProvider>
    </UserProvider>
  );
}
