import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX, DEFAULT_THEME } from '../constants';
import type { ButtonPosition } from './FloatingButton';
import { BUTTON_SIZE } from './FloatingButton';

const MODAL_WIDTH = 1040;
const MODAL_HEIGHT = 720;
const GAP = 12;
const EDGE_PADDING = 20;

interface ModalProps {
  isOpen: boolean;
  children: React.ReactNode;
  buttonPosition?: ButtonPosition | null;
}

/** Compute modal position anchored near the button, staying within viewport */
export function computeModalFrame(btn: ButtonPosition): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  if (typeof window === 'undefined') return { left: 0, top: 0, width: MODAL_WIDTH, height: MODAL_HEIGHT };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(MODAL_WIDTH, vw - EDGE_PADDING * 2);
  const h = Math.min(MODAL_HEIGHT, vh - EDGE_PADDING * 2);

  const btnCenterX = btn.x + BUTTON_SIZE / 2;
  const btnCenterY = btn.y + BUTTON_SIZE / 2;

  // Horizontal: try to align left edge with button, flip if it overflows
  let left = btn.x;
  if (left + w > vw - EDGE_PADDING) {
    left = btn.x + BUTTON_SIZE - w;
  }
  left = Math.max(EDGE_PADDING, Math.min(vw - w - EDGE_PADDING, left));

  // Vertical: place above button if button is in bottom half, below if in top half
  let top: number;
  if (btnCenterY > vh / 2) {
    // Button is in bottom half — modal goes above
    top = btn.y - h - GAP;
  } else {
    // Button is in top half — modal goes below
    top = btn.y + BUTTON_SIZE + GAP;
  }
  top = Math.max(EDGE_PADDING, Math.min(vh - h - EDGE_PADDING, top));

  return { left, top, width: w, height: h };
}

/** Portal-based modal that renders into document.body to escape host app CSS stacking */
export function Modal({ isOpen, children, buttonPosition }: ModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const container = document.createElement('div');
    container.id = 'appmap-modal-root';
    document.body.appendChild(container);
    containerRef.current = container;

    return () => {
      document.body.removeChild(container);
      containerRef.current = null;
    };
  }, []);

  const modalPos = useMemo(() => {
    if (!buttonPosition) return null;
    return computeModalFrame(buttonPosition);
  }, [buttonPosition]);

  if (!isOpen || !containerRef.current) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        ...(modalPos
          ? { left: modalPos.left, top: modalPos.top }
          : { bottom: 80, right: 20 }),
        width: `min(${MODAL_WIDTH}px, calc(100vw - ${EDGE_PADDING * 2}px))`,
        height: `min(${MODAL_HEIGHT}px, calc(100vh - ${EDGE_PADDING * 2 + BUTTON_SIZE + GAP}px))`,
        zIndex: Z_INDEX.modal,
        borderRadius: '12px',
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        background: DEFAULT_THEME.bgColor,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {children}
    </div>,
    containerRef.current,
  );
}
