import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../../src/ui/Toolbar';

describe('Toolbar', () => {
  it('replaces the close button with a menu that can toggle the guide', () => {
    const toggleGuide = vi.fn();

    render(
      <Toolbar
        onExportMarkdown={() => {}}
        onExportJson={() => {}}
        onRelayout={() => {}}
        routeCount={5}
        edgeCount={7}
        currentFilter="all"
        onFilterChange={() => {}}
        filterCounts={{
          all: 5,
          'runtime-only': 1,
          'dead-ends': 2,
          orphaned: 1,
        }}
        isGuideVisible
        onToggleGuideVisibility={toggleGuide}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    fireEvent.click(screen.getByText('Menu'));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Run AgentUX' }));

    expect(toggleGuide).toHaveBeenCalledTimes(1);
  });
});
