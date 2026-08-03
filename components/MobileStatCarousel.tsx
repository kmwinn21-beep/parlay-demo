'use client';

import { Children, useRef, useState } from 'react';

// Wraps a set of stat cards so that on mobile they become a one-at-a-time,
// swipeable carousel (scroll-snap, hidden scrollbar) with chevron buttons on
// both sides, while leaving the parent's own grid layout completely
// untouched at sm+ — this component disappears from the box tree there
// (display:contents) so it never affects desktop column widths/gaps.
export function MobileStatCarousel({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const items = Children.toArray(children);
  const count = items.length;

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(count - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    setIndex(clamped);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="sm:contents">
      <div className="sm:hidden relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        >
          {items.map((child, i) => (
            <div key={i} className="w-full flex-shrink-0 snap-center px-1">
              {child}
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollToIndex(index - 1)}
              disabled={index === 0}
              aria-label="Previous card"
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:pointer-events-none z-10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollToIndex(index + 1)}
              disabled={index === count - 1}
              aria-label="Next card"
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:pointer-events-none z-10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollToIndex(i)}
                  aria-label={`Go to card ${i + 1}`}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-brand-primary' : 'bg-gray-300'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {items.map((child, i) => (
        <div key={i} className="hidden sm:contents">{child}</div>
      ))}
    </div>
  );
}
