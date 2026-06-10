import { useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import { computeAllFFTFrames, smoothFFT } from '../utils/fft';

const NUM_BINS = 128;
const SMOOTHING = 0.75;

export interface AudioPlayerState {
  isLoaded: boolean;
  isPlaying: boolean;
  duration: number;
  position: number;
  fftData: Float32Array;
  isAnalyzing: boolean;
  analysisProgress: number;
  error: string | null;
}

export interface AudioPlayerControls {
  load: (uri: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  unload: () => Promise<void>;
}

export function useAudioPlayer(fps: number): [AudioPlayerState, AudioPlayerControls] {
  const soundRef = useRef<Audio.Sound | null>(null);
  const fftFramesRef = useRef<Float32Array[]>([]);
  const prevFFTRef = useRef<Float32Array>(new Float32Array(NUM_BINS));
  const animFrameRef = useRef<number>(0);

  const [state, setState] = useState<AudioPlayerState>({
    isLoaded: false, isPlaying: false, duration: 0, position: 0,
    fftData: new Float32Array(NUM_BINS), isAnalyzing: false,
    analysisProgress: 0, error: null,
  });

  const tick = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const posSec = (status.positionMillis ?? 0) / 1000;
    const frameIdx = Math.min(Math.floor(posSec * fps), fftFramesRef.current.length - 1);
    const rawFrame = fftFramesRef.current[frameIdx] ?? new Float32Array(NUM_BINS);
    const smoothed = smoothFFT(prevFFTRef.current, rawFrame, SMOOTHING);
    prevFFTRef.current = smoothed;
    setState(prev => ({
      ...prev,
      isPlaying: status.isPlaying,
      position: status.positionMillis ?? 0,
      duration: status.durationMillis ?? 0,
      fftData: smoothed,
    }));
    if (status.isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [fps]);

  const load = useCallback(async (uri: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setState(prev => ({ ...prev, isAnalyzing: true, analysisProgress: 0, error: null }));

      const pcmPath = FileSystem.cacheDirectory + 'audio_pcm.raw';
      const cmd = `-y -i "${uri}" -f s16le -ar 44100 -ac 1 "${pcmPath}"`;
      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();
      if (!ReturnCode.isSuccess(returnCode)) throw new Error('Gagal proses audio');

      setState(prev => ({ ...prev, analysisProgress: 0.3 }));

      const pcmBase64 = await FileSystem.readAsStringAsync(pcmPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binaryStr = atob(pcmBase64);
      const buffer = new ArrayBuffer(binaryStr.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < binaryStr.length; i++) view[i] = binaryStr.charCodeAt(i);

      setState(prev => ({ ...prev, analysisProgress: 0.6 }));

      fftFramesRef.current = computeAllFFTFrames(buffer, 44100, fps, NUM_BINS);
      prevFFTRef.current = new Float32Array(NUM_BINS);

      setState(prev => ({ ...prev, analysisProgress: 0.9 }));

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
      soundRef.current = sound;
      const status = await sound.getStatusAsync();

      setState(prev => ({
        ...prev, isLoaded: true, isAnalyzing: false, analysisProgress: 1,
        duration: status.isLoaded ? (status.durationMillis ?? 0) : 0, position: 0,
      }));
      await FileSystem.deleteAsync(pcmPath, { idempotent: true });
    } catch (e: any) {
      setState(prev => ({ ...prev, isAnalyzing: false, error: e.message ?? 'Error' }));
    }
  }, [fps]);

  const play = useCallback(async () => {
    if (!soundRef.current) return;
    await soundRef.current.playAsync();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(async () => {
    if (!soundRef.current) return;
    await soundRef.current.pauseAsync();
    cancelAnimationFrame(animFrameRef.current);
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const seek = useCallback(async (ms: number) => {
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(ms);
  }, []);

  const unload = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
    setState({ isLoaded: false, isPlaying: false, duration: 0, position: 0,
      fftData: new Float32Array(NUM_BINS), isAnalyzing: false, analysisProgress: 0, error: null });
  }, []);

  useEffect(() => () => { cancelAnimationFrame(animFrameRef.current); }, []);

  return [state, { load, play, pause, seek, unload }];
}
