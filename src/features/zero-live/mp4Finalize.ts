/*
 * Instant MP4 finishing for live recordings.
 *
 * A browser records MP4 in a "fragmented" layout: a small index (moof) before
 * every few seconds of video, because it can never go back and write one
 * index at the end. It is a real MP4, but some apps (WhatsApp, some galleries)
 * show no length, can't seek, or refuse it.
 *
 * This does what a desktop recorder does when you press Stop: it writes ONE
 * standard index (moov) for the whole recording, at the front of the file.
 * Nothing is converted or re-encoded. The audio and video data stay exactly
 * where they are: the new file is built from slices of the original Blob,
 * which the browser keeps on disk, so even a 3-hour class finishes in a couple
 * of seconds and is never loaded into memory.
 *
 * If anything about the file is unexpected, it throws and the caller saves the
 * original recording as it is.
 */

type Range = { start: number; header: number; end: number; type: string };

/** One sample (frame or audio packet) in the original file. */
type Sample = { offset: number; size: number; duration: number; sync: boolean; cto: number };
type Chunk = { offset: number; count: number };

type Track = {
  id: number;
  trak: Uint8Array; // the original trak box
  timescale: number;
  isVideo: boolean;
  defaults: { duration: number; size: number; flags: number };
  sizes: number[];
  durations: number[];
  syncs: number[]; // 1-based sample numbers of keyframes
  ctos: number[];
  anyCto: boolean;
  anyNonSync: boolean;
  chunks: Chunk[];
  /** Decode time reached so far, and where the track starts (for A/V sync). */
  clock: number;
  start: number | null;
};

const text = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

async function readRange(blob: Blob, start: number, end: number) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** Top-level boxes, reading only their 16-byte headers. */
async function topLevel(blob: Blob): Promise<Range[]> {
  const out: Range[] = [];
  let offset = 0;
  while (offset < blob.size) {
    if (out.length > 2_000_000) throw new Error("Too many boxes");
    const head = await readRange(blob, offset, Math.min(blob.size, offset + 16));
    if (head.length < 8) throw new Error("Truncated box header");
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let size = view.getUint32(0);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) throw new Error("Truncated large box");
      size = view.getUint32(8) * 2 ** 32 + view.getUint32(12);
      header = 16;
    } else if (size === 0) {
      size = blob.size - offset;
    }
    if (size < header || offset + size > blob.size) {
      // A recording cut off mid-write: keep everything before the broken box.
      if (out.length) break;
      throw new Error("Invalid box size");
    }
    out.push({ start: offset, header, end: offset + size, type: text(head, 4) });
    offset += size;
  }
  return out;
}

/** Child boxes inside a box's payload (bytes already in memory). */
function children(bytes: Uint8Array, start: number, end: number): Range[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Range[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) throw new Error("Invalid child box");
    out.push({ start: offset, header, end: offset + size, type: text(bytes, offset + 4) });
    offset += size;
  }
  return out;
}

const find = (list: Range[], type: string) => list.find((b) => b.type === type);
const must = (box: Range | undefined, what: string) => {
  if (!box) throw new Error(`Missing ${what}`);
  return box;
};

/* ── writing ── */
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; };
const u64 = (n: number) => { const b = new Uint8Array(8); const v = new DataView(b.buffer); v.setUint32(0, Math.floor(n / 2 ** 32)); v.setUint32(4, n >>> 0); return b; };
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
function concat(parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function box(type: string, ...parts: Uint8Array[]) {
  const body = concat(parts);
  return concat([u32(body.length + 8), ascii(type), body]);
}
function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]) {
  return box(type, u32((version << 24) | (flags & 0xffffff)), ...parts);
}
/** A table of fixed-width rows, written straight into one buffer. */
function table(type: string, version: number, rows: number, width: number, fill: (view: DataView, at: number, row: number) => void) {
  const body = new Uint8Array(8 + rows * width);
  const view = new DataView(body.buffer);
  view.setUint32(0, version << 24);
  view.setUint32(4, rows);
  for (let i = 0; i < rows; i++) fill(view, 8 + i * width, i);
  return box(type, body);
}

/** Copies a version-0/1 box and replaces its duration field. */
function patchDuration(bytes: Uint8Array, r: Range, kind: "mvhd" | "mdhd" | "tkhd", duration: number) {
  const out = bytes.slice(r.start, r.end);
  const view = new DataView(out.buffer);
  const base = r.header;
  const version = out[base];
  // After version/flags: mvhd/mdhd: creation, modification, timescale, duration.
  //                       tkhd: creation, modification, track_ID, reserved, duration.
  const at = version === 1
    ? base + 4 + 8 + 8 + 4 + (kind === "tkhd" ? 4 : 0)
    : base + 4 + 4 + 4 + 4 + (kind === "tkhd" ? 4 : 0);
  if (version === 1) {
    view.setUint32(at, Math.floor(duration / 2 ** 32));
    view.setUint32(at + 4, duration >>> 0);
  } else {
    view.setUint32(at, Math.min(duration, 0xffffffff));
  }
  return out;
}
const timescaleOf = (bytes: Uint8Array, r: Range) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = r.start + r.header;
  return bytes[base] === 1 ? view.getUint32(base + 4 + 8 + 8) : view.getUint32(base + 4 + 4 + 4);
};

/** True when the recording is a fragmented MP4 that needs a single index. */
export async function isFragmentedMp4(blob: Blob) {
  try {
    const boxes = await topLevel(blob);
    return boxes.some((b) => b.type === "moof") && boxes.some((b) => b.type === "moov");
  } catch {
    return false;
  }
}

/**
 * Rewrites a fragmented MP4 recording as a standard one (single index at the
 * front, "fast start"). Returns the original Blob if it isn't fragmented.
 */
export async function finalizeMp4(input: Blob): Promise<Blob> {
  const top = await topLevel(input);
  const moovRange = find(top, "moov");
  if (!moovRange || !top.some((b) => b.type === "moof")) return input;

  const moov = await readRange(input, moovRange.start, moovRange.end);
  const moovKids = children(moov, moovRange.header, moov.length);
  const mvhd = must(find(moovKids, "mvhd"), "mvhd");
  const movieTimescale = timescaleOf(moov, mvhd) || 1000;
  const mvex = find(moovKids, "mvex");
  const trex = new Map<number, Track["defaults"]>();
  if (mvex) {
    const view = new DataView(moov.buffer);
    for (const t of children(moov, mvex.start + mvex.header, mvex.end).filter((b) => b.type === "trex")) {
      const p = t.start + t.header;
      trex.set(view.getUint32(p + 4), { duration: view.getUint32(p + 12), size: view.getUint32(p + 16), flags: view.getUint32(p + 20) });
    }
  }

  const tracks = new Map<number, Track>();
  for (const t of moovKids.filter((b) => b.type === "trak")) {
    const kids = children(moov, t.start + t.header, t.end);
    const tkhd = must(find(kids, "tkhd"), "tkhd");
    const p = tkhd.start + tkhd.header;
    const view = new DataView(moov.buffer);
    const id = moov[p] === 1 ? view.getUint32(p + 4 + 16) : view.getUint32(p + 4 + 8);
    const mdia = must(find(kids, "mdia"), "mdia");
    const mdiaKids = children(moov, mdia.start + mdia.header, mdia.end);
    const mdhd = must(find(mdiaKids, "mdhd"), "mdhd");
    const hdlr = must(find(mdiaKids, "hdlr"), "hdlr");
    const handler = text(moov, hdlr.start + hdlr.header + 8);
    tracks.set(id, {
      id,
      trak: moov.subarray(t.start, t.end),
      timescale: timescaleOf(moov, mdhd),
      isVideo: handler === "vide",
      defaults: trex.get(id) || { duration: 0, size: 0, flags: 0 },
      sizes: [], durations: [], syncs: [], ctos: [], anyCto: false, anyNonSync: false, chunks: [], clock: 0, start: null,
    });
  }
  if (!tracks.size) throw new Error("No tracks");

  // Walk every fragment and collect its samples.
  const mdats = top.filter((b) => b.type === "mdat");
  // Only complete fragments: an index followed by its media. A recording cut
  // off mid-write (crash, flat battery) keeps everything before the cut.
  const complete = top.filter((b, i) => b.type === "moof" && top[i + 1]?.type === "mdat");
  if (!complete.length) throw new Error("No complete fragments");
  for (const frag of complete) {
    const moof = await readRange(input, frag.start, frag.end);
    const view = new DataView(moof.buffer);
    for (const traf of children(moof, frag.header, moof.length).filter((b) => b.type === "traf")) {
      const kids = children(moof, traf.start + traf.header, traf.end);
      const tfhd = must(find(kids, "tfhd"), "tfhd");
      let p = tfhd.start + tfhd.header;
      const tfFlags = view.getUint32(p) & 0xffffff;
      const track = tracks.get(view.getUint32(p + 4));
      if (!track) throw new Error("Fragment for an unknown track");
      p += 8;
      let base = frag.start; // default-base-is-moof (and the spec's default for the first run)
      if (tfFlags & 0x1) { base = view.getUint32(p) * 2 ** 32 + view.getUint32(p + 4); p += 8; }
      if (tfFlags & 0x2) p += 4; // sample description index (one description per track here)
      const defDuration = tfFlags & 0x8 ? view.getUint32((p += 4) - 4) : track.defaults.duration;
      const defSize = tfFlags & 0x10 ? view.getUint32((p += 4) - 4) : track.defaults.size;
      const defFlags = tfFlags & 0x20 ? view.getUint32((p += 4) - 4) : track.defaults.flags;

      /* Each fragment says when it really starts (tfdt). Browsers often leave
         the last frame of a fragment a little short, so the next fragment's
         start is the truth: stretch the previous frame to meet it. Ignoring
         this lets sound and picture drift apart over a long class. */
      const tfdt = find(kids, "tfdt");
      if (tfdt) {
        const t0 = tfdt.start + tfdt.header;
        const decodeTime = moof[t0] === 1 ? view.getUint32(t0 + 4) * 2 ** 32 + view.getUint32(t0 + 8) : view.getUint32(t0 + 4);
        if (track.start === null) {
          track.start = decodeTime;
          track.clock = decodeTime;
        } else if (decodeTime !== track.clock && track.durations.length) {
          const last = track.durations.length - 1;
          const fixed = Math.max(1, track.durations[last] + (decodeTime - track.clock));
          track.clock += fixed - track.durations[last];
          track.durations[last] = fixed;
        }
      } else if (track.start === null) {
        track.start = 0;
      }

      let cursor = base;
      for (const trun of kids.filter((b) => b.type === "trun")) {
        let q = trun.start + trun.header;
        const version = moof[q];
        const flags = view.getUint32(q) & 0xffffff;
        const count = view.getUint32(q + 4);
        q += 8;
        let dataStart = cursor;
        if (flags & 0x1) { dataStart = base + view.getInt32(q); q += 4; }
        let firstFlags: number | null = null;
        if (flags & 0x4) { firstFlags = view.getUint32(q); q += 4; }
        let offset = dataStart;
        for (let i = 0; i < count; i++) {
          const duration = flags & 0x100 ? view.getUint32((q += 4) - 4) : defDuration;
          const size = flags & 0x200 ? view.getUint32((q += 4) - 4) : defSize;
          const sampleFlags = flags & 0x400 ? view.getUint32((q += 4) - 4) : i === 0 && firstFlags !== null ? firstFlags : defFlags;
          let cto = 0;
          if (flags & 0x800) { cto = version === 0 ? view.getUint32(q) : view.getInt32(q); q += 4; }
          const sync = !(sampleFlags & 0x10000);
          track.sizes.push(size);
          track.durations.push(duration);
          track.clock += duration;
          track.ctos.push(cto);
          if (cto) track.anyCto = true;
          if (sync) track.syncs.push(track.sizes.length); else track.anyNonSync = true;
          offset += size;
        }
        if (count) track.chunks.push({ offset: dataStart, count });
        cursor = offset;
      }
    }
  }

  // Map original file offsets to the new mdat (all original media data, in order).
  const mdatParts = mdats.map((m) => ({ from: m.start + m.header, to: m.end }));
  let running = 0;
  const mdatIndex = mdatParts.map((m) => { const at = running; running += m.to - m.from; return { ...m, at }; });
  const mediaBytes = running;
  const relative = (offset: number, size: number) => {
    // Binary search for the mdat holding this byte range.
    let lo = 0, hi = mdatIndex.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const m = mdatIndex[mid];
      if (offset < m.from) hi = mid - 1;
      else if (offset >= m.to) lo = mid + 1;
      else {
        if (offset + size > m.to) throw new Error("Sample data crosses a box boundary");
        return m.at + (offset - m.from);
      }
    }
    throw new Error("Sample data outside the media boxes");
  };
  for (const track of tracks.values()) {
    let i = 0;
    for (const chunk of track.chunks) {
      let bytes = 0;
      for (let k = 0; k < chunk.count; k++) bytes += track.sizes[i + k];
      chunk.offset = relative(chunk.offset, bytes);
      i += chunk.count;
    }
  }

  // Build the new index. co64 offsets are fixed width, so its size doesn't
  // depend on where the media lands; offsets get the final base added after.
  const buildMoov = (mediaStart: number) => {
    let movieDuration = 0;
    const traks: Uint8Array[] = [];
    for (const track of tracks.values()) {
      const n = track.sizes.length;
      if (!n) continue;
      const mediaDuration = track.durations.reduce((a, b) => a + b, 0);
      const inMovie = Math.round((mediaDuration * movieTimescale) / (track.timescale || 1));
      movieDuration = Math.max(movieDuration, inMovie);

      const kids = children(track.trak, 8, track.trak.length);
      const mdia = must(find(kids, "mdia"), "mdia");
      const mdiaKids = children(track.trak, mdia.start + mdia.header, mdia.end);
      const minf = must(find(mdiaKids, "minf"), "minf");
      const minfKids = children(track.trak, minf.start + minf.header, minf.end);
      const stbl = must(find(minfKids, "stbl"), "stbl");
      const stblKids = children(track.trak, stbl.start + stbl.header, stbl.end);
      const stsd = must(find(stblKids, "stsd"), "stsd");

      // stts: runs of equal durations.
      const stts: [number, number][] = [];
      for (const d of track.durations) {
        const last = stts[stts.length - 1];
        if (last && last[1] === d) last[0]++; else stts.push([1, d]);
      }
      const ctts: [number, number][] = [];
      if (track.anyCto) for (const c of track.ctos) {
        const last = ctts[ctts.length - 1];
        if (last && last[1] === c) last[0]++; else ctts.push([1, c]);
      }
      const stsc: [number, number][] = [];
      track.chunks.forEach((c, i) => {
        if (!stsc.length || stsc[stsc.length - 1][1] !== c.count) stsc.push([i + 1, c.count]);
      });

      const stblBox = box("stbl",
        track.trak.subarray(stsd.start, stsd.end),
        table("stts", 0, stts.length, 8, (v, at, r) => { v.setUint32(at, stts[r][0]); v.setUint32(at + 4, stts[r][1]); }),
        ...(ctts.length ? [table("ctts", 1, ctts.length, 8, (v, at, r) => { v.setUint32(at, ctts[r][0]); v.setInt32(at + 4, ctts[r][1]); })] : []),
        ...(track.isVideo && track.anyNonSync ? [table("stss", 0, track.syncs.length, 4, (v, at, r) => v.setUint32(at, track.syncs[r]))] : []),
        table("stsc", 0, stsc.length, 12, (v, at, r) => { v.setUint32(at, stsc[r][0]); v.setUint32(at + 4, stsc[r][1]); v.setUint32(at + 8, 1); }),
        (() => {
          // stsz: version/flags, sample_size = 0, count, then sizes.
          const body = new Uint8Array(12 + n * 4);
          const v = new DataView(body.buffer);
          v.setUint32(8, n);
          for (let i = 0; i < n; i++) v.setUint32(12 + i * 4, track.sizes[i]);
          return box("stsz", body);
        })(),
        table("co64", 0, track.chunks.length, 8, (v, at, r) => {
          const o = mediaStart + track.chunks[r].offset;
          v.setUint32(at, Math.floor(o / 2 ** 32)); v.setUint32(at + 4, o >>> 0);
        }),
      );
      const minfBox = box("minf", ...minfKids.filter((k) => k.type !== "stbl").map((k) => track.trak.subarray(k.start, k.end)), stblBox);
      const mdiaBox = box("mdia",
        ...mdiaKids.map((k) =>
          k.type === "mdhd" ? patchDuration(track.trak, k, "mdhd", mediaDuration)
            : k.type === "minf" ? minfBox
            : track.trak.subarray(k.start, k.end)),
      );
      const tkhd = must(find(kids, "tkhd"), "tkhd");
      // A track whose first frame comes later than 0 keeps that delay (edit list).
      const delay = Math.round(((track.start || 0) * movieTimescale) / (track.timescale || 1));
      const edts = delay > 0
        ? [box("edts", fullBox("elst", 1, 0,
            u32(2),
            // 1) nothing for `delay`  (media_time -1 = empty edit), rate 1.0
            u64(delay), new Uint8Array(8).fill(0xff), u32(0x0001_0000),
            // 2) then the whole track from its first sample, rate 1.0
            u64(inMovie), u64(0), u32(0x0001_0000)))]
        : [];
      movieDuration = Math.max(movieDuration, inMovie + delay);
      traks.push(box("trak",
        patchDuration(track.trak, tkhd, "tkhd", inMovie + delay),
        ...edts,
        // Edit lists from the fragmented file describe an empty timeline; drop them.
        ...kids.filter((k) => k.type !== "tkhd" && k.type !== "mdia" && k.type !== "edts").map((k) => track.trak.subarray(k.start, k.end)),
        mdiaBox,
      ));
    }
    if (!traks.length) throw new Error("No samples recorded");
    return box("moov", patchDuration(moov, mvhd, "mvhd", movieDuration), ...traks);
  };

  const ftyp = box("ftyp", ascii("isom"), u32(0x200), ascii("isom"), ascii("iso2"), ascii("iso6"), ascii("mp41"));
  const draft = buildMoov(0);
  const mediaStart = ftyp.length + draft.length + 16; // 16-byte (64-bit) mdat header
  const finalMoov = buildMoov(mediaStart);
  if (finalMoov.length !== draft.length) throw new Error("Index size changed");
  const mdatHeader = concat([u32(1), ascii("mdat"), u64(mediaBytes + 16)]);

  return new Blob(
    [ftyp, finalMoov, mdatHeader, ...mdatParts.map((m) => input.slice(m.from, m.to))],
    { type: input.type.startsWith("audio/") ? "audio/mp4" : "video/mp4" },
  );
}
