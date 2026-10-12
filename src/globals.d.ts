/** Fingerprint of the sim code, injected by vite.config.ts (see simVersion there). */
declare const __SIM_VERSION__: string;

/** Umami analytics, loaded by the script tag in index.html (absent if blocked). */
interface Window {
  umami?: { track(event: string, data?: Record<string, string | number | boolean>): void };
}
