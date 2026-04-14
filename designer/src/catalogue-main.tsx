import React from 'react';
import ReactDOM from 'react-dom/client';
import { CatalogueApp } from './CatalogueApp';
import './styles/designer.scss';
import './styles/catalogue-sidebar.scss';
import './styles/catalogue-views.scss';
import './styles/catalogue-families.scss';
import './styles/catalogue-family-preview.scss';
import './styles/catalogue-family-overlays.scss';
import './styles/catalogue-family-details-modal.scss';
import './styles/catalogue-gallery-zoom.scss';
import './styles/catalogue-lightbox-annotations.scss';
import './styles/catalogue-team.scss';
import './styles/catalogue-videos.scss';
import './styles/catalogue-figma.scss';
import './styles/canvas-enhancements.scss';
import './styles/catalogue-filter-sheet.scss';
import './styles/catalogue-quick-panel.scss';
import './styles/catalogue-stack.scss';
import './styles/catalogue-skeleton.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CatalogueApp />
  </React.StrictMode>,
);
