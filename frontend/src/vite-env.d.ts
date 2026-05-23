/// <reference types="vite/client" />

// Declaración de tipos para CSS Modules
declare module '*.module.css' {
  const clases: Record<string, string>;
  export default clases;
}
