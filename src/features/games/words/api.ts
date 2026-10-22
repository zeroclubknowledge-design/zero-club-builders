import { supabase } from "@/lib/supabase";

export type WordTerm = { term: string; meaning: string | null; context: string | null };
export type WordPack = {
  id: string;
  title: string;
  field: string;
  terms: WordTerm[];
  ai: boolean;
  visibility: "private" | "club" | "public";
  club_id: string | null;
  club_name: string | null;
  plays: number;
  created_at: string;
  mine: boolean;
  mastered: number;
  owner: { id: string; name: string; avatar_url: string | null } | null;
};
export type BankSummary = {
  total: number;
  due: number;
  mastered: number;
  learning: number;
  struggling: number;
  streak: number;
  reviewed_today: boolean;
  next_due: string | null;
};
export type DueTerm = WordTerm & { field: string | null; box: number; others: string[] };
export type BankTerm = WordTerm & { field: string | null; box: number; due_at: string; seen: number; correct: number };
export type Quota = { used: number; limit: number | null; premium: boolean };
export type WordResult = { term: string; correct: boolean; ms: number };

async function rpc<T>(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, (args || {}) as never);
  if (error) throw error;
  return data as T;
}

export const getWordPack = (id: string) => rpc<WordPack>("get_word_pack", { p_pack: id });
export const listWordPacks = (scope: "mine" | "shared" | "club", club?: string) =>
  rpc<WordPack[]>("list_word_packs", { p_scope: scope, p_club: club || null });
export const shareWordPack = (id: string, visibility: WordPack["visibility"], club?: string | null) =>
  rpc<WordPack>("share_word_pack", { p_pack: id, p_visibility: visibility, p_club: club || null });
export const recordWordResults = (pack: string | null, results: WordResult[]) =>
  rpc<BankSummary>("record_word_results", { p_pack: pack, p_results: results });
export const wordBankSummary = () => rpc<BankSummary>("word_bank_summary");
export const wordReviewDue = (limit = 12) => rpc<DueTerm[]>("word_review_due", { p_limit: limit });
export const wordBankList = () => rpc<BankTerm[]>("word_bank_list", { p_limit: 300 });
export const wordQuota = () => rpc<Quota>("word_pack_quota_status");

export type PickedTerm = { term: string; meaning?: string };
export type CreatePackResult = { id: string; ai: boolean } | { needsPick: true };

/**
 * Sends pasted text to Zero AI and saves the pack. When Zero AI isn't
 * available the server answers { needsPick: true } and the creator picks the
 * terms; sending `picked` saves a pack from those terms (no AI, no quota).
 */
export async function createPackFromText(input: { text: string; field: string; title?: string; picked?: PickedTerm[] }): Promise<CreatePackResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in to create word packs.");
  const response = await fetch("/api/zero-words/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; ai?: boolean; needsPick?: boolean; error?: string };
  if (response.ok && body.needsPick) return { needsPick: true };
  if (!response.ok || !body.id) throw new Error(body.error || "Couldn't create your word pack. Please try again.");
  return { id: body.id, ai: Boolean(body.ai) };
}

/** Words of the pasted text, with the gaps between them, for the term picker. */
export function tokenizeForPicking(text: string) {
  const parts: { word: boolean; text: string }[] = [];
  const re = /[A-Za-z0-9](?:[A-Za-z0-9'’+#.\-\/]*[A-Za-z0-9+#])?/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index || 0;
    if (at > last) parts.push({ word: false, text: text.slice(last, at) });
    parts.push({ word: true, text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ word: false, text: text.slice(last) });
  return parts;
}

/**
 * Selected words → terms. Selected words next to each other (only a space
 * between them) join into one term, e.g. "load" + "balancer".
 */
export function selectionToTerms(parts: { word: boolean; text: string }[], selected: Set<number>) {
  const terms: { term: string; start: number }[] = [];
  let current: string[] = [];
  let start = -1;
  const close = () => {
    if (current.length) terms.push({ term: current.join(" "), start });
    current = [];
    start = -1;
  };
  parts.forEach((p, i) => {
    if (p.word) {
      if (selected.has(i)) {
        if (!current.length) start = i;
        current.push(p.text);
      } else close();
    } else if (!/^[ \t]+$/.test(p.text) || p.text.length > 2) close();
  });
  close();
  const seen = new Set<string>();
  return terms.filter((t) => {
    const key = t.term.toLowerCase();
    if (seen.has(key) || t.term.length < 2 || t.term.length > 40) return false;
    seen.add(key);
    return true;
  });
}

export function wordsError(error: unknown) {
  const message = (error as { message?: string })?.message || "";
  if (/PGRST202|schema cache|does not exist/i.test(message)) return "Zero Words is being updated. Please try again shortly.";
  if (/fetch|network/i.test(message)) return "Connection interrupted. Check your internet and try again.";
  return message || "Something went wrong. Please try again.";
}

/** Letters only, upper case: how a term appears in the letter grid. */
export const gridForm = (term: string) => term.toUpperCase().replace(/[^A-Z]/g, "");

/** Same answer regardless of case, spaces or hyphens. */
export const sameTerm = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The sentence with the term blanked out, or null when it can't be found in it. */
export function blankOut(context: string | null, term: string) {
  if (!context) return null;
  const at = context.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return null;
  return { before: context.slice(0, at), after: context.slice(at + term.length) };
}

export const shuffle = <T,>(values: T[]) => {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]] as const;

/** Hide the pack's terms in a letter grid. Terms too long for the grid are left to the later stages. */
export function buildGrid(terms: string[]) {
  const forms = terms.map((t) => ({ term: t, form: gridForm(t) })).filter((t) => t.form.length >= 3);
  const longest = Math.max(8, ...forms.map((f) => f.form.length));
  const size = Math.min(13, Math.max(9, longest + 1));
  const grid: (string | null)[] = Array(size * size).fill(null);
  const placed: { term: string; form: string; path: number[] }[] = [];
  for (const { term, form } of shuffle(forms).sort((a, b) => b.form.length - a.form.length)) {
    if (form.length > size) continue;
    for (let attempt = 0; attempt < 300; attempt++) {
      const [dr, dc] = DIRS[Math.floor(Math.random() * (attempt < 150 ? 4 : 8))];
      const r = Math.floor(Math.random() * size), c = Math.floor(Math.random() * size);
      const er = r + dr * (form.length - 1), ec = c + dc * (form.length - 1);
      if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
      const cells = Array.from({ length: form.length }, (_, i) => (r + dr * i) * size + c + dc * i);
      if (cells.some((cell, i) => grid[cell] && grid[cell] !== form[i])) continue;
      cells.forEach((cell, i) => (grid[cell] = form[i]));
      placed.push({ term, form, path: cells });
      break;
    }
  }
  const alphabet = "ABCDEFGHIJKLMNOPRSTUVWY";
  const letters = grid.map((l) => l || alphabet[Math.floor(Math.random() * alphabet.length)]);
  return { size, letters, placed };
}

export function straightPath(start: number, end: number, size: number) {
  const r1 = Math.floor(start / size), c1 = start % size, r2 = Math.floor(end / size), c2 = end % size;
  const dr = r2 - r1, dc = c2 - c1;
  if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return [];
  const n = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  return Array.from({ length: n }, (_, i) => (r1 + Math.sign(dr) * i) * size + c1 + Math.sign(dc) * i);
}

/** Box → label and colour for the strength meter. */
export const STRENGTH = [
  { label: "New", color: "#ff6b8a" },
  { label: "Learning", color: "#ffb547" },
  { label: "Learning", color: "#ffd36b" },
  { label: "Getting there", color: "#8cebd1" },
  { label: "Mastered", color: "#61e6ac" },
  { label: "Mastered", color: "#61e6ac" },
];
