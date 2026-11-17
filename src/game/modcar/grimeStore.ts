/**
 * The grime masks kept with the save (docs/MODCAR.md §15): localStorage holds the game (save.ts) but not
 * megabytes of texels, so each mask of a part being cleaned goes into the browser's IndexedDB, deflated (a mask
 * is mostly the same figures over and over, a few hundred kilobytes at most), under its key (the part's uid, or
 * the build's and ':body'). A part marked `grime` in the save finds its mask here; one that is not here (the
 * browser cleared it) is shown by its figures as before it was touched.
 */
const DB = 'modcar-grime';
const STORE = 'masks';

interface Kept {
  size: number;
  data: Uint8Array;
  at: number;
  /** the units come clean already (no second ding for them after a reload) */
  doneDirt?: number[];
  doneRust?: number[];
}

let opening: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

async function pack(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return data;
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function unpack(data: Uint8Array, length: number): Promise<Uint8Array> {
  if (data.length === length || typeof DecompressionStream === 'undefined') return data;
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** keep a mask's texels (RGBA, size × size), and the units come clean already */
export async function keepMask(key: string, size: number, texels: Uint8Array, done: { dirt: number[]; rust: number[] }): Promise<void> {
  const d = await db();
  if (!d) return;
  const data = await pack(texels);
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ size, data, at: Date.now(), doneDirt: done.dirt, doneRust: done.rust } satisfies Kept, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** a mask kept (null: none, or not of this size) */
export async function keptMask(key: string, size: number): Promise<{ texels: Uint8Array; doneDirt: number[]; doneRust: number[] } | null> {
  const d = await db();
  if (!d) return null;
  const k = await new Promise<Kept | null>((resolve) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as Kept | undefined) ?? null);
    r.onerror = () => resolve(null);
  });
  if (!k || k.size !== size) return null;
  const out = await unpack(k.data, size * size * 4);
  return out.length === size * size * 4 ? { texels: out, doneDirt: k.doneDirt ?? [], doneRust: k.doneRust ?? [] } : null;
}

/** forget every mask but these (the parts gone, cleaned or recycled) */
export async function keepOnly(keys: Iterable<string>): Promise<void> {
  const d = await db();
  if (!d) return;
  const want = new Set(keys);
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const r = st.getAllKeys();
    r.onsuccess = () => {
      for (const k of r.result) if (!want.has(String(k))) st.delete(k);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** a new game: every mask goes */
export async function forgetMasks(): Promise<void> {
  await keepOnly([]);
}
