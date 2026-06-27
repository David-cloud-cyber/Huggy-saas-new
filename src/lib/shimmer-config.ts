/**
 * Centralized configuration for the "thinking" shimmer shown before the
 * assistant starts streaming tokens. Adjust phrases and timing here only —
 * both the React island (`builder-conversation-island.tsx`) and the vanilla
 * builder surface (`builder-live.ts`) read from this module.
 */

export const CYCLING_PHRASES_FR: readonly string[] = [
  "Huggy reflechit...",
  "J'analyse ta demande...",
  "Je prepare une reponse...",
  "J'organise les idees...",
  "Encore un instant...",
];

/** Milliseconds between phrase rotations. */
export const CYCLING_INTERVAL_MS = 2400;

/** Default phrase used as the initial placeholder before the shimmer mounts. */
export const DEFAULT_THINKING_LABEL_FR = CYCLING_PHRASES_FR[0];
export const DEFAULT_THINKING_LABEL_EN = "Huggy is thinking...";

export function defaultThinkingLabel(speaksFrench: boolean): string {
  return speaksFrench ? DEFAULT_THINKING_LABEL_FR : DEFAULT_THINKING_LABEL_EN;
}