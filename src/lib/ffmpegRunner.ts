import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { CompressionResult, CompressionSettings, OutputFormat, VideoMetadata } from '@/types';
import { changeExtension, mimeForFormat } from '@/lib/video';

type ProgressHandler = (progress: number) => void;

export class LocalFfmpegRunner {
  private ffmpeg: FFmpeg | null = null;
  private loading?: Promise<void>;
  private recentLogs: string[] = [];

  async compress(
    file: File,
    metadata: VideoMetadata | undefined,
    settings: CompressionSettings,
    onProgress: ProgressHandler,
  ): Promise<CompressionResult> {
    const extension = getExtension(file.name, settings.outputFormat);
    const inputName = `input-${Date.now()}.${extension}`;
    const outputName = changeExtension(file.name, settings.outputFormat);
    let ffmpeg: FFmpeg | null = null;

    this.recentLogs = [];
    try {
      ffmpeg = await this.getLoadedFfmpeg(onProgress);
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const args = buildFfmpegArgs(inputName, outputName, file, metadata, settings);
      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${exitCode}`);
      }
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const blobBytes = new Uint8Array(bytes);
      return {
        blob: new Blob([blobBytes.buffer], { type: mimeForFormat(settings.outputFormat) }),
        name: outputName,
      };
    } catch (error) {
      throw new Error(this.describeError(error));
    } finally {
      if (ffmpeg) {
        await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
      }
    }
  }

  cancel(): void {
    if (!this.ffmpeg) {
      return;
    }

    this.ffmpeg.terminate();
    this.ffmpeg = null;
    this.loading = undefined;
  }

  private async getLoadedFfmpeg(onProgress: ProgressHandler): Promise<FFmpeg> {
    if (!this.ffmpeg) {
      this.ffmpeg = new FFmpeg();
      this.ffmpeg.on('log', ({ message }) => {
        this.recentLogs.push(message);
        if (this.recentLogs.length > 40) {
          this.recentLogs.shift();
        }
      });
      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.max(0, Math.min(1, progress)));
      });
    }

    if (!this.loading) {
      this.loading = this.load(this.ffmpeg);
    }

    await this.loading;
    return this.ffmpeg;
  }

  private describeError(error: unknown): string {
    const ffmpegError = [...this.recentLogs]
      .reverse()
      .find((line) => /(error|failed|invalid|unknown|not found|encoder)/i.test(line));

    if (ffmpegError) {
      return ffmpegError;
    }

    if (error instanceof Error && error.message) {
      return `${error.name}: ${error.message}`;
    }

    const rawError = String(error);
    return rawError && rawError !== '[object Object]' ? rawError : '压缩失败，请尝试更低分辨率或更短的视频。';
  }

  private async load(ffmpeg: FFmpeg): Promise<void> {
    const baseURL = `${import.meta.env.BASE_URL}ffmpeg-core`;
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }
}

function buildFfmpegArgs(
  inputName: string,
  outputName: string,
  file: File,
  metadata: VideoMetadata | undefined,
  settings: CompressionSettings,
): string[] {
  const args = ['-i', inputName, '-map', '0:v:0'];
  const videoFilters = buildVideoFilters(metadata, settings.maxWidth);

  if (videoFilters.length > 0) {
    args.push('-vf', videoFilters.join(','));
  }

  if (settings.outputFormat === 'mp4') {
    args.push('-c:v', 'libx264', '-preset', presetForIntensity(settings.intensity), '-pix_fmt', 'yuv420p');
    appendRateArgs(args, file, metadata, settings, 'mp4');
    args.push('-movflags', '+faststart');
  } else {
    args.push('-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', cpuUsedForIntensity(settings.intensity));
    appendRateArgs(args, file, metadata, settings, 'webm');
  }

  if (settings.keepAudio) {
    args.push('-map', '0:a?');
    if (settings.outputFormat === 'mp4') {
      args.push('-c:a', 'aac', '-b:a', '96k');
    } else {
      args.push('-c:a', 'libopus', '-b:a', '96k');
    }
  } else {
    args.push('-an');
  }

  args.push('-y', outputName);
  return args;
}

function appendRateArgs(
  args: string[],
  file: File,
  metadata: VideoMetadata | undefined,
  settings: CompressionSettings,
  outputFormat: OutputFormat,
): void {
  const targetBitrate = calculateTargetVideoBitrate(file, metadata, settings);

  if (targetBitrate) {
    args.push('-b:v', `${targetBitrate}k`, '-maxrate', `${Math.round(targetBitrate * 1.35)}k`, '-bufsize', `${targetBitrate * 2}k`);
    return;
  }

  if (outputFormat === 'mp4') {
    args.push('-crf', `${crfForIntensity(settings.intensity, settings.profile)}`);
  } else {
    args.push('-crf', `${vp9CrfForIntensity(settings.intensity, settings.profile)}`, '-b:v', '0');
  }
}

function calculateTargetVideoBitrate(
  file: File,
  metadata: VideoMetadata | undefined,
  settings: CompressionSettings,
): number | null {
  if (!settings.targetSizeMb || !metadata?.duration || metadata.duration <= 0) {
    return null;
  }

  const audioKbps = settings.keepAudio ? 96 : 0;
  const targetKbits = settings.targetSizeMb * 8192 * 0.92;
  const videoKbps = Math.floor(targetKbits / metadata.duration - audioKbps);
  const sourceKbps = Math.floor((file.size * 8) / 1024 / metadata.duration);
  return Math.max(120, Math.min(videoKbps, Math.max(sourceKbps, 120)));
}

function buildVideoFilters(metadata: VideoMetadata | undefined, maxWidth: number): string[] {
  if (!metadata?.width || !maxWidth || metadata.width <= maxWidth) {
    return [];
  }

  return [`scale=${maxWidth}:-2`];
}

function getExtension(fileName: string, fallback: OutputFormat): string {
  return fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;
}

function crfForIntensity(intensity: number, profile: CompressionSettings['profile']): number {
  const offset = profile === 'quality' ? -2 : profile === 'small' ? 2 : 0;
  return clamp(Math.round(34 - intensity * 0.12 + offset), 20, 34);
}

function vp9CrfForIntensity(intensity: number, profile: CompressionSettings['profile']): number {
  const offset = profile === 'quality' ? -4 : profile === 'small' ? 4 : 0;
  return clamp(Math.round(48 - intensity * 0.18 + offset), 28, 50);
}

function presetForIntensity(intensity: number): string {
  if (intensity >= 75) {
    return 'veryfast';
  }

  if (intensity >= 45) {
    return 'fast';
  }

  return 'medium';
}

function cpuUsedForIntensity(intensity: number): string {
  if (intensity >= 75) {
    return '6';
  }

  if (intensity >= 45) {
    return '4';
  }

  return '2';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
