import { api, backendConfigured } from "@/lib/api";
import { getFarmId } from "@/lib/session";
import type { Position } from "@/lib/geo";
import type { VetVM } from "@/lib/types";

export type VetSearchResult = { vets: VetVM[]; searchUrl: string; lookupFailed: boolean };

/** Vet clinics near a position (OpenStreetMap data), nearest first. */
export async function findVets(pos: Position): Promise<VetSearchResult> {
  if (!backendConfigured) {
    return {
      vets: [],
      searchUrl: `https://www.google.com/maps/search/veterinary+clinic/@${pos.lat.toFixed(5)},${pos.lng.toFixed(5)},13z`,
      lookupFailed: false,
    };
  }
  return api<VetSearchResult>(`/api/farms/${getFarmId()}/vets/nearby?lat=${pos.lat}&lng=${pos.lng}`, {}, { timeoutMs: 60_000 });
}
