"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

type State<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; message: string };

/**
 * Load data when a page opens. Returns the data, a loading flag, a plain-English error, and reload().
 * Old data stays visible while reloading so the screen doesn't flash empty.
 */
export function useAsync<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load; // keep the latest loader without re-running the load below
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    data: state.status === "ok" ? state.data : undefined,
    loading: state.status === "loading",
    error: state.status === "error" ? state.message : "",
    reload,
  };
}
