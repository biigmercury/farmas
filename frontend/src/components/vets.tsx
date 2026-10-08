"use client";

import { useState } from "react";
import { Button, Card, Tag } from "@/components/ui";
import { GeoError, getPosition } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import type { VetVM } from "@/lib/types";
import { findVets, type VetSearchResult } from "@/services/vets";

/** Tappable vet clinics: call, get directions, or search wider on Google Maps. */
export function VetCards({ vets, searchUrl }: { vets: VetVM[]; searchUrl?: string | null }) {
  return (
    <div className="mt-3 space-y-2">
      {vets.map((v) => (
        <div key={`${v.name}-${v.distanceKm}`} className="rounded-xl bg-lime p-3 text-forest">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold">{v.name}</p>
            <span className="label shrink-0">{v.distanceKm} km</span>
          </div>
          {v.address && <p className="mt-1 text-sm">{v.address}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={v.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="label inline-flex min-h-11 items-center rounded-full border border-forest bg-white px-4"
            >
              Directions
            </a>
            {v.phone && (
              <a
                href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}
                className="label inline-flex min-h-11 items-center rounded-full border border-forest bg-white px-4"
              >
                Call {v.phone}
              </a>
            )}
          </div>
        </div>
      ))}
      {searchUrl && (
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="label inline-flex min-h-11 items-center rounded-full border border-forest px-4"
        >
          Search more on Google Maps
        </a>
      )}
    </div>
  );
}

/** "Find vets near me": asks the phone for its location once, then lists the closest clinics. */
export function NearbyVets() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VetSearchResult | null>(null);

  async function search() {
    setBusy(true);
    setError("");
    try {
      const pos = await getPosition();
      setResult(await findVets(pos));
    } catch (e) {
      setResult(null);
      setError(
        e instanceof GeoError || e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="!p-6">
      <p className="label mb-3"><Tag>Need a vet?</Tag></p>
      <p className="text-forest/80">Find vet clinics close to where you are right now.</p>
      <Button type="button" variant="forest" onClick={() => void search()} disabled={busy} className="mt-4 w-full">
        {busy ? "Looking…" : "Find vets near me"}
      </Button>
      <p className="mt-2 text-sm text-forest/70">
        Your phone will ask to share your location. It is used only for this search and is not saved.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-critical">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.vets.length === 0 ? (
            <p className="mt-3 text-sm">
              {result.lookupFailed
                ? "I could not reach the map just now."
                : "I did not find a vet clinic in the map data near you."}{" "}
              Try Google Maps below.
            </p>
          ) : null}
          <VetCards vets={result.vets} searchUrl={result.searchUrl} />
        </>
      )}
    </Card>
  );
}
