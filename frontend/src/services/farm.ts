import { api, backendConfigured } from "@/lib/api";
import {
  FARM_SIZES,
  FARM_TYPES,
  type FarmSetup,
  type LivestockKey,
} from "@/lib/farm-setup";
import { setFarm } from "@/lib/session";

// Create the farm and its starting animals. Contract: api/docs/API.md (Farms) + POST /livestock.

const label = (list: readonly { key: string; label: string }[], key: string) =>
  list.find((o) => o.key === key)?.label ?? key;

// The onboarding keys (poultry, goats...) -> the API's animal types.
const API_TYPE: Record<LivestockKey, string> = {
  poultry: "POULTRY", goats: "GOAT", sheep: "SHEEP", cattle: "CATTLE", pigs: "PIG", rabbits: "RABBIT", fish: "FISH",
};

export async function createFarm(setup: FarmSetup): Promise<void> {
  if (!backendConfigured) return; // demo mode: nothing to save

  const { farm } = await api<{ farm: { id: string; name: string } }>("/api/farms", {
    method: "POST",
    body: JSON.stringify({
      name: setup.farmName.trim(),
      location: setup.location.trim(),
      farmType: label(FARM_TYPES, setup.farmType),
      size: label(FARM_SIZES, setup.size),
    }),
  });
  setFarm(farm.id, farm.name);

  // Only types with a count can be stored: the API needs at least 1 animal.
  const picked = (Object.keys(setup.livestock) as LivestockKey[]).filter((k) => Number(setup.livestock[k]) > 0);
  for (const key of picked) {
    await api(`/api/farms/${farm.id}/livestock`, {
      method: "POST",
      body: JSON.stringify({ type: API_TYPE[key], quantity: Number(setup.livestock[key]) }),
    });
  }
}
