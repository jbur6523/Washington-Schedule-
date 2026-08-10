export const activeRentalStatuses = ["active", "delivered"] as const;

export function isActiveRentalStatus(status: string) {
  return activeRentalStatuses.includes(status as (typeof activeRentalStatuses)[number]);
}
