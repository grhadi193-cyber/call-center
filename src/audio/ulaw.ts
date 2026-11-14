const BIAS = 0x84;
const CLIP = 32635;

export function ulawToPcm16(sample: number): number {
  const value = (~sample) & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  const magnitude = ((mantissa << 3) + BIAS) << exponent;
  return sign ? BIAS - magnitude : magnitude - BIAS;
}

export function pcm16ToUlaw(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  const magnitude = Math.min(CLIP, Math.abs(sample)) + BIAS;
  let exponent = 7;
  for (let bit = 0x4000; exponent > 0 && (magnitude & bit) === 0; bit >>= 1) exponent--;
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

export function decodeUlaw(buffer: Buffer): Int16Array {
  const output = new Int16Array(buffer.length);
  for (let index = 0; index < buffer.length; index++) output[index] = ulawToPcm16(buffer[index]!);
  return output;
}

export function encodeUlaw(samples: Int16Array): Buffer {
  const output = Buffer.allocUnsafe(samples.length);
  for (let index = 0; index < samples.length; index++) output[index] = pcm16ToUlaw(samples[index]!);
  return output;
}

/** Integer-ratio resampling for G.711 telephony audio. */
export function resamplePcm16(input: Int16Array, sourceRate: number, targetRate: number): Int16Array {
  if (sourceRate === targetRate) return input;
  if (targetRate % sourceRate === 0) {
    const factor = targetRate / sourceRate;
    const output = new Int16Array(input.length * factor);
    for (let index = 0; index < input.length; index++) output.fill(input[index]!, index * factor, (index + 1) * factor);
    return output;
  }
  if (sourceRate % targetRate === 0) {
    const factor = sourceRate / targetRate;
    const output = new Int16Array(Math.floor(input.length / factor));
    for (let index = 0; index < output.length; index++) output[index] = input[index * factor]!;
    return output;
  }
  throw new Error(`Unsupported resampling ratio ${sourceRate}:${targetRate}`);
}

export function pcm16ToBuffer(samples: Int16Array): Buffer {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}
