import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}

export function LabelEditorSection({ title, defaultOpen = false, badge, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`label-editor-section ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="label-editor-section__header"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <ChevronRight
          size={14}
          className="label-editor-section__chevron"
          aria-hidden="true"
        />
        <span className="label-editor-section__title">{title}</span>
        {badge}
      </button>
      {open && <div className="label-editor-section__content">{children}</div>}
    </section>
  );
}
