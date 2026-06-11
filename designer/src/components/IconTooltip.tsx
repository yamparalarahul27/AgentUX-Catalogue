import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

// Standard hover/focus cadence for icon-only buttons across the app —
// long enough to stay quiet while users scan the UI, short enough to
// be helpful when they hover with intent. Surfaces that genuinely
// need a different cadence (instant magnified dock, faster lightbox
// metadata) should use Tooltip.Provider directly from @radix-ui/react-tooltip
// rather than IconTooltipProvider.
export const ICON_TOOLTIP_DELAY_MS = 300;
export const ICON_TOOLTIP_SKIP_DELAY_MS = 120;

export interface IconTooltipProps {
  label: string;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
}

// Single source of truth for the icon-tooltip recipe used across the
// header, toolbar, catalogue cards, lightbox actions, etc. Styled via
// .catalogue-header-tooltip in catalogue-header-menu.scss. `asChild`
// merges Radix's ref/props onto the existing trigger element.
export function IconTooltip({
  label,
  children,
  side = 'bottom',
  sideOffset = 8,
}: IconTooltipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="catalogue-header-tooltip"
          sideOffset={sideOffset}
          collisionPadding={8}
          side={side}
        >
          {label}
          <Tooltip.Arrow className="catalogue-header-tooltip__arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Convenience Provider wrapper for the standard cadence. Use this for
// any surface that hosts multiple IconTooltip triggers. Surfaces with
// custom cadence requirements should use Tooltip.Provider directly.
export function IconTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider
      delayDuration={ICON_TOOLTIP_DELAY_MS}
      skipDelayDuration={ICON_TOOLTIP_SKIP_DELAY_MS}
    >
      {children}
    </Tooltip.Provider>
  );
}
