import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CatalogueApp } from './CatalogueApp';
import { playBootSoundAtEntry } from './hooks/use-app-sounds';
import './styles/designer.scss';
import './styles/catalogue-sidebar.scss';
import './styles/catalogue-views.scss';
import './styles/catalogue-group-view.scss';
import './styles/catalogue-families.scss';
import './styles/catalogue-family-preview.scss';
import './styles/catalogue-family-overlays.scss';
import './styles/catalogue-family-details-modal.scss';
import './styles/catalogue-gallery-zoom.scss';
import './styles/catalogue-lightbox-annotations.scss';
import './styles/typing-keycap.scss';
import './styles/canvas-gallery.scss';
import './styles/auth-bokeh.scss';
import './styles/catalogue-team.scss';
import './styles/catalogue-trash.scss';
import './styles/catalogue-flags.scss';
import './styles/catalogue-members.scss';
import './styles/catalogue-videos.scss';
import './styles/catalogue-links.scss';
import './styles/catalogue-header-menu.scss';
import './styles/catalogue-filter-sheet.scss';
import './styles/catalogue-chip-strip.scss';
import './styles/catalogue-flow-strip.scss';
import './styles/whats-new.scss';
import './styles/catalogue-scroll-top.scss';
import './styles/catalogue-lightbox-crop.scss';
import './styles/catalogue-group-coverage.scss';
import './styles/changelog-page.scss';
import './styles/icon-button-interactions.scss';
import './styles/catalogue-quick-panel.scss';
import './styles/catalogue-stack.scss';
import './styles/catalogue-skeleton.scss';
import './styles/bookmarks.scss';
import './styles/catalogue-labeling-studio.scss';
import './styles/catalogue-drop-overlay.scss';
import './styles/catalogue-upload-progress.scss';
import './styles/catalogue-share.scss';
import './styles/catalogue-search-modal.scss';
import './styles/editable-title.scss';
import './styles/catalogue-magnified-dock.scss';
import './styles/catalogue-group-detail.scss';
import './styles/catalogue-elements.scss';
import './styles/catalogue-splash-fall-in.scss';
import './styles/catalogue-not-found.scss';
import './styles/welcome-modal.scss';
import './styles/save-trash-animation.scss';
import './styles/catalogue-pull-to-refresh.scss';

// Fire the boot chime as early as possible — at module entry, while the
// pre-React boot-screen in catalogue.html is still painted. Anything
// later (CatalogueApp useEffect, post-auth) introduces an audible lag
// between the visual splash and the sound.
playBootSoundAtEntry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/designer">
      <CatalogueApp />
    </BrowserRouter>
  </React.StrictMode>,
);
