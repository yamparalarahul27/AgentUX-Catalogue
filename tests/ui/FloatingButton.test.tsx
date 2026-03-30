import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUTTON_SIZE, FloatingButton } from '../../src/ui/FloatingButton';

const EDGE_PADDING = 20;

describe('FloatingButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 400,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 300,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('clamps a restored saved position into the current viewport', async () => {
    window.localStorage.setItem('appmap-button-position', JSON.stringify({ x: 9999, y: 9999 }));

    render(
      <FloatingButton
        onClick={() => {}}
        isOpen={false}
        position="bottom-right"
      />,
    );

    const button = screen.getByRole('button', { name: 'Open App Map' });
    const portalRoot = document.getElementById('appmap-floating-button-root');

    expect(portalRoot).not.toBeNull();
    expect(portalRoot?.contains(button)).toBe(true);

    await waitFor(() => {
      expect(button.style.left).toBe(`${400 - BUTTON_SIZE - EDGE_PADDING}px`);
      expect(button.style.top).toBe(`${300 - BUTTON_SIZE - EDGE_PADDING}px`);
    });
  });
});
