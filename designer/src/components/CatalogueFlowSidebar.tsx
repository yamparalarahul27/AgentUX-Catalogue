import {
  FLOW_FILTER_ALL,
  type CatalogueFlowFilter,
  type FlowSidebarItem,
} from '../hooks/use-catalogue-filters';

interface CatalogueFlowSidebarProps {
  activeFlowCount: number;
  activeFlowFilter: CatalogueFlowFilter;
  activeFlowLabel: string;
  items: FlowSidebarItem[];
  mobileExpanded: boolean;
  onFlowFilterChange: (value: CatalogueFlowFilter) => void;
  onMobileExpandedChange: (expanded: boolean) => void;
}

export function CatalogueFlowSidebar({
  activeFlowCount,
  activeFlowFilter,
  activeFlowLabel,
  items,
  mobileExpanded,
  onFlowFilterChange,
  onMobileExpandedChange,
}: CatalogueFlowSidebarProps) {
  const summaryItems = items.filter((item) => item.kind !== 'flow');
  const flowItems = items.filter((item) => item.kind === 'flow');

  function handleSelect(value: CatalogueFlowFilter) {
    onFlowFilterChange(value);
    onMobileExpandedChange(false);
  }

  function renderItem(item: FlowSidebarItem) {
    const isActive = item.value === activeFlowFilter;

    return (
      <button
        key={`${item.kind}-${item.value}`}
        type="button"
        className={`catalogue-flow-sidebar__item ${isActive ? 'is-active' : ''}`}
        onClick={() => handleSelect(item.value)}
      >
        <span className="catalogue-flow-sidebar__item-copy">
          <span className="catalogue-flow-sidebar__item-label">{item.label}</span>
          {item.projectName && <span className="catalogue-flow-sidebar__item-meta">{item.projectName}</span>}
        </span>
        <span className="catalogue-flow-sidebar__count">{item.count}</span>
      </button>
    );
  }

  return (
    <>
      <aside className="catalogue-flow-sidebar" aria-label="Flow filters">
        <div className="catalogue-flow-sidebar__header">
          <p className="catalogue-flow-sidebar__eyebrow">Navigate</p>
          <h2>Flows</h2>
          <p className="catalogue-flow-sidebar__description">Filter the catalogue by assigned journey, or jump straight to anything still unassigned.</p>
        </div>

        <div className="catalogue-flow-sidebar__section">
          {summaryItems.map(renderItem)}
        </div>

        <div className="catalogue-flow-sidebar__section">
          <div className="catalogue-flow-sidebar__section-title">Project flows</div>
          {flowItems.length > 0 ? flowItems.map(renderItem) : (
            <div className="catalogue-flow-sidebar__empty">No flows available for the current scope.</div>
          )}
        </div>
      </aside>

      <div className={`catalogue-mobile-flow-sheet ${mobileExpanded ? 'is-expanded' : ''}`}>
        <button
          type="button"
          aria-hidden={!mobileExpanded}
          className="catalogue-mobile-flow-sheet__scrim"
          onClick={() => onMobileExpandedChange(false)}
        />
        <div className="catalogue-mobile-flow-sheet__panel">
          <button
            type="button"
            className="catalogue-mobile-flow-sheet__summary"
            aria-expanded={mobileExpanded}
            onClick={() => onMobileExpandedChange(!mobileExpanded)}
          >
            <span className="catalogue-mobile-flow-sheet__grabber" />
            <span className="catalogue-mobile-flow-sheet__summary-copy">
              <span className="catalogue-mobile-flow-sheet__summary-label">Flow filter</span>
              <span className="catalogue-mobile-flow-sheet__summary-value">{activeFlowLabel}</span>
            </span>
            <span className="catalogue-mobile-flow-sheet__summary-count">{activeFlowCount}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={mobileExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
            </svg>
          </button>

          <div className="catalogue-mobile-flow-sheet__body">
            <div className="catalogue-mobile-flow-sheet__actions">
              {items.map(renderItem)}
            </div>
            {activeFlowFilter !== FLOW_FILTER_ALL && (
              <button
                type="button"
                className="catalogue-mobile-flow-sheet__clear"
                onClick={() => handleSelect(FLOW_FILTER_ALL)}
              >
                Clear flow filter
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
