// Ereignisse der Simulation an die Oberfläche (Meldungen, Dialoge, Spielende).
// Die Simulation kennt kein DOM – sie meldet nur, die UI hört zu.
type Handler = (...args: any[]) => void;
const handlers: Record<string, Handler[]> = {};
export function on(ev: string, fn: Handler) { (handlers[ev] ||= []).push(fn); }
export function emit(ev: string, ...args: any[]) { for (const fn of handlers[ev] || []) fn(...args); }
/** Meldung im Spielprotokoll (oben links) */
export function msg(text: string, col?: string) { emit('msg', text, col); }
