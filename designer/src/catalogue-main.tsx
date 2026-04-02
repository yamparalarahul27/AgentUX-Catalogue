import React from 'react';
import ReactDOM from 'react-dom/client';
import { CatalogueApp } from './CatalogueApp';
import './styles/designer.scss';
import './styles/catalogue-sidebar.scss';
import './styles/catalogue-views.scss';
import './styles/catalogue-gallery-zoom.scss';
import './styles/catalogue-lightbox-annotations.scss';
import './styles/canvas-enhancements.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CatalogueApp />
  </React.StrictMode>,
);
