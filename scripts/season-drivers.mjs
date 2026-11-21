import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seasonDriverNamesCache = new Map();

/** Format an Ergast/Jolpica driver slug (e.g. "max_verstappen") as title case fallback. */
export function formatDriverFallback(driverId) {
  return driverId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Load a cached Map<driverId, fullName> for a given season from its static JSON bundle,
 * supporting both dictionary `drivers` maps (v2/v1) and `driverStandings` fallbacks.
 */
export function getSeasonDriversMap(year) {
  const key = String(year);
  if (seasonDriverNamesCache.has(key)) {
    return seasonDriverNamesCache.get(key);
  }

  const drivers = new Map();
  const bundlePath = resolve(__dirname, '..', 'public', 'data', 'seasons', `${key}.json`);
  if (existsSync(bundlePath)) {
    try {
      const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
      if (bundle?.drivers && typeof bundle.drivers === 'object') {
        for (const [id, info] of Object.entries(bundle.drivers)) {
          const driverId = info?.driverId || id;
          if (!driverId) continue;
          const fullName = [info?.givenName, info?.familyName].filter(Boolean).join(' ').trim();
          drivers.set(driverId, fullName || formatDriverFallback(driverId));
        }
      }
      if (drivers.size === 0 && Array.isArray(bundle?.driverStandings)) {
        for (const entry of bundle.driverStandings) {
          const d = entry?.Driver;
          if (!d?.driverId) continue;
          const fullName = [d.givenName, d.familyName].filter(Boolean).join(' ').trim();
          drivers.set(d.driverId, fullName || formatDriverFallback(d.driverId));
        }
      }
    } catch {
      // Fall back to empty map if static bundle is temporarily malformed.
    }
  }

  seasonDriverNamesCache.set(key, drivers);
  return drivers;
}
