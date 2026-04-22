const inFlightChatRequestsByUser = new Map<string, number>();

export function markUserChatRequestStarted(userId: string): void {
  if (!userId) return;
  inFlightChatRequestsByUser.set(userId, (inFlightChatRequestsByUser.get(userId) || 0) + 1);
}

export function markUserChatRequestFinished(userId: string): void {
  if (!userId) return;
  const cur = inFlightChatRequestsByUser.get(userId) || 0;
  if (cur <= 1) inFlightChatRequestsByUser.delete(userId);
  else inFlightChatRequestsByUser.set(userId, cur - 1);
}

export function getInFlightChatRequestsForUser(userId: string): number {
  if (!userId) return 0;
  return inFlightChatRequestsByUser.get(userId) || 0;
}
