import { get, set, del, keys } from "idb-keyval";
import type { Booking, Station } from "@shared/schema";

const BOOKINGS_KEY = "cached_bookings";
const FAVORITES_KEY = "cached_favorites";
const WRITE_QUEUE_KEY = "offline_write_queue";

export async function cacheBookings(bookings: Booking[]) {
  // Only cache last 5 completed/active bookings
  const toCache = bookings.slice(0, 5);
  await set(BOOKINGS_KEY, toCache);
}

export async function getCachedBookings(): Promise<Booking[]> {
  return (await get(BOOKINGS_KEY)) || [];
}

export async function cacheFavorites(stations: Station[]) {
  await set(FAVORITES_KEY, stations);
}

export async function getCachedFavorites(): Promise<Station[]> {
  return (await get(FAVORITES_KEY)) || [];
}

export interface QueuedWrite {
  id: string;
  collection: string;
  data: any;
  timestamp: number;
}

export async function queueWrite(write: QueuedWrite) {
  const queue: QueuedWrite[] = (await get(WRITE_QUEUE_KEY)) || [];
  queue.push(write);
  await set(WRITE_QUEUE_KEY, queue);
}

export async function getWriteQueue(): Promise<QueuedWrite[]> {
  return (await get(WRITE_QUEUE_KEY)) || [];
}

export async function clearWriteQueue() {
  await del(WRITE_QUEUE_KEY);
}
