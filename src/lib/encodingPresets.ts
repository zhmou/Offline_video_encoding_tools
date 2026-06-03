import type { OutputFormat } from '@/types';

export type RateControlMode = 'x264' | 'x265' | 'vp9' | 'vp8';

export interface EncodingPreset {
  id: OutputFormat;
  label: string;
  extension: 'mp4' | 'mov' | 'mkv' | 'webm';
  mime: string;
  videoCodec: 'libx264' | 'libx265' | 'libvpx-vp9' | 'libvpx';
  audioCodec: 'aac' | 'libopus';
  rateControl: RateControlMode;
  mp4FastStart?: boolean;
  hevcTag?: boolean;
}

export const ENCODING_PRESETS: EncodingPreset[] = [
  {
    id: 'mp4-h264',
    label: 'MP4 · H.264/AAC',
    extension: 'mp4',
    mime: 'video/mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    rateControl: 'x264',
    mp4FastStart: true,
  },
  {
    id: 'mp4-h265',
    label: 'MP4 · H.265/AAC',
    extension: 'mp4',
    mime: 'video/mp4',
    videoCodec: 'libx265',
    audioCodec: 'aac',
    rateControl: 'x265',
    mp4FastStart: true,
    hevcTag: true,
  },
  {
    id: 'mov-h264',
    label: 'MOV · H.264/AAC',
    extension: 'mov',
    mime: 'video/quicktime',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    rateControl: 'x264',
    mp4FastStart: true,
  },
  {
    id: 'mkv-h264',
    label: 'MKV · H.264/AAC',
    extension: 'mkv',
    mime: 'video/x-matroska',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    rateControl: 'x264',
  },
  {
    id: 'mkv-h265',
    label: 'MKV · H.265/AAC',
    extension: 'mkv',
    mime: 'video/x-matroska',
    videoCodec: 'libx265',
    audioCodec: 'aac',
    rateControl: 'x265',
  },
  {
    id: 'webm-vp9',
    label: 'WebM · VP9/Opus',
    extension: 'webm',
    mime: 'video/webm',
    videoCodec: 'libvpx-vp9',
    audioCodec: 'libopus',
    rateControl: 'vp9',
  },
  {
    id: 'webm-vp8',
    label: 'WebM · VP8/Opus',
    extension: 'webm',
    mime: 'video/webm',
    videoCodec: 'libvpx',
    audioCodec: 'libopus',
    rateControl: 'vp8',
  },
];

const presetById = Object.fromEntries(
  ENCODING_PRESETS.map((preset) => [preset.id, preset]),
) as Record<OutputFormat, EncodingPreset>;

export function getEncodingPreset(outputFormat: OutputFormat): EncodingPreset {
  return presetById[outputFormat];
}
