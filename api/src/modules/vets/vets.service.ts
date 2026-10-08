import axios from "axios";
import { logger } from "../../utils/logger";

export interface VetPlace {
  name: string;
  phone: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  directionsUrl: string;
}

export interface VetSearch {
  vets: VetPlace[];
  /** A Google Maps search for vets around the same spot, always offered so the farmer is never stuck. */
  searchUrl: string;
  /** True when the map data could not be reached (as opposed to "no vet within range"). */
  lookupFailed: boolean;
}

// Public OpenStreetMap query servers. We try them in order. No key or account needed.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const RADII_M = [25_000, 80_000];
const CACHE_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; result: VetSearch }>();

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function searchUrlFor(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/veterinary+clinic/@${lat.toFixed(5)},${lng.toFixed(5)},13z`;
}

function toPlace(el: OverpassElement, lat: number, lng: number): VetPlace | null {
  const pLat = el.lat ?? el.center?.lat;
  const pLng = el.lon ?? el.center?.lon;
  if (typeof pLat !== "number" || typeof pLng !== "number") return null;
  const tags = el.tags ?? {};
  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"] ?? tags["addr:suburb"]]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    name: tags.name?.trim() || "Veterinary clinic",
    phone: tags.phone || tags["contact:phone"] || null,
    address: address || null,
    lat: pLat,
    lng: pLng,
    distanceKm: Math.round(haversineKm(lat, lng, pLat, pLng) * 10) / 10,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${pLat},${pLng}`,
  };
}

async function queryOverpass(lat: number, lng: number, radius: number): Promise<OverpassElement[]> {
  const around = `(around:${radius},${lat},${lng})`;
  const query =
    `[out:json][timeout:12];(` +
    `node["amenity"="veterinary"]${around};way["amenity"="veterinary"]${around};` +
    `node["healthcare"="veterinary"]${around};way["healthcare"="veterinary"]${around};` +
    `);out center 40;`;

  // These servers are free and shared, so they sometimes answer 5xx for a moment: go round the list twice.
  let lastError: unknown;
  for (let round = 0; round < 2; round++) {
    for (const url of OVERPASS_URLS) {
      try {
        const res = await axios.post<{ elements?: OverpassElement[]; remark?: string }>(
          url,
          `data=${encodeURIComponent(query)}`,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "*/*",
              "User-Agent": "FarmAs/1.0 (livestock app)",
            },
            timeout: 14_000,
          }
        );
        // A busy server can answer 200 with a "timed out" remark and no data: treat that as a failure.
        if (res.data.remark && /timed out|out of memory/i.test(res.data.remark) && !(res.data.elements ?? []).length) {
          throw new Error(res.data.remark);
        }
        return res.data.elements ?? [];
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}

/** The vet clinics closest to a point, nearest first (at most 5). Never invents a clinic. */
export async function findNearbyVets(lat: number, lng: number): Promise<VetSearch> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const searchUrl = searchUrlFor(lat, lng);
  try {
    let places: VetPlace[] = [];
    for (const radius of RADII_M) {
      const elements = await queryOverpass(lat, lng, radius);
      places = elements.map((el) => toPlace(el, lat, lng)).filter((p): p is VetPlace => p !== null);
      if (places.length > 0) break;
    }
    // The same clinic can be mapped twice (a point and a building): keep the first of each name+place.
    const seen = new Set<string>();
    const unique = places
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .filter((p) => {
        const id = `${p.name.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 5);

    const result: VetSearch = { vets: unique, searchUrl, lookupFailed: false };
    cache.set(key, { at: Date.now(), result });
    return result;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Vet lookup failed");
    return { vets: [], searchUrl, lookupFailed: true };
  }
}

/** The vets as short plain text, for the chat to quote or for the AI to mention. */
export function vetsAsText(vets: VetPlace[]): string {
  return vets
    .map((v, i) => `${i + 1}. ${v.name}, ${v.distanceKm} km away${v.phone ? `, phone ${v.phone}` : ""}${v.address ? `, ${v.address}` : ""}`)
    .join("\n");
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Turn a place name ("Kaduna State, Nigeria") into coordinates, for farmers who do not share their phone's location. */
export async function geocode(place: string): Promise<{ lat: number; lng: number } | null> {
  const query = place.trim();
  if (!query) return null;
  try {
    const res = await axios.get<Array<{ lat: string; lon: string }>>(NOMINATIM, {
      params: { q: query, format: "json", limit: 1 },
      headers: { "User-Agent": "FarmAs/1.0 (livestock app)" },
      timeout: 8_000,
    });
    const first = res.data[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}
