// ============================================================
// GymStride — Location helpers (shared by onboarding + edit profile)
// ------------------------------------------------------------
// Centralises the GPS-permission → reverse-geocode → PostGIS-point
// pipeline so onboarding and "Update my location" behave identically.
// ============================================================
import * as Location from 'expo-location'

export interface ResolvedLocation {
  lat:  number
  lng:  number
  name: string
}

/** PostGIS geography input format. Note: POINT takes (longitude latitude). */
export function toPostgisPoint(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`
}

function formatName(address: Location.LocationGeocodedAddress | undefined): string {
  if (!address) return ''
  return `${address.city ?? ''}, ${address.region ?? ''}`.trim().replace(/^,|,$/g, '')
}

export class LocationPermissionError extends Error {
  constructor() {
    super('location_permission_denied')
    this.name = 'LocationPermissionError'
  }
}

/**
 * Requests foreground permission, gets a GPS fix, reverse-geocodes to a
 * human-readable "City, Region" name. Throws LocationPermissionError if
 * the user denies permission so callers can offer the manual-city path.
 */
export async function resolveGpsLocation(): Promise<ResolvedLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') throw new LocationPermissionError()

  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  let name = ''
  try {
    const [address] = await Location.reverseGeocodeAsync({
      latitude:  loc.coords.latitude,
      longitude: loc.coords.longitude,
    })
    name = formatName(address)
  } catch {
    // Reverse geocoding can fail offline — coords are still valid.
  }
  return { lat: loc.coords.latitude, lng: loc.coords.longitude, name }
}

/**
 * Forward-geocodes a manually typed city to coordinates. Falls back to
 * saving just the name if geocoding fails (coords come back null).
 */
export async function resolveCityLocation(city: string): Promise<ResolvedLocation | { name: string }> {
  const trimmed = city.trim()
  try {
    const results = await Location.geocodeAsync(trimmed)
    if (results.length > 0) {
      return { lat: results[0].latitude, lng: results[0].longitude, name: trimmed }
    }
  } catch {
    // fall through — still save the name
  }
  return { name: trimmed }
}
