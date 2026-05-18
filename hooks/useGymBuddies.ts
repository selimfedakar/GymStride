import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchGymBuddies } from '@/lib/queries/discovery'
import { useAuthStore } from '@/store/auth'

export const GYM_PAGE_SIZE = 20

export function useGymBuddies(radiusKm = 50, minFrequency = 1) {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useInfiniteQuery({
    queryKey:         ['gym-buddies', userId, radiusKm, minFrequency],
    queryFn:          ({ pageParam }) =>
      fetchGymBuddies(userId!, radiusKm, minFrequency, GYM_PAGE_SIZE, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < GYM_PAGE_SIZE ? undefined : allPages.length * GYM_PAGE_SIZE,
    enabled: !!userId,
  })
}
