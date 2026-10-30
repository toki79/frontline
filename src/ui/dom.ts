

/* =====================================================================
   Hilfsfunktionen
   ===================================================================== */
export const $ = (s: string): any => document.querySelector(s);
export const $$ = (s: string): any => document.querySelectorAll(s);
export const cv = $('#cv'), ctx = cv.getContext('2d');
export const mini=$('#mini'), mctx=mini.getContext('2d');
