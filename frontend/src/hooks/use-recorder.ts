"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording";

const MAX_SECONDS = 120;

/** Browsers record in different formats; pick the first one this browser can make. */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
}

/**
 * Record a voice note from the microphone. start() asks the browser for permission, stop() resolves with the
 * recording. The microphone is always released afterwards, so the browser's "recording" light goes off.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finish = useRef<((b: Blob | null) => void) | null>(null);

  const supported =
    typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setState("idle");
    setSeconds(0);
  }, []);

  useEffect(() => release, [release]); // leaving the page must never leave the microphone on

  /** Resolves true once recording has begun; throws a readable Error if the microphone is unavailable. */
  const start = useCallback(async (): Promise<void> => {
    if (!supported) throw new Error("Voice recording is not supported in this browser.");
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      throw new Error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone is turned off for FarmAs. Allow it in your browser settings to use voice."
          : "I could not find a microphone on this device.",
      );
    }
    stream.current = s;
    chunks.current = [];
    const mime = pickMime();
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    recorder.current = r;
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    r.onstop = () => {
      const blob = chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" }) : null;
      const done = finish.current;
      finish.current = null;
      release();
      done?.(blob);
    };
    r.start();
    setState("recording");
    setSeconds(0);
    timer.current = setInterval(() => {
      setSeconds((n) => {
        if (n + 1 >= MAX_SECONDS && r.state === "recording") r.stop();
        return n + 1;
      });
    }, 1000);
  }, [supported, release]);

  /** Stop and get the recording (null if nothing was captured). */
  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const r = recorder.current;
        if (!r || r.state !== "recording") {
          resolve(null);
          return;
        }
        finish.current = resolve;
        r.stop();
      }),
    [],
  );

  /** Throw the recording away. */
  const cancel = useCallback(() => {
    const r = recorder.current;
    finish.current = null;
    if (r && r.state === "recording") {
      r.onstop = null;
      r.stop();
    }
    release();
  }, [release]);

  return { supported, state, seconds, start, stop, cancel };
}
