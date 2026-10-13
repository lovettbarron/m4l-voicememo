'use strict';
const fs = require('fs');

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

function parseHeader(fd) {
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  const chunk = Buffer.alloc(8);
  let pos = 12;
  let fmt = null;
  while (fs.readSync(fd, chunk, 0, 8, pos) === 8) {
    const id = chunk.toString('ascii', 0, 4);
    const size = chunk.readUInt32LE(4);
    if (id === 'fmt ') {
      const b = Buffer.alloc(size);
      fs.readSync(fd, b, 0, size, pos + 8);
      let format = b.readUInt16LE(0);
      if (format === FORMAT_EXTENSIBLE && size >= 26) format = b.readUInt16LE(24);
      fmt = { format, channels: b.readUInt16LE(2), sampleRate: b.readUInt32LE(4), bitsPerSample: b.readUInt16LE(14) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk');
      return { ...fmt, dataOffset: pos + 8, dataSize: size };
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error('WAV has no data chunk');
}

function sampleReader(format, bits) {
  if (format === FORMAT_FLOAT && bits === 32) return (b, o) => b.readFloatLE(o);
  if (format !== FORMAT_PCM) throw new Error(`unsupported WAV format ${format}`);
  if (bits === 16) return (b, o) => b.readInt16LE(o) / 32768;
  if (bits === 24) return (b, o) => b.readIntLE(o, 3) / 8388608;
  if (bits === 32) return (b, o) => b.readInt32LE(o) / 2147483648;
  throw new Error(`unsupported bit depth ${bits}`);
}

function decode(buf, h, frames) {
  const bytes = h.bitsPerSample / 8;
  const read = sampleReader(h.format, h.bitsPerSample);
  const out = Array.from({ length: h.channels }, () => new Float32Array(frames));
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < h.channels; c++, o += bytes) out[c][i] = read(buf, o);
  }
  return out;
}

function readRange(path, startS, endS) {
  const fd = fs.openSync(path, 'r');
  try {
    const h = parseHeader(fd);
    const frameBytes = (h.channels * h.bitsPerSample) / 8;
    const total = Math.floor(h.dataSize / frameBytes);
    const s = Math.max(0, Math.min(total, Math.floor(startS * h.sampleRate)));
    const e = endS === Infinity ? total : Math.max(s, Math.min(total, Math.round(endS * h.sampleRate)));
    const frames = e - s;
    const buf = Buffer.alloc(frames * frameBytes);
    if (frames > 0) fs.readSync(fd, buf, 0, buf.length, h.dataOffset + s * frameBytes);
    return { sampleRate: h.sampleRate, channels: decode(buf, h, frames) };
  } finally {
    fs.closeSync(fd);
  }
}

function read(path) {
  return readRange(path, 0, Infinity);
}

function writeHeader(buf, nch, sampleRate, bitDepth, dataSize) {
  const bytes = bitDepth / 8;
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(FORMAT_PCM, 20);
  buf.writeUInt16LE(nch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * nch * bytes, 28);
  buf.writeUInt16LE(nch * bytes, 32);
  buf.writeUInt16LE(bitDepth, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
}

function write(path, audio, { bitDepth = 24 } = {}) {
  if (bitDepth !== 16 && bitDepth !== 24) throw new Error(`unsupported bit depth ${bitDepth}`);
  const { sampleRate, channels } = audio;
  const nch = channels.length;
  const frames = nch ? channels[0].length : 0;
  const bytes = bitDepth / 8;
  const dataSize = frames * nch * bytes;
  const buf = Buffer.alloc(44 + dataSize);
  writeHeader(buf, nch, sampleRate, bitDepth, dataSize);
  const max = bitDepth === 16 ? 32767 : 8388607;
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++, o += bytes) {
      const v = Math.round(Math.max(-1, Math.min(1, channels[c][i])) * max);
      if (bitDepth === 16) buf.writeInt16LE(v, o);
      else buf.writeIntLE(v, o, 3);
    }
  }
  fs.writeFileSync(path, buf);
}

function processAudio(audio, { fadeMs = 5, normalize = false, targetDb = -1 } = {}) {
  const channels = audio.channels.map((ch) => Float32Array.from(ch));
  const n = channels.length ? channels[0].length : 0;
  const fade = Math.min(Math.floor(n / 2), Math.round((audio.sampleRate * fadeMs) / 1000));
  let gain = 1;
  if (normalize) {
    let peak = 0;
    for (const ch of channels) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]));
    if (peak > 0) gain = Math.pow(10, targetDb / 20) / peak;
  }
  for (const ch of channels) {
    if (gain !== 1) for (let i = 0; i < n; i++) ch[i] *= gain;
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      ch[i] *= g;
      ch[n - 1 - i] *= g;
    }
  }
  return { sampleRate: audio.sampleRate, channels };
}

// Same result as write(dst, process(readRange(src, start, end), opts)), but streamed in
// fixed-size chunks so memory stays flat for hour-long windows.
function copyRange(src, dst, startS, endS, { fadeMs = 5, normalize = false, targetDb = -1, chunkFrames = 65536 } = {}) {
  const fd = fs.openSync(src, 'r');
  let out = null;
  try {
    const h = parseHeader(fd);
    const inBytes = h.bitsPerSample / 8;
    const frameBytes = h.channels * inBytes;
    const read = sampleReader(h.format, h.bitsPerSample);
    const total = Math.floor(h.dataSize / frameBytes);
    const s = Math.max(0, Math.min(total, Math.floor(startS * h.sampleRate)));
    const e = endS === Infinity ? total : Math.max(s, Math.min(total, Math.round(endS * h.sampleRate)));
    const n = e - s;
    const inBuf = Buffer.alloc(Math.min(n, chunkFrames) * frameBytes || 1);
    const eachChunk = (fn) => {
      for (let off = 0; off < n; off += chunkFrames) {
        const frames = Math.min(chunkFrames, n - off);
        fs.readSync(fd, inBuf, 0, frames * frameBytes, h.dataOffset + (s + off) * frameBytes);
        fn(off, frames);
      }
    };

    let gain = 1;
    if (normalize) {
      let peak = 0;
      eachChunk((off, frames) => {
        for (let o = 0; o < frames * frameBytes; o += inBytes) peak = Math.max(peak, Math.abs(read(inBuf, o)));
      });
      if (peak > 0) gain = Math.fround(Math.pow(10, targetDb / 20) / peak);
    }

    const fade = Math.min(Math.floor(n / 2), Math.round((h.sampleRate * fadeMs) / 1000));
    const outBytes = 3;
    const outBuf = Buffer.alloc(Math.min(n, chunkFrames) * h.channels * outBytes || 1);
    const header = Buffer.alloc(44);
    writeHeader(header, h.channels, h.sampleRate, 24, n * h.channels * outBytes);
    out = fs.openSync(dst, 'w');
    fs.writeSync(out, header);
    eachChunk((off, frames) => {
      let o = 0;
      let w = 0;
      for (let i = 0; i < frames; i++) {
        const idx = off + i;
        const g = idx < fade ? idx / fade : idx >= n - fade ? (n - 1 - idx) / fade : 1;
        for (let c = 0; c < h.channels; c++, o += inBytes, w += outBytes) {
          // Float32 rounding at each step mirrors process() exactly.
          const v = Math.fround(Math.fround(read(inBuf, o) * gain) * g);
          outBuf.writeIntLE(Math.round(Math.max(-1, Math.min(1, v)) * 8388607), w, 3);
        }
      }
      fs.writeSync(out, outBuf, 0, w);
    });
  } finally {
    fs.closeSync(fd);
    if (out !== null) fs.closeSync(out);
  }
  return dst;
}

module.exports = { read, readRange, write, copyRange, process: processAudio, parseHeader };
