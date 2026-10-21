import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

type SavedMedia = { files: ({ blob: Blob; name: string; modified: number } | null)[]; previews: string[] };
let database: Promise<IDBDatabase> | undefined;
const writes = new Map<string, Promise<unknown>>();
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("zero-unfinished-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function read(key: string): Promise<SavedMedia | undefined> {
  await writes.get(key);
  const connection = await db();
  return new Promise((resolve, reject) => {
    const request = connection.transaction("drafts").objectStore("drafts").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function save(key: string, value: SavedMedia) {
  const write = (writes.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const connection = await db();
    await new Promise<void>((resolve, reject) => {
      const transaction = connection.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      if (value.files.length) store.put(value, key); else store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }).catch(() => { /* Unsupported storage or quota: keep the in-memory file. */ });
  writes.set(key, write);
  void write.finally(() => { if (writes.get(key) === write) writes.delete(key); });
}

/** Files belong in IndexedDB, not localStorage or expired blob: URLs. */
export function useDraftMedia<T extends File | null = File>(key: string | null) {
  const current = useRef({ key, files: [] as T[], previews: [] as string[], revision: 0 });
  const [, render] = useState(0);
  const restoredUrls = useRef<string[]>([]);
  if (current.current.key !== key) {
    const pending = current.current.key === null && key && current.current.revision > 0;
    current.current = pending ? { ...current.current, key } : { key, files: [], previews: [], revision: 0 };
  }
  useEffect(() => {
    let active = true;
    // A file can be selected while the signed-in profile is still loading.
    if (key && current.current.revision > 0) {
      save(key, {
        files: current.current.files.map(file => file ? { blob: file, name: file.name, modified: file.lastModified } : null),
        previews: current.current.previews.map(url => /^https?:\/\//.test(url) ? url : ""),
      });
    }
    if (key) void read(key).then(saved => {
      if (!active || !saved || current.current.key !== key || current.current.revision > 0) return;
      const files = saved.files.map(file => file ? new File([file.blob], file.name, { type: file.blob.type, lastModified: file.modified }) : null) as T[];
      const previews = files.map((file, i) => {
        if (!file) return saved.previews[i] || "";
        const url = URL.createObjectURL(file);
        restoredUrls.current.push(url);
        return url;
      });
      current.current = { key, files, previews, revision: 0 };
      render(n => n + 1);
    }).catch(() => {});
    return () => { active = false; };
  }, [key]);
  useEffect(() => () => restoredUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  const persist = useCallback(() => {
    const state = current.current;
    if (!key || state.key !== key) return;
    save(key, {
      files: state.files.map(file => file ? { blob: file, name: file.name, modified: file.lastModified } : null),
      previews: state.previews.map(url => /^https?:\/\//.test(url) ? url : ""),
    });
  }, [key]);
  const setFiles = useCallback((update: SetStateAction<T[]>) => {
    const state = current.current;
    if (state.key !== key) return;
    state.files = typeof update === "function" ? update(state.files) : update;
    state.revision++;
    persist(); render(n => n + 1);
  }, [key, persist]);
  const setPreviews = useCallback((update: SetStateAction<string[]>) => {
    const state = current.current;
    if (state.key !== key) return;
    state.previews = typeof update === "function" ? update(state.previews) : update;
    state.revision++;
    persist(); render(n => n + 1);
  }, [key, persist]);
  const clear = useCallback(() => {
    current.current = { key, files: [], previews: [], revision: current.current.revision + 1 };
    persist(); render(n => n + 1);
  }, [key, persist]);
  // Keep files and previews together. FileReader callbacks can arrive out of
  // order, or after the draft key changed while the desktop picker was open.
  const addFiles = useCallback((files: File[]) => {
    const state = current.current;
    if (state.key !== key || !files.length) return;
    const urls = files.map(file => URL.createObjectURL(file));
    restoredUrls.current.push(...urls);
    state.files = [...state.files, ...files as T[]];
    state.previews = [...state.previews, ...urls];
    state.revision++;
    persist(); render(n => n + 1);
  }, [key, persist]);
  const removeFile = useCallback((index: number) => {
    const state = current.current;
    if (state.key !== key) return;
    state.files = state.files.filter((_, i) => i !== index);
    state.previews = state.previews.filter((_, i) => i !== index);
    state.revision++;
    persist(); render(n => n + 1);
  }, [key, persist]);
  useEffect(() => {
    const visible = new Set(current.current.previews);
    restoredUrls.current = restoredUrls.current.filter(url => {
      if (visible.has(url)) return true;
      URL.revokeObjectURL(url); return false;
    });
  });
  return { files: current.current.files, previews: current.current.previews, setFiles, setPreviews, addFiles, removeFile, clear };
}
