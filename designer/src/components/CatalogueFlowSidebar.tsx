import { useState } from 'react';
import { ChevronDown, ChevronUp, PanelLeftClose, PanelRightClose } from 'lucide-react';

const FLOW_FILTER_ALL = '__all__';
type CatalogueFlowFilter = string;

interface FlowSidebarItem {
  kind: 'summary' | 'flow';
  value: CatalogueFlowFilter;
  label: string;
  count: number;
}

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
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const summaryItems = items.filter((item) => item.kind !== 'flow');
  const flowItems = items.filter((item) => item.kind === 'flow');

  function handleSelect(value: CatalogueFlowFilter) {
    onFlowFilterChange(value);
    onMobileExpandedChange(false);
  }

  function PanelLeftCloseIcon() {
    return <PanelLeftClose size={18} aria-hidden="true" />;
  }

  function PanelRightCloseIcon() {
    return <PanelRightClose size={18} aria-hidden="true" />;
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
        </span>
        <span className="catalogue-flow-sidebar__count">{item.count}</span>
      </button>
    );
  }

  return (
    <>
      <aside className={`catalogue-flow-sidebar ${desktopCollapsed ? 'is-collapsed' : ''}`} aria-label="Flow filters">
        <div className="catalogue-flow-sidebar__header">
          <div className="catalogue-flow-sidebar__header-top">
            <div>
              <p className="catalogue-flow-sidebar__eyebrow">Navigate</p>
              <h2>Flows</h2>
            </div>
            <button
              type="button"
              className="catalogue-flow-sidebar__toggle"
              title="Close flow navigation"
              aria-label="Close flow navigation"
              onClick={() => setDesktopCollapsed(true)}
            >
              <PanelLeftCloseIcon />
            </button>
          </div>
          <p className="catalogue-flow-sidebar__description">Filter the catalogue by assigned journey, or jump straight to anything still unassigned.</p>
        </div>

        <div className="catalogue-flow-sidebar__section">
          {summaryItems.map(renderItem)}
        </div>

        <div className="catalogue-flow-sidebar__section">
          <div className="catalogue-flow-sidebar__section-title">Flows</div>
          {flowItems.length > 0 ? flowItems.map(renderItem) : (
            <div className="catalogue-flow-sidebar__empty">No flows available for the current scope.</div>
          )}
        </div>
      </aside>

      {desktopCollapsed && (
        <button
          type="button"
          className="catalogue-flow-sidebar__opener"
          title="Open flow navigation"
          aria-label="Open flow navigation"
          onClick={() => setDesktopCollapsed(false)}
        >
          <PanelRightCloseIcon />
        </button>
      )}

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
            {mobileExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
