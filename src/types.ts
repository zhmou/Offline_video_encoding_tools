export type OutputFormat =
  | 'mp4-h264'
  | 'mp4-h265'
  | 'mov-h264'
  | 'mkv-h264'
  | 'mkv-h265'
  | 'webm-vp9'
  | 'webm-vp8';

export type QueueStatus = 'pending' | 'processing' | 'done' | 'error' | 'cancelled';

export type CompressionProfile = 'small' | 'balanced' | 'quality';

export interface CompressionSettings {
  outputFormat: OutputFormat;
  targetSizeMb: number | null;
  maxWidth: number;
  keepAudio: boolean;
  intensity: number;
  profile: CompressionProfile;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  sourceUrl: string;
  size: number;
  metadata?: VideoMetadata;
  status: QueueStatus;
  progress: number;
  error?: string;
  outputUrl?: string;
  outputBlob?: Blob;
  outputName?: string;
  outputSize?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface CompressionResult {
  blob: Blob;
  name: string;
}
