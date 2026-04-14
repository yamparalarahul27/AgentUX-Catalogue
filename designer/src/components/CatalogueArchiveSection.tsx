interface CatalogueArchiveSectionProps {
  archiveItem: 'flow-builder' | 'projects';
  onBackToCatalogue: () => void;
}

export function CatalogueArchiveSection({
  archiveItem,
  onBackToCatalogue,
}: CatalogueArchiveSectionProps) {
  const isFlowBuilder = archiveItem === 'flow-builder';

  return (
    <section className="catalogue-archive">
      <header className="catalogue-archive__head">
        <div className="catalogue-archive__copy">
          <h2>Archive</h2>
          <p>This area is read-only and kept for historical access.</p>
        </div>
        <span className="catalogue-archive__badge">ARCHIVED</span>
      </header>

      <article className="catalogue-archive__card">
        <h3>{isFlowBuilder ? 'Flow Builder' : 'Projects'}</h3>
        <p>
          {isFlowBuilder
            ? 'Flow Builder remains available as archived legacy tooling. New work should happen in Catalogue + Feature Log.'
            : 'Project-level scoping is archived on this branch. Catalogue filters and Team scope now use full DB scope by default.'}
        </p>

        <div className="catalogue-archive__actions">
          {isFlowBuilder ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { window.location.href = '/designer/'; }}
            >
              Open Flow Builder (Archived)
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              onClick={onBackToCatalogue}
            >
              Return to Catalogue
            </button>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={onBackToCatalogue}
          >
            Continue in Catalogue
          </button>
        </div>
      </article>
    </section>
  );
}
