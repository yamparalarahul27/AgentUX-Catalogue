import React from 'react';
import ReactDOM from 'react-dom/client';
import { CatalogueApp } from './CatalogueApp';
import './styles/designer.scss';
import './styles/canvas-enhancements.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CatalogueApp />
  </React.StrictMode>,
);
