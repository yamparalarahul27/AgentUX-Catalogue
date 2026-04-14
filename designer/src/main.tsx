import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/designer.scss';
import './styles/canvas-enhancements.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/designer">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
