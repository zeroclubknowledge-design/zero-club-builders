/**
 * Local draft for a note in progress.
 *
 * Writing a note is long-form work, and the way it gets lost is mundane: you
 * switch to another app to check something, Android reclaims the memory, and
 * the editor comes back empty. This keeps the text on the device so returning
 * picks up where you stopped.
 *
 * Deliberately local rather than a row in the database. A half-written
 * sentence is not something to sync — it belongs to the device you are typing
 * on, it should survive a crash, and it should cost nothing while you type.
 */

import { storedDraftOwner } from "./draftStorage";
const noteKey = () => `zc_note_draft:${storedDraftOwner() || "guest"}`;

export type NoteDraft = {
  title: string;
  isPaid: boolean;
  noteMode?: string;
  noteBootcampIds?: string[];
  blocks: any[];
  at: number;
};

/** Text content arrives as HTML from the editor, so tags must go before length is judged. */
export function stripHtml(value: string): string {
  return (value || "").replace(/<[^>]*>?/gm, "");
}

export function readNoteDraft(): NoteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const key = noteKey();
    const raw = localStorage.getItem(key) || localStorage.getItem("zc_note_draft");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NoteDraft;
    if (!parsed || typeof parsed.at !== "number") {
      localStorage.removeItem(key);
      return null;
    }
    if (!Array.isArray(parsed.blocks)) return null;
    localStorage.setItem(key, JSON.stringify(parsed));
    localStorage.removeItem("zc_note_draft");
    return parsed;
  } catch {
    // Corrupt or unreadable storage must never stop the editor opening.
    return null;
  }
}

export function writeNoteDraft(draft: NoteDraft): void {
  try {
    localStorage.setItem(noteKey(), JSON.stringify(draft));
  } catch {
    /* quota or private mode — losing the draft is bad, breaking typing is worse */
  }
}

export function clearNoteDraft(): void {
  try {
    localStorage.removeItem(noteKey());
    localStorage.removeItem("zc_note_draft");
  } catch {
    /* nothing to do */
  }
}
