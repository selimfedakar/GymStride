// ============================================================
// GymStride — Apple Health (HealthKit) import
// ------------------------------------------------------------
// Imports running workouts from Apple Health into workout_logs so
// runners don't have to re-enter distances by hand.
//
// The module is defensive by design: HealthKit only exists on a real
// iOS device with the native module built in, so every entry point
// short-circuits gracefully off-device. The exact @kingstinct API
// surface shifts between major versions — calls are probed at runtime
// and the whole thing is wrapped so a mismatch degrades to "0 imported"
// instead of crashing. Verify the call names against the installed
// package version during device testing.
// ============================================================
import { Platform } from 'react-native'
import * as HealthKit from '@kingstinct/react-native-healthkit'
import { insertImportedRuns, type ImportedRun } from './queries/workouts'
import { captureError } from './analytics'

const RUN_READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
]

export function isHealthSupported(): boolean {
  return Platform.OS === 'ios'
}

export async function isHealthAvailable(): Promise<boolean> {
  if (!isHealthSupported()) return false
  try {
    const fn = (HealthKit as any).isHealthDataAvailable
    return fn ? await fn() : false
  } catch {
    return false
  }
}

/** Prompts the Apple Health read-permission sheet. Returns true if we can query. */
export async function requestHealthAuthorization(): Promise<boolean> {
  if (!(await isHealthAvailable())) return false
  try {
    const req = (HealthKit as any).requestAuthorization
    // v9 signature: requestAuthorization(share, read). We only read.
    await req([], RUN_READ_TYPES)
    return true
  } catch (e) {
    captureError(e, { where: 'health.requestAuthorization' })
    return false
  }
}

// Heuristic run classification from distance + duration.
function classifyRun(distanceKm: number, durationSec: number): ImportedRun['workout_type'] {
  const paceMinPerKm = distanceKm > 0 ? (durationSec / 60) / distanceKm : Infinity
  if (distanceKm >= 12) return 'long_run'
  if (distanceKm <= 3 && paceMinPerKm < 5) return 'sprint'
  return 'short_run'
}

function metersToKm(m: number | null | undefined): number | null {
  if (m == null) return null
  return Math.round((m / 1000) * 100) / 100
}

/**
 * Queries running workouts since `sinceDays` ago and imports any not
 * already present. Returns the count of newly imported runs.
 */
export async function importRunsFromHealth(profileId: string, sinceDays = 90): Promise<number> {
  if (!(await isHealthAvailable())) return 0
  try {
    const from = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    const queryFn =
      (HealthKit as any).queryWorkoutSamples ??
      (HealthKit as any).queryWorkouts
    if (!queryFn) return 0

    const samples: any[] = await queryFn({ from, ascending: false, limit: 500 }) ?? []

    const runs: ImportedRun[] = samples
      // Apple activity type 37 = running; string form 'HKWorkoutActivityTypeRunning'
      .filter((w) =>
        w?.workoutActivityType === 37 ||
        w?.workoutActivityType === 'running' ||
        String(w?.workoutActivityType ?? '').toLowerCase().includes('running'))
      .map((w) => {
        const distanceKm = metersToKm(
          w?.totalDistance?.quantity ??
          w?.totalDistance ??
          w?.distance ?? null,
        )
        const durationSec: number =
          w?.duration ??
          (w?.endDate && w?.startDate
            ? (new Date(w.endDate).getTime() - new Date(w.startDate).getTime()) / 1000
            : 0)
        const startIso = new Date(w?.startDate ?? Date.now()).toISOString()
        return {
          workout_type: distanceKm != null ? classifyRun(distanceKm, durationSec) : 'short_run',
          distance_km:  distanceKm,
          logged_at:    startIso,
          external_id:  String(w?.uuid ?? w?.id ?? `${startIso}-${distanceKm}`),
          notes:        'Imported from Apple Health',
        } satisfies ImportedRun
      })

    return await insertImportedRuns(profileId, runs)
  } catch (e) {
    captureError(e, { where: 'health.importRuns' })
    throw e
  }
}
