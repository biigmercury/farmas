"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import type { SpokenLanguage } from "@/lib/types";
import { fetchSpeech } from "@/services/agent";

/** A one-second silent clip. Playing it during a tap "unlocks" audio, so a reply can be read aloud a moment later (iPhone needs this). */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export type Listening = { id: string; state: "loading" | "playing" } | null;

/**
 * Read replies aloud. listen(id, text, language) fetches the voice and plays it; calling it again for the same reply
 * stops it. prime() must be called inside a tap (a click handler) before a delayed listen() so the browser allows sound.
 */
export function useSpeech(onProblem: (message: string) => void) {
  const [listening, setListening] = useState<Listening>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const url = useRef("");
  const current = useRef<string | null>(null);

  const element = useCallback((): HTMLAudioElement => {
    if (!player.current) player.current = new Audio();
    return player.current;
  }, []);

  const prime = useCallback(() => {
    const el = element();
    el.src = SILENCE;
    void el.play().catch(() => undefined);
  }, [element]);

  const stop = useCallback(() => {
    player.current?.pause();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = "";
    current.current = null;
    setListening(null);
  }, []);

  useEffect(() => stop, [stop]); // leaving the page stops the sound

  const listen = useCallback(
    async (id: string, text: string, language: SpokenLanguage) => {
      if (current.current === id) return stop();
      stop();
      prime();
      current.current = id;
      setListening({ id, state: "loading" });
      try {
        const address = await fetchSpeech(text, language);
        if (current.current !== id) {
          URL.revokeObjectURL(address); // the farmer stopped or moved on while it was loading
          return;
        }
        url.current = address;
        const el = element();
        el.onended = () => stop();
        el.onerror = () => {
          stop();
          onProblem("I could not play the sound on this device.");
        };
        el.src = address;
        await el.play();
        setListening({ id, state: "playing" });
      } catch (e) {
        stop();
        onProblem(
          e instanceof ApiError ? e.message : "I could not play that. Check your phone's volume, then tap Listen again.",
        );
      }
    },
    [element, onProblem, prime, stop],
  );

  return { listening, listen, stop, prime };
}
