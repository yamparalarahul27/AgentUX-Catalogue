import type { GridDensity } from '../lib/catalogue-helpers';

const OPTIONS: Array<{ value: GridDensity; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
];

interface CatalogueGridDensityProps {
  value: GridDensity;
  onChange: (density: GridDensity) => void;
}

export function CatalogueGridDensity({ value, onChange }: CatalogueGridDensityProps) {
  return (
    <div className="catalogue-grid-density" role="group" aria-label="Grid density">
      {OPTIONS.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`catalogue-grid-density__btn ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
