export function fft(real: number[], imag: number[]): void {
  const n = real.length;
  if (n <= 1) return;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wR = Math.cos(ang);
    const wI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let uR = 1, uI = 0;
      for (let k = 0; k < len / 2; k++) {
        const eR = real[i + k], eI = imag[i + k];
        const oR = real[i+k+len/2]*uR - imag[i+k+len/2]*uI;
        const oI = real[i+k+len/2]*uI + imag[i+k+len/2]*uR;
        real[i + k] = eR + oR;
        imag[i + k] = eI + oI;
        real[i+k+len/2] = eR - oR;
        imag[i+k+len/2] = eI - oI;
        const newUR = uR*wR - uI*wI;
        uI = uR*wI + uI*wR;
        uR = newUR;
      }
    }
  }
}

export function computeAllFFTFrames(
  pcmBuffer: ArrayBuffer,
  sampleRate: number,
  fps: number,
  numBins: number = 128
): Float32Array[] {
  const samples = new Int16Array(pcmBuffer);
  const samplesPerFrame = Math.floor(sampleRate / fps);
  const fftSize = 2048;
  const frames: Float32Array[] = [];
  for (let frameStart = 0; frameStart + fftSize < samples.length; frameStart += samplesPerFrame) {
    const real: number[] = [];
    const imag: number[] = new Array(fftSize).fill(0);
    for (let i = 0; i < fftSize; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      real.push(((samples[frameStart + i] ?? 0) / 32768) * w);
    }
    fft(real, imag);
    const magnitudes = new Float32Array(numBins);
    const binStep = Math.floor(fftSize / 2 / numBins);
    let maxMag = 0;
    for (let b = 0; b < numBins; b++) {
      let sum = 0;
      for (let k = 0; k < binStep; k++) {
        const idx = b * binStep + k;
        sum += Math.sqrt(real[idx] ** 2 + imag[idx] ** 2);
      }
      magnitudes[b] = sum / binStep;
      if (magnitudes[b] > maxMag) maxMag = magnitudes[b];
    }
    if (maxMag > 0) {
      for (let b = 0; b < numBins; b++) magnitudes[b] = Math.min(1, magnitudes[b] / maxMag);
    }
    frames.push(magnitudes);
  }
  return frames;
}

export function smoothFFT(prev: Float32Array, next: Float32Array, smoothing = 0.75): Float32Array {
  const result = new Float32Array(prev.length);
  for (let i = 0; i < prev.length; i++) {
    result[i] = prev[i] * smoothing + next[i] * (1 - smoothing);
  }
  return result;
  }
