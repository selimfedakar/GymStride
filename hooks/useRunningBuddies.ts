import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchRunningBuddies, type RunningFilters } from '@/lib/queries/discovery'
import { useAuthStore } from '@/store/auth'
import type { RunType } from '@/types/database'

export const RUN_PAGE_SIZE = 20

export function useRunningBuddies(radiusKm = 50, runType: RunType | null = null, filters: RunningFilters = {}) {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useInfiniteQuery({
    queryKey:         ['running-buddies', userId, radiusKm, runType, filters.sameUniversity, filters.maxPaceSeconds],
    queryFn:          ({ pageParam }) =>
      fetchRunningBuddies(userId!, radiusKm, runType, RUN_PAGE_SIZE, pageParam as number, filters),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RUN_PAGE_SIZE ? undefined : allPages.length * RUN_PAGE_SIZE,
    enabled: !!userId,
  })
}
