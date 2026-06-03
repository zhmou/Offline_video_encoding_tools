import type { OutputFormat, VideoMetadata } from '@/types';
import { getEncodingPreset } from '@/lib/encodingPresets';

const videoExtensions = new Set([
  'mp4',
  'mov',
  'm4v',
  'webm',
  'mkv',
  'avi',
  'wmv',
  'flv',
  'mpeg',
  'mpg',
  '3gp',
]);

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) {
    return true;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension ? videoExtensions.has(extension) : false;
}

export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频信息，请确认文件格式受浏览器支持。'));
    };

    video.src = url;
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatDuration(seconds = 0): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--:--';
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function changeExtension(fileName: string, outputFormat: OutputFormat): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '') || 'compressed-video';
  return `${baseName}-compressed.${getEncodingPreset(outputFormat).extension}`;
}

export function mimeForFormat(outputFormat: OutputFormat): string {
  return getEncodingPreset(outputFormat).mime;
}

export function createQueueId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
