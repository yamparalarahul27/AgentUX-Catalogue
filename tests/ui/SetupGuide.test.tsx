import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SetupGuide } from '../../src/ui/SetupGuide';

describe('SetupGuide', () => {
  it('exposes a hide action', () => {
    const dismiss = vi.fn();

    render(
      <SetupGuide
        dataSourceStatus="no-data"
        projectStructureStatus="missing"
        projectStructureMessage="Run npx agentux scan."
        runtimeRouteCount={0}
        runtimeDetection
        onRunProjectStructure={() => {}}
        onCopyScanCommand={() => {}}
        onRestartRuntime={() => {}}
        onRefreshAll={() => {}}
        onDismiss={dismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
