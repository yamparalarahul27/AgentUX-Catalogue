import type { ButtonPosition } from './FloatingButton';
import { computeModalFrame } from './Modal';

interface DockingOptions {
  buttonPos: ButtonPosition | null;
  isOpen: boolean;
  buttonRadius: number;
  buttonSize: number;
  dockOffset: number;
}

export function getDockedButtonPosition({
  buttonPos,
  isOpen,
  buttonRadius,
  buttonSize,
  dockOffset,
}: DockingOptions): ButtonPosition | null {
  if (!isOpen || !buttonPos) return null;

  const frame = computeModalFrame(buttonPos);
  const buttonCenterX = buttonPos.x + buttonRadius;
  const buttonCenterY = buttonPos.y + buttonRadius;
  const edges = [
    {
      edge: 'left' as const,
      distance: Math.abs(buttonCenterX - frame.left),
    },
    {
      edge: 'right' as const,
      distance: Math.abs(buttonCenterX - (frame.left + frame.width)),
    },
    {
      edge: 'top' as const,
      distance: Math.abs(buttonCenterY - frame.top),
    },
    {
      edge: 'bottom' as const,
      distance: Math.abs(buttonCenterY - (frame.top + frame.height)),
    },
  ];

  const nearestEdge = edges.sort((left, right) => left.distance - right.distance)[0]?.edge ?? 'right';
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  switch (nearestEdge) {
    case 'left':
      return {
        x: frame.left - buttonRadius,
        y: clamp(
          buttonCenterY - buttonRadius,
          frame.top + dockOffset,
          frame.top + frame.height - buttonSize - dockOffset,
        ),
      };
    case 'top':
      return {
        x: clamp(
          buttonCenterX - buttonRadius,
          frame.left + dockOffset,
          frame.left + frame.width - buttonSize - dockOffset,
        ),
        y: frame.top - buttonRadius,
      };
    case 'bottom':
      return {
        x: clamp(
          buttonCenterX - buttonRadius,
          frame.left + dockOffset,
          frame.left + frame.width - buttonSize - dockOffset,
        ),
        y: frame.top + frame.height - buttonRadius,
      };
    case 'right':
    default:
      return {
        x: frame.left + frame.width - buttonRadius,
        y: clamp(
          buttonCenterY - buttonRadius,
          frame.top + dockOffset,
          frame.top + frame.height - buttonSize - dockOffset,
        ),
      };
  }
}
