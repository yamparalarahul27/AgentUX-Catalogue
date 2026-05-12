import { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { ScreenshotNode } from '../types';
import { ThumbHashImage } from './ThumbHashImage';

export interface SharePageCarouselItem {
  screenshot: ScreenshotNode;
  summary: string | null;
}

interface SharePageCarouselProps {
  items: SharePageCarouselItem[];
  step: number;
  onStepChange: (next: number) => void;
}

const SWIPE_THRESHOLD_PX = 50;

export function SharePageCarousel({ items, step, onStepChange }: SharePageCarouselProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const total = items.length;
  const clampedStep = Math.max(0, Math.min(step, total - 1));
  const current = items[clampedStep];
  const prev = clampedStep > 0 ? items[clampedStep - 1] : null;
  const next = clampedStep < total - 1 ? items[clampedStep + 1] : null;

  const goTo = useCallback(
    (target: number) => {
      const bounded = Math.max(0, Math.min(target, total - 1));
      if (bounded !== clampedStep) onStepChange(bounded);
    },
    [clampedStep, onStepChange, total],
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(clampedStep - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); goTo(clampedStep + 1); }
      else if (event.key === 'Home') { event.preventDefault(); goTo(0); }
      else if (event.key === 'End') { event.preventDefault(); goTo(total - 1); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [clampedStep, goTo, total]);

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientX;
    if (typeof end !== 'number') return;
    const delta = end - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    goTo(clampedStep + (delta < 0 ? 1 : -1));
  }

  if (total === 0) return null;

  // For N=1 / N=2 we drop the peeks — they look awkward at those counts.
  const showPeeks = total >= 3;
  const showArrows = total >= 2;

  return (
    <div
      ref={wrapRef}
      className="share-page__carousel"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="share-page__carousel-stage">
        {showArrows && (
          <button
            type="button"
            className="share-page__carousel-arrow share-page__carousel-arrow--prev"
            onClick={() => goTo(clampedStep - 1)}
            disabled={clampedStep === 0}
            aria-label="Previous screen"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}

        {showPeeks && prev && (
          <button
            type="button"
            className="share-page__carousel-peek share-page__carousel-peek--prev"
            onClick={() => goTo(clampedStep - 1)}
            aria-label={`Go to step ${clampedStep}`}
            tabIndex={-1}
          >
            <ThumbHashImage
              src={prev.screenshot.image_url ?? ''}
              thumbHash={prev.screenshot.thumb_hash ?? null}
              alt=""
            />
          </button>
        )}

        <div className="share-page__carousel-center">
          <ThumbHashImage
            src={current.screenshot.image_url ?? ''}
            thumbHash={current.screenshot.thumb_hash ?? null}
            alt={current.screenshot.name}
          />
        </div>

        {showPeeks && next && (
          <button
            type="button"
            className="share-page__carousel-peek share-page__carousel-peek--next"
            onClick={() => goTo(clampedStep + 1)}
            aria-label={`Go to step ${clampedStep + 2}`}
            tabIndex={-1}
          >
            <ThumbHashImage
              src={next.screenshot.image_url ?? ''}
              thumbHash={next.screenshot.thumb_hash ?? null}
              alt=""
            />
          </button>
        )}

        {showArrows && (
          <button
            type="button"
            className="share-page__carousel-arrow share-page__carousel-arrow--next"
            onClick={() => goTo(clampedStep + 1)}
            disabled={clampedStep === total - 1}
            aria-label="Next screen"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="share-page__carousel-caption">
        <h2>
          <span className="share-page__carousel-counter">{clampedStep + 1} / {total}</span>
          <span className="share-page__carousel-divider" aria-hidden="true"> · </span>
          <span>{current.screenshot.name}</span>
        </h2>
        {current.summary && <p>{current.summary}</p>}
      </div>

      {total > 1 && (
        <div className="share-page__carousel-dots" role="tablist" aria-label="Screens">
          {items.map((item, index) => (
            <button
              key={item.screenshot.id}
              type="button"
              role="tab"
              aria-selected={index === clampedStep}
              aria-label={`Go to step ${index + 1}`}
              className={`share-page__carousel-dot${index === clampedStep ? ' is-active' : ''}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
