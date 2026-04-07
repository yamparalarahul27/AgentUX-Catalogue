import React from 'react';
import ReactDOM from 'react-dom/client';
import { CatalogueCtestPage } from './components/CatalogueCtestPage';
import './styles/designer.scss';
import './styles/catalogue-sidebar.scss';
import './styles/catalogue-views.scss';
import './styles/catalogue-compare-mode.scss';
import './styles/catalogue-families.scss';
import './styles/catalogue-ctest.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CatalogueCtestPage />
  </React.StrictMode>,
);
