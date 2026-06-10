import * as FileSystem from 'expo-file-system';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import * as MediaLibrary from 'expo-media-library';

export interface ExportOptions {
  audioUri: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  onProgress: (progress: number) => void;
  onDone: (outputUri: string) => void;
  onError: (msg: string) => void;
}

export class VideoExporter {
  private framesDir: string;
  private frameIndex = 0;
  private options: ExportOptions;
  private aborted = false;

  constructor(options: ExportOptions) {
    this.options = options;
    this.framesDir = FileSystem.cacheDirectory + `frames_${Date.now()}/`;
  }

  async init() {
    await FileSystem.makeDirectoryAsync(this.framesDir, { intermediates: true });
  }

  async saveFrame(base64Jpeg: string) {
    if (this.aborted) return;
    const path = this.framesDir + `frame_${String(this.frameIndex).padStart(6, '0')}.jpg`;
    await FileSystem.writeAsStringAsync(path, base64Jpeg, {
      encoding: FileSystem.EncodingType.Base64,
    });
    this.frameIndex++;
    this.options.onProgress(
      Math.min(0.8, this.frameIndex / ((this.options.durationMs / 1000) * this.options.fps))
    );
  }

  async encode() {
    if (this.aborted) return;
    const outputPath = FileSystem.cacheDirectory + `visualbeat_${Date.now()}.mp4`;
    const cmd = [
      '-y',
      `-framerate ${this.options.fps}`,
      `-i "${this.framesDir}frame_%06d.jpg"`,
      `-i "${this.options.audioUri}"`,
      `-c:v libx264 -preset ultrafast -crf 23`,
      `-vf scale=${this.options.width}:${this.options.height}`,
      `-c:a aac -b:a 192k -shortest`,
      `-movflags +faststart`,
      `"${outputPath}"`,
    ].join(' ');
    this.options.onProgress(0.85);
    const session = await FFmpegKit.execute(cmd);
    const returnCode = await session.getReturnCode();
    if (!ReturnCode.isSuccess(returnCode)) {
      const logs = await session.getAllLogsAsString();
      this.options.onError('Export gagal: ' + logs.slice(-300));
      return;
    }
    this.options.onProgress(0.95);
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') await MediaLibrary.saveToLibraryAsync(outputPath);
    this.options.onProgress(1);
    this.options.onDone(outputPath);
    await FileSystem.deleteAsync(this.framesDir, { idempotent: true });
  }

  abort() {
    this.aborted = true;
    FFmpegKit.cancel();
  }
}
