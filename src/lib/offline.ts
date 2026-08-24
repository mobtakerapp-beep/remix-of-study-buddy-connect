import type { LessonPackage } from "./lesson-types";

export type OfflineLesson = {
  id: string;
  title: string;
  package: LessonPackage;
  savedAt: string;
};

const KEY = "offline-lessons-v1";
const LIMIT = 30;

function read(): OfflineLesson[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OfflineLesson[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: OfflineLesson[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, LIMIT)));
  } catch {
    /* storage full — ignore */
  }
}

export function listOfflineLessons(): OfflineLesson[] {
  return read().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export function getOfflineLesson(id: string): OfflineLesson | null {
  return read().find((l) => l.id === id) ?? null;
}

/** Store a lesson (and its quiz) on the device so it works with no connection. */
export function saveOfflineLesson(lesson: {
  id: string;
  title: string;
  package: LessonPackage;
}): void {
  const items = read().filter((l) => l.id !== lesson.id);
  items.unshift({ ...lesson, savedAt: new Date().toISOString() });
  write(items);
}

export function removeOfflineLesson(id: string): void {
  write(read().filter((l) => l.id !== id));
}

export function useIsOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
