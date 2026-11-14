// ID de cliente OAuth de Google (no es secreto: identifica a la web ante Google).
// Se crea en Google Cloud Console (ver GUIA_GOOGLE_Y_GITHUB.md). También se puede pasar al
// construir con la variable VITE_GOOGLE_CLIENT_ID.
export const GOOGLE_CLIENT_ID:string=(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID||'';
