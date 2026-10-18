"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import type { SpokenLanguage } from "@/lib/types";
import { fetchSpeech } from "@/services/agent";

/** A one-second silent clip. Playing it during a tap "unlocks" audio, so a reply can be read aloud a moment later (iPhone needs this). */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export type Listening = { id: string; state: "loading" | "playing" } | null;

/**
 * Read replies aloud.
 *  - listen(id, text, language): plays a reply (fetching the voice first if needed). Tapping a reply that is playing stops it.
 *  - prefetch(id, text, language): gets the voice ready in the background so the next tap plays at once.
 *  - prime(): call inside a tap (a click handler) before a delayed listen() so the browser allows the sound.
 * A voice that was fetched once is kept, so listening again is instant.
 */
export function useSpeech(onProblem: (message: string) => void) {
  const [listening, setListening] = useState<Listening>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const ready = useRef(new Map<string, string>()); // reply id -> playable address
  const fetching = useRef(new Map<string, Promise<string>>());
  const current = useRef<string | null>(null);

  const element = useCallback((): HTMLAudioElement => {
    if (!player.current) player.current = new Audio();
    return player.current;
  }, []);

  /** Forget what the player was doing, so a leftover handler can never cancel the next reply. */
  const detach = useCallback((el: HTMLAudioElement) => {
    el.onended = null;
    el.onerror = null;
  }, []);

  const prime = useCallback(() => {
    const el = element();
    detach(el);
    el.src = SILENCE;
    void el.play().catch(() => undefined);
  }, [detach, element]);

  const stop = useCallback(() => {
    const el = player.current;
    if (el) {
      detach(el);
      el.pause();
    }
    current.current = null;
    setListening(null);
  }, [detach]);

  // Leaving the page stops the sound and frees the kept voices.
  useEffect(() => {
    const kept = ready.current;
    return () => {
      stop();
      kept.forEach((address) => URL.revokeObjectURL(address));
      kept.clear();
    };
  }, [stop]);

  /** The voice for one reply: from memory if we already have it, otherwise fetched once (even if asked twice). */
  const voiceFor = useCallback((id: string, text: string, language: SpokenLanguage): Promise<string> => {
    const have = ready.current.get(id);
    if (have) return Promise.resolve(have);
    const pending = fetching.current.get(id);
    if (pending) return pending;
    const job = fetchSpeech(text, language)
      .then((address) => {
        ready.current.set(id, address);
        return address;
      })
      .finally(() => fetching.current.delete(id));
    fetching.current.set(id, job);
    return job;
  }, []);

  const prefetch = useCallback(
    (id: string, text: string, language: SpokenLanguage) => {
      void voiceFor(id, text, language).catch(() => undefined); // best effort: a failure here shows up when they tap Listen
    },
    [voiceFor],
  );

  const listen = useCallback(
    async (id: string, text: string, language: SpokenLanguage) => {
      // Already working on this reply: a tap while it loads does nothing, a tap while it plays stops it.
      if (current.current === id) {
        if (!ready.current.has(id) || fetching.current.has(id)) return;
        return stop();
      }
      stop();
      prime();
      current.current = id;
      setListening({ id, state: "loading" });
      try {
        const address = await voiceFor(id, text, language);
        if (current.current !== id) return; // the farmer moved on while it was loading
        const el = element();
        detach(el);
        el.src = address;
        el.onended = () => stop();
        el.onerror = () => {
          stop();
          onProblem("I could not play the sound on this device.");
        };
        await el.play();
        if (current.current === id) setListening({ id, state: "playing" });
      } catch (e) {
        if (current.current === id) stop();
        onProblem(
          e instanceof ApiError ? e.message : "I could not play that. Check your phone's volume, then tap Listen again.",
        );
      }
    },
    [detach, element, onProblem, prime, stop, voiceFor],
  );

  return { listening, listen, prefetch, stop, prime };
}
