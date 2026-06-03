export type RateControlMode = 'x264' | 'x265' | 'vp9' | 'vp8';

export interface EncodingPresetDefinition {
  id: string;
  containerLabel: string;
  codecLabel: string;
  extension: 'mp4' | 'mov' | 'mkv' | 'webm';
  mime: string;
  videoCodec: 'libx264' | 'libx265' | 'libvpx-vp9' | 'libvpx';
  audioCodec: 'aac' | 'libopus';
  rateControl: RateControlMode;
  mp4FastStart?: boolean;
  hevcTag?: boolean;
}

export const ENCODING_PRESETS = [
  {
    id: 'mp4-h264',
    containerLabel: 'MP4',
    codecLabel: 'H.264/AAC',
    extension: 'mp4',
    mime: 'video/mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    rateControl: 'x264',
    mp4FastStart: true,
  },
  {
    id: 'mp4-h265',
    containerLabel: 'MP4',
    codecLabel: 'H.265/AAC',
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
    containerLabel: 'MOV',
    codecLabel: 'H.264/AAC',
    extension: 'mov',
    mime: 'video/quicktime',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    rateControl: 'x264',
    mp4FastStart: true,
  },
  {
    id: 'mkv-h264',
    containerLabel: 'MKV',
    codecLabel: 'H.264/AAC',
    extension: 'mkv',
    mime: 'video/x-matroska',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    rateControl: 'x264',
  },
  {
    id: 'mkv-h265',
    containerLabel: 'MKV',
    codecLabel: 'H.265/AAC',
    extension: 'mkv',
    mime: 'video/x-matroska',
    videoCodec: 'libx265',
    audioCodec: 'aac',
    rateControl: 'x265',
  },
  {
    id: 'webm-vp9',
    containerLabel: 'WebM',
    codecLabel: 'VP9/Opus',
    extension: 'webm',
    mime: 'video/webm',
    videoCodec: 'libvpx-vp9',
    audioCodec: 'libopus',
    rateControl: 'vp9',
  },
  {
    id: 'webm-vp8',
    containerLabel: 'WebM',
    codecLabel: 'VP8/Opus',
    extension: 'webm',
    mime: 'video/webm',
    videoCodec: 'libvpx',
    audioCodec: 'libopus',
    rateControl: 'vp8',
  },
] as const satisfies readonly EncodingPresetDefinition[];

export type OutputFormat = (typeof ENCODING_PRESETS)[number]['id'];
export type OutputContainer = (typeof ENCODING_PRESETS)[number]['extension'];
export type EncodingPreset = EncodingPresetDefinition & { id: OutputFormat };
export const DEFAULT_OUTPUT_FORMAT: OutputFormat = ENCODING_PRESETS[0].id;
export const OUTPUT_CONTAINERS = ENCODING_PRESETS.reduce<Array<{ id: OutputContainer; label: string }>>(
  (containers, preset) => {
    if (!containers.some((container) => container.id === preset.extension)) {
      containers.push({ id: preset.extension, label: preset.containerLabel });
    }
    return containers;
  },
  [],
);

const presetById = Object.fromEntries(
  ENCODING_PRESETS.map((preset) => [preset.id, preset]),
) as Record<OutputFormat, EncodingPreset>;

export function getEncodingPreset(outputFormat: OutputFormat): EncodingPreset {
  return presetById[outputFormat];
}

export function isOutputFormat(value: string): value is OutputFormat {
  return Object.prototype.hasOwnProperty.call(presetById, value);
}

export function isOutputContainer(value: string): value is OutputContainer {
  return OUTPUT_CONTAINERS.some((container) => container.id === value);
}

export function getPresetsByContainer(container: OutputContainer): EncodingPreset[] {
  return ENCODING_PRESETS.filter((preset) => preset.extension === container) as EncodingPreset[];
}
