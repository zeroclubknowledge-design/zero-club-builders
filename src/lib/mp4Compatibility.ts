/** Read MP4 metadata only, skipping media data even when moov is at the end. */
type Box = { type: string; start: number; payload: number; end: number };
function boxes(bytes: Uint8Array, start = 0, end = bytes.length): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Box[] = [];
  while (start < end && result.length < 10000) {
    if (start + 8 > end) throw new Error("Invalid MP4 box");
    let size = view.getUint32(start),
      header = 8;
    if (size === 1) {
      if (start + 16 > end) throw new Error("Invalid MP4 size");
      size = view.getUint32(start + 8) * 4294967296 + view.getUint32(start + 12);
      header = 16;
    } else if (size === 0) size = end - start;
    if (!Number.isSafeInteger(size) || size < header || start + size > end)
      throw new Error("Invalid MP4 bounds");
    result.push({
      type: String.fromCharCode(...bytes.subarray(start + 4, start + 8)),
      start,
      payload: start + header,
      end: start + size,
    });
    start += size;
  }
  if (start !== end) throw new Error("Too many MP4 boxes");
  return result;
}

function descriptor(b: Uint8Array, offset: number, end: number) {
  if (offset >= end) throw new Error("Missing audio descriptor");
  const tag = b[offset++];
  let size = 0,
    done = false;
  for (let i = 0; i < 4 && offset < end; i++) {
    const value = b[offset++];
    size = size * 128 + (value & 127);
    if (!(value & 128)) {
      done = true;
      break;
    }
  }
  if (!done || offset + size > end) throw new Error("Invalid audio descriptor");
  return { tag, payload: offset, end: offset + size };
}

function aacLC(b: Uint8Array, esds: Box): boolean {
  const es = descriptor(b, esds.payload + 4, esds.end);
  if (es.tag !== 3 || es.payload + 3 > es.end) return false;
  const flags = b[es.payload + 2];
  let offset = es.payload + 3;
  if (flags & 128) offset += 2;
  if (flags & 64) {
    if (offset >= es.end) return false;
    offset += 1 + b[offset];
  }
  if (flags & 32) offset += 2;
  const config = descriptor(b, offset, es.end);
  if (config.tag !== 4 || config.payload + 13 > config.end || b[config.payload] !== 0x40)
    return false;
  const audio = descriptor(b, config.payload + 13, config.end);
  if (audio.tag !== 5 || audio.payload + 2 > audio.end) return false;
  const first = b[audio.payload],
    second = b[audio.payload + 1];
  const frequency = ((first & 7) << 1) | (second >> 7),
    channels = (second >> 3) & 15;
  return first >> 3 === 2 && frequency >= 3 && frequency <= 8 && (channels === 1 || channels === 2);
}

function compatibleTracks(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Fragmented browser recordings still need remuxing into a regular MP4.
  if (boxes(b).some(box => box.type === "mvex")) return false;
  let video = 0,
    audio = 0;
  for (const track of boxes(b).filter((box) => box.type === "trak")) {
    const mdia = boxes(b, track.payload, track.end).find((box) => box.type === "mdia");
    if (!mdia) return false;
    const media = boxes(b, mdia.payload, mdia.end);
    const handler = media.find((box) => box.type === "hdlr");
    if (!handler || handler.payload + 12 > handler.end) return false;
    const kind = String.fromCharCode(...b.subarray(handler.payload + 8, handler.payload + 12));
    if (kind !== "vide" && kind !== "soun") continue;
    let parent = media.find((box) => box.type === "minf");
    if (!parent) return false;
    for (const name of ["stbl", "stsd"]) {
      parent = boxes(b, parent.payload, parent.end).find((box) => box.type === name);
      if (!parent) return false;
    }
    if (parent.payload + 8 > parent.end || view.getUint32(parent.payload + 4) !== 1) return false;
    const entries = boxes(b, parent.payload + 8, parent.end);
    if (entries.length !== 1) return false;
    const entry = entries[0];
    if (kind === "vide") {
      if (++video > 1 || entry.type !== "avc1" || entry.start + 86 > entry.end) return false;
      const width = view.getUint16(entry.start + 32),
        height = view.getUint16(entry.start + 34);
      if (!width || !height || width > 1920 || height > 1920) return false;
      const avc = boxes(b, entry.start + 86, entry.end).find((box) => box.type === "avcC");
      if (
        !avc ||
        avc.payload + 7 > avc.end ||
        b[avc.payload] !== 1 ||
        ![66, 77, 100].includes(b[avc.payload + 1]) ||
        !b[avc.payload + 3] ||
        b[avc.payload + 3] > 42
      )
        return false;
    } else {
      if (
        ++audio > 1 ||
        entry.type !== "mp4a" ||
        entry.start + 36 > entry.end ||
        view.getUint16(entry.start + 16) !== 0
      )
        return false;
      const esds = boxes(b, entry.start + 36, entry.end).find((box) => box.type === "esds");
      if (!esds || !aacLC(b, esds)) return false;
    }
  }
  return video === 1;
}

/** Unknown or malformed formats conservatively go through the real converter. */
export async function isShareableMp4(blob: Blob, signal?: AbortSignal): Promise<boolean> {
  try {
    let offset = 0,
      moov: Uint8Array | undefined,
      media = false,
      mp4 = false,
      count = 0;
    while (offset < blob.size && count++ < 10000) {
      signal?.throwIfAborted();
      const header = new Uint8Array(await blob.slice(offset, offset + 16).arrayBuffer());
      if (header.length < 8) return false;
      const view = new DataView(header.buffer);
      let size = view.getUint32(0),
        length = 8;
      if (size === 1) {
        if (header.length < 16) return false;
        size = view.getUint32(8) * 4294967296 + view.getUint32(12);
        length = 16;
      } else if (!size) size = blob.size - offset;
      if (!Number.isSafeInteger(size) || size < length || offset + size > blob.size) return false;
      const type = String.fromCharCode(...header.subarray(4, 8));
      if (type === "moof") return false;
      if (type === "ftyp")
        mp4 = size >= 16 && String.fromCharCode(...header.subarray(8, 12)) !== "qt  ";
      if (type === "mdat" && size > length) media = true;
      if (type === "moov") {
        if (moov || size > 16 * 1024 * 1024) return false;
        moov = new Uint8Array(await blob.slice(offset + length, offset + size).arrayBuffer());
      }
      offset += size;
    }
    return offset === blob.size && mp4 && media && !!moov && compatibleTracks(moov);
  } catch (error) {
    signal?.throwIfAborted();
    return false;
  }
}
