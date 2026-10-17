// アプリ版のアラーム音（android/app/src/main/res/raw/tea_chime.wav）を作る
// js/timer.js の Chime と同じ「ピン・ポン」のベル音（2秒）。Chime の音を変えたら、これも同じに直して作り直す。
// 使い方：node scripts/make-chime.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const out = new Float32Array(RATE * 2);
const bell = (freq, at) => {
  const start = Math.floor(at * RATE);
  for (let i = 0; start + i < out.length; i++) {
    const t = i / RATE;
    const env = Math.exp(-t * 3.2) * Math.min(1, t * 200);
    out[start + i] += env * (0.55 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 2.01 * t));
  }
};
bell(1318.5, 0);    // ミ
bell(1046.5, 0.4);  // ド

// 16bit モノラルの WAV
const buf = Buffer.alloc(44 + out.length * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + out.length * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(out.length * 2, 40);
out.forEach((x, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 0x7fff), 44 + i * 2));

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res', 'raw', 'tea_chime.wav');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, buf);
console.log('作りました：', file);
