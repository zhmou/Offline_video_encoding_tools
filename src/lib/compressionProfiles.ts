import type { CompressionProfile } from '@/types';

export const COMPRESSION_PROFILES = [
  { id: 'small', label: '小' },
  { id: 'balanced', label: '均衡' },
  { id: 'quality', label: '质量' },
  { id: 'custom', label: '自定义' },
] as const satisfies ReadonlyArray<{ id: CompressionProfile; label: string }>;

// 预设值沿用旧滑条默认值；自定义保留当前手动值。
export function intensityForProfile(profile: CompressionProfile, currentIntensity: number): number {
  if (profile === 'small') {
    return 82;
  }

  if (profile === 'quality') {
    return 35;
  }

  if (profile === 'custom') {
    return currentIntensity;
  }

  return 60;
}

export function isCustomCompressionProfile(profile: CompressionProfile): boolean {
  return profile === 'custom';
}

export function canEditIntensity(profile: CompressionProfile): boolean {
  return isCustomCompressionProfile(profile);
}
