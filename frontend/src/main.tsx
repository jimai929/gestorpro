import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './estilos/global.css';
import { App } from './App';

const elementoRaiz = document.getElementById('root');
if (!elementoRaiz) {
  throw new Error('No se encontró el elemento #root en el DOM.');
}

createRoot(elementoRaiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
