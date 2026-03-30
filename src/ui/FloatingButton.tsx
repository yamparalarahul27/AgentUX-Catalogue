import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppMapConfig } from '../types';
import { Z_INDEX, DEFAULT_THEME } from '../constants';

export interface ButtonPosition {
  x: number;
  y: number;
}

interface FloatingButtonProps {
  onClick: () => void;
  isOpen: boolean;
  position: NonNullable<AppMapConfig['position']>;
  onPositionChange?: (pos: ButtonPosition) => void;
  dockedPosition?: ButtonPosition | null;
}

const STORAGE_KEY = 'appmap-button-position';
const DRAG_THRESHOLD = 8;
export const BUTTON_SIZE = 48;
const EDGE_PADDING = 20;

type AnchorStyle = Pick<React.CSSProperties, 'top' | 'right' | 'bottom' | 'left'>;

/** Get default pixel position from a named position */
function getDefaultPosition(position: string): ButtonPosition {
  switch (position) {
    case 'bottom-left':
      return { x: EDGE_PADDING, y: typeof window !== 'undefined' ? window.innerHeight - BUTTON_SIZE - EDGE_PADDING : 0 };
    case 'top-right':
      return { x: typeof window !== 'undefined' ? window.innerWidth - BUTTON_SIZE - EDGE_PADDING : 0, y: EDGE_PADDING };
    case 'top-left':
      return { x: EDGE_PADDING, y: EDGE_PADDING };
    case 'bottom-right':
    default:
      return {
        x: typeof window !== 'undefined' ? window.innerWidth - BUTTON_SIZE - EDGE_PADDING : 0,
        y: typeof window !== 'undefined' ? window.innerHeight - BUTTON_SIZE - EDGE_PADDING : 0,
      };
  }
}

function getAnchoredStyle(position: string): AnchorStyle {
  switch (position) {
    case 'bottom-left':
      return { left: EDGE_PADDING, bottom: EDGE_PADDING };
    case 'top-right':
      return { top: EDGE_PADDING, right: EDGE_PADDING };
    case 'top-left':
      return { top: EDGE_PADDING, left: EDGE_PADDING };
    case 'bottom-right':
    default:
      return { right: EDGE_PADDING, bottom: EDGE_PADDING };
  }
}

/** Load saved position from localStorage, or return null */
function loadPosition(): ButtonPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const pos = JSON.parse(saved);
      if (typeof pos.x === 'number' && typeof pos.y === 'number') {
        return pos;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/** Clamp position to keep button within viewport */
function clampPosition(x: number, y: number): ButtonPosition {
  const maxX = window.innerWidth - BUTTON_SIZE - EDGE_PADDING;
  const maxY = window.innerHeight - BUTTON_SIZE - EDGE_PADDING;
  return {
    x: Math.max(EDGE_PADDING, Math.min(maxX, x)),
    y: Math.max(EDGE_PADDING, Math.min(maxY, y)),
  };
}

/** Floating button that toggles the App Map modal — draggable anywhere on screen */
export function FloatingButton({
  onClick,
  isOpen,
  position,
  onPositionChange,
  dockedPosition,
}: FloatingButtonProps) {
  const [pos, setPos] = useState<ButtonPosition | null>(null);
  const isDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const mouseDownRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const container = document.createElement('div');
    container.id = 'appmap-floating-button-root';
    document.body.appendChild(container);
    containerRef.current = container;

    return () => {
      document.body.removeChild(container);
      containerRef.current = null;
    };
  }, []);

  // Initialize position on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = loadPosition();
    const fallback = saved || getDefaultPosition(position);
    const initial = clampPosition(fallback.x, fallback.y);
    setPos(initial);
    onPositionChange?.(initial);
  }, [position, onPositionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isOpen && dockedPosition) return;
    if (!pos) return;
    e.preventDefault();
    isDraggingRef.current = false;
    mouseDownRef.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!mouseDownRef.current) return;
      const dx = moveEvent.clientX - mouseDownRef.current.x;
      const dy = moveEvent.clientY - mouseDownRef.current.y;

      // Only start dragging after threshold
      if (!isDraggingRef.current && (dx * dx + dy * dy) < DRAG_THRESHOLD * DRAG_THRESHOLD) {
        return;
      }
      isDraggingRef.current = true;

      const newPos = clampPosition(
        mouseDownRef.current.posX + dx,
        mouseDownRef.current.posY + dy,
      );
      setPos(newPos);
      onPositionChange?.(newPos);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (isDraggingRef.current) {
        justDraggedRef.current = true;
        // Persist position
        setPos((current) => {
          if (current) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch {}
          }
          return current;
        });
      }
      mouseDownRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [dockedPosition, isOpen, pos, onPositionChange]);

  const handleClick = useCallback(() => {
    // Ignore click if we just finished dragging
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onClick();
  }, [onClick]);

  const placementStyle = isOpen && dockedPosition
    ? { left: dockedPosition.x, top: dockedPosition.y }
    : pos
      ? { left: pos.x, top: pos.y }
      : getAnchoredStyle(position);

  const button = (
    <button
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={isOpen ? 'Close App Map' : 'Open App Map'}
      style={{
        position: 'fixed',
        zIndex: Z_INDEX.floatingButton,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: '50%',
        border: isOpen ? '1px solid rgba(255,255,255,0.5)' : 'none',
        background: isOpen ? '#09090b' : DEFAULT_THEME.accentColor,
        color: '#fff',
        cursor: isOpen && dockedPosition ? 'pointer' : isDraggingRef.current ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        transition: isDraggingRef.current ? 'none' : 'background 0.2s ease, box-shadow 0.2s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '20px',
        userSelect: 'none',
        touchAction: 'none',
        ...placementStyle,
      }}
      onMouseEnter={(e) => {
        if (!isDraggingRef.current) {
          e.currentTarget.style.transform = 'scale(1.1)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {isOpen ? (
        // Close icon (X)
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4L16 16M16 4L4 16" />
        </svg>
      ) : (
        // Map icon
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <path d="M10 6.5H14" />
          <path d="M6.5 10V14" />
          <path d="M10 17.5H14" />
          <path d="M17.5 10V14" />
        </svg>
      )}
    </button>
  );

  return containerRef.current ? createPortal(button, containerRef.current) : button;
}
