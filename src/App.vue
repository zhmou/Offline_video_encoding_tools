<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileVideo,
  HardDrive,
  Play,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
  WifiOff,
  X,
  Zap,
} from 'lucide-vue-next';
import { LocalFfmpegRunner } from '@/lib/ffmpegRunner';
import {
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_CONTAINERS,
  getEncodingPreset,
  getPresetsByContainer,
  isOutputContainer,
  isOutputFormat,
} from '@/lib/encodingPresets';
import {
  COMPRESSION_PROFILES,
  canEditIntensity,
  intensityForProfile,
} from '@/lib/compressionProfiles';
import {
  createQueueId,
  formatBytes,
  formatDuration,
  getVideoMetadata,
  isVideoFile,
} from '@/lib/video';
import { isBlockedPositiveNumberKey, readNumericControlValue } from '@/lib/formControls';
import type { CompressionProfile, CompressionSettings, QueueItem } from '@/types';

const settings = reactive<CompressionSettings>({
  outputFormat: DEFAULT_OUTPUT_FORMAT,
  targetSizeMb: null,
  maxWidth: 1280,
  keepAudio: true,
  intensity: 60,
  profile: 'balanced',
});

const queue = ref<QueueItem[]>([]);
const dragActive = ref(false);
const isProcessing = ref(false);
const currentItemId = ref<string | null>(null);
const rejectedMessage = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const runner = new LocalFfmpegRunner();

const acceptedCount = computed(() => queue.value.filter((item) => item.status !== 'cancelled').length);
const completedCount = computed(() => queue.value.filter((item) => item.status === 'done').length);
const totalOriginalSize = computed(() => queue.value.reduce((total, item) => total + item.size, 0));
const totalOutputSize = computed(() =>
  queue.value.reduce((total, item) => total + (item.outputSize ?? 0), 0),
);
const pendingCount = computed(() => queue.value.filter((item) => item.status === 'pending').length);
const canStart = computed(() => pendingCount.value > 0 && !isProcessing.value);
const selectedPreset = computed(() => getEncodingPreset(settings.outputFormat));
const codecOptions = computed(() => getPresetsByContainer(selectedPreset.value.extension));
const canEditCustomIntensity = computed(() => canEditIntensity(settings.profile));
const savingsRatio = computed(() => {
  if (!totalOriginalSize.value || !totalOutputSize.value) {
    return 0;
  }

  return Math.max(0, Math.round((1 - totalOutputSize.value / totalOriginalSize.value) * 100));
});

function openFilePicker(): void {
  fileInput.value?.click();
}

function onFileInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    void addFiles(input.files);
  }
  input.value = '';
}

function onDrop(event: DragEvent): void {
  dragActive.value = false;
  if (event.dataTransfer?.files) {
    void addFiles(event.dataTransfer.files);
  }
}

async function addFiles(fileList: FileList | File[]): Promise<void> {
  rejectedMessage.value = '';
  const files = Array.from(fileList);
  const videos = files.filter(isVideoFile);
  const rejected = files.length - videos.length;

  if (rejected > 0) {
    rejectedMessage.value = `已跳过 ${rejected} 个非视频文件`;
  }

  for (const file of videos) {
    const item: QueueItem = {
      id: createQueueId(),
      file,
      name: file.name,
      sourceUrl: URL.createObjectURL(file),
      size: file.size,
      status: 'pending',
      progress: 0,
    };
    queue.value.push(item);

    try {
      item.metadata = await getVideoMetadata(file);
    } catch (error) {
      item.status = 'error';
      item.error = error instanceof Error ? error.message : '无法读取视频信息';
    }
  }
}

async function startQueue(): Promise<void> {
  if (!canStart.value) {
    return;
  }

  isProcessing.value = true;
  rejectedMessage.value = '';

  for (const item of queue.value) {
    if (item.status !== 'pending') {
      continue;
    }

    currentItemId.value = item.id;
    item.status = 'processing';
    item.progress = 0.02;
    item.error = undefined;
    item.startedAt = Date.now();
    revokeOutput(item);

    const snapshot = { ...settings };

    try {
      const result = await runner.compress(item.file, item.metadata, snapshot, (progress) => {
        if (item.status === 'processing') {
          item.progress = Math.max(0.02, progress);
        }
      });

      if (isCancelled(item)) {
        continue;
      }

      item.outputBlob = result.blob;
      item.outputUrl = URL.createObjectURL(result.blob);
      item.outputName = result.name;
      item.outputSize = result.blob.size;
      item.progress = 1;
      item.status = 'done';
      item.finishedAt = Date.now();
    } catch (error) {
      if (!isCancelled(item)) {
        item.status = 'error';
        item.error = error instanceof Error ? error.message : '压缩失败';
      }
    }
  }

  currentItemId.value = null;
  isProcessing.value = false;
}

function removeItem(item: QueueItem): void {
  if (item.status === 'processing') {
    cancelItem(item);
  }

  queue.value = queue.value.filter((candidate) => candidate.id !== item.id);
  URL.revokeObjectURL(item.sourceUrl);
  revokeOutput(item);
}

function clearFinished(): void {
  for (const item of queue.value) {
    if (item.status === 'done' || item.status === 'error' || item.status === 'cancelled') {
      URL.revokeObjectURL(item.sourceUrl);
      revokeOutput(item);
    }
  }

  queue.value = queue.value.filter((item) => item.status === 'pending' || item.status === 'processing');
}

function clearAll(): void {
  if (currentItemId.value) {
    runner.cancel();
  }

  for (const item of queue.value) {
    URL.revokeObjectURL(item.sourceUrl);
    revokeOutput(item);
  }

  queue.value = [];
  currentItemId.value = null;
  isProcessing.value = false;
}

function cancelItem(item: QueueItem): void {
  if (item.status === 'done' || item.status === 'error') {
    return;
  }

  item.status = 'cancelled';
  item.error = '已取消';
  item.progress = 0;

  if (currentItemId.value === item.id) {
    runner.cancel();
  }
}

function retryItem(item: QueueItem): void {
  if (item.status === 'processing') {
    return;
  }

  revokeOutput(item);
  item.status = 'pending';
  item.progress = 0;
  item.error = undefined;
  item.outputBlob = undefined;
  item.outputName = undefined;
  item.outputSize = undefined;
  item.finishedAt = undefined;
}

function isCancelled(item: QueueItem): boolean {
  return item.status === 'cancelled';
}

function revokeOutput(item: QueueItem): void {
  if (item.outputUrl) {
    URL.revokeObjectURL(item.outputUrl);
  }
  item.outputUrl = undefined;
}

function onContainerChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (!isOutputContainer(value)) {
    return;
  }

  const currentPreset = selectedPreset.value;
  const presets = getPresetsByContainer(value);
  const nextPreset =
    presets.find((preset) => preset.rateControl === currentPreset.rateControl) ?? presets[0];

  if (nextPreset) {
    settings.outputFormat = nextPreset.id;
  }
}

function onCodecChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (isOutputFormat(value) && getEncodingPreset(value).extension === selectedPreset.value.extension) {
    settings.outputFormat = value;
  }
}

function onProfileChange(event: Event): void {
  const profile = (event.target as HTMLButtonElement).dataset.profile as CompressionProfile | undefined;
  if (profile) {
    settings.profile = profile;
    settings.intensity = intensityForProfile(profile, settings.intensity);
  }
}

function onTargetSizeInput(event: Event): void {
  const value = readNumericControlValue(event.target, Number.NaN);
  settings.targetSizeMb = Number.isFinite(value) && value > 0 ? value : null;
}

function onTargetSizeBlur(event: Event): void {
  const input = event.target as HTMLInputElement;
  const value = readNumericControlValue(input, Number.NaN);

  // 非法或非正数目标会回到留空的“自动”模式。
  if (!Number.isFinite(value) || value <= 0) {
    input.value = '';
    settings.targetSizeMb = null;
  }
}

function onTargetSizeKeydown(event: KeyboardEvent): void {
  if (isBlockedPositiveNumberKey(event.key)) {
    event.preventDefault();
  }
}

function onMaxWidthInput(event: Event): void {
  const value = readNumericControlValue(event.target, 1280);
  settings.maxWidth = Number.isFinite(value) ? value : 1280;
}

function onIntensityInput(event: Event): void {
  // 滑条始终展示，但只有自定义模式能写入手动强度。
  if (!canEditCustomIntensity.value) {
    return;
  }

  const value = readNumericControlValue(event.target, 60);
  settings.profile = 'custom';
  settings.intensity = Number.isFinite(value) ? value : 60;
}

function onKeepAudioChange(event: Event): void {
  settings.keepAudio = Boolean((event.target as HTMLInputElement).checked);
}

function statusLabel(item: QueueItem): string {
  const labels: Record<QueueItem['status'], string> = {
    pending: '等待',
    processing: '处理',
    done: '完成',
    error: '失败',
    cancelled: '取消',
  };

  return labels[item.status];
}
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark"><Zap :size="17" /></span>
        <div>
          <h1>本地视频压缩</h1>
          <p>ffmpeg.wasm · 单线程 · 串行队列</p>
        </div>
      </div>
      <div class="header-actions">
        <span class="status-chip"><WifiOff :size="15" />本地处理</span>
        <fluent-button appearance="accent" :disabled="!canStart" @click="startQueue">
          <Play :size="16" />
          开始
        </fluent-button>
      </div>
    </header>

    <section class="workspace" aria-label="视频压缩工作区">
      <aside class="control-panel">
        <div class="panel-title">
          <Settings2 :size="18" />
          <h2>参数</h2>
        </div>

        <div
          class="upload-panel"
          :class="{ 'is-dragging': dragActive }"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept="video/*"
            multiple
            @change="onFileInput"
          />
          <Upload :size="24" />
          <strong>拖放视频</strong>
          <span>或选择文件加入队列</span>
          <div class="actions">
            <fluent-button appearance="accent" @click="openFilePicker">
              <Upload :size="16" />
              添加
            </fluent-button>
            <fluent-button appearance="neutral" :disabled="!queue.length" @click="clearAll">
              <Trash2 :size="16" />
              清空
            </fluent-button>
          </div>
          <p v-if="rejectedMessage" class="notice">
            <AlertCircle :size="15" />
            {{ rejectedMessage }}
          </p>
        </div>

        <div class="intensity-control" :class="{ 'is-disabled': !canEditCustomIntensity }">
          <div class="profile-group" aria-label="强度">
            <button
              v-for="profile in COMPRESSION_PROFILES"
              :key="profile.id"
              class="profile-button"
              :class="{ active: settings.profile === profile.id }"
              :data-profile="profile.id"
              @click="onProfileChange"
            >
              {{ profile.label }}
            </button>
          </div>

          <label class="field intensity-field">
            <span>{{ canEditCustomIntensity ? '自定义强度' : '强度' }} {{ settings.intensity }}</span>
            <fluent-slider
              min="10"
              max="95"
              step="1"
              :current-value="String(settings.intensity)"
              :disabled="!canEditCustomIntensity"
              @change="onIntensityInput"
              @input="onIntensityInput"
            />
          </label>
        </div>

        <div class="format-grid">
          <label class="field">
            <span>格式</span>
            <fluent-select :value="selectedPreset.extension" @change="onContainerChange">
              <fluent-option v-for="container in OUTPUT_CONTAINERS" :key="container.id" :value="container.id">
                {{ container.label }}
              </fluent-option>
            </fluent-select>
          </label>

          <label class="field">
            <span>编码</span>
            <fluent-select :value="settings.outputFormat" @change="onCodecChange">
              <fluent-option v-for="preset in codecOptions" :key="preset.id" :value="preset.id">
                {{ preset.codecLabel }}
              </fluent-option>
            </fluent-select>
          </label>
        </div>

        <label class="field">
          <span>目标 MB</span>
          <fluent-text-field
            type="number"
            min="0.1"
            step="0.1"
            inputmode="decimal"
            placeholder="自动"
            :value="settings.targetSizeMb ?? ''"
            @blur="onTargetSizeBlur"
            @keydown="onTargetSizeKeydown"
            @input="onTargetSizeInput"
          />
        </label>

        <label class="field">
          <span>最大宽度</span>
          <fluent-select :value="String(settings.maxWidth)" @change="onMaxWidthInput">
            <fluent-option value="3840">3840 px</fluent-option>
            <fluent-option value="1920">1920 px</fluent-option>
            <fluent-option value="1280">1280 px</fluent-option>
            <fluent-option value="854">854 px</fluent-option>
            <fluent-option value="640">640 px</fluent-option>
          </fluent-select>
        </label>

        <label class="switch-row">
          <fluent-switch :checked="settings.keepAudio" @change="onKeepAudioChange" />
          <span>保留音频</span>
        </label>
      </aside>

      <section class="queue-panel" aria-label="压缩队列">
        <div class="queue-toolbar">
          <div>
            <h2>队列</h2>
            <p>{{ pendingCount }} 等待 · {{ completedCount }} 完成</p>
          </div>
          <div class="queue-actions">
            <fluent-button appearance="accent" :disabled="!canStart" @click="startQueue">
              <Play :size="16" />
              开始
            </fluent-button>
            <fluent-button appearance="neutral" :disabled="!queue.length" @click="clearFinished">
              <X :size="16" />
              清理
            </fluent-button>
          </div>
        </div>

        <div class="summary-strip" aria-label="队列统计">
          <div>
            <span>{{ acceptedCount }}</span>
            <small>文件</small>
          </div>
          <div>
            <span>{{ formatBytes(totalOriginalSize) }}</span>
            <small>原始</small>
          </div>
          <div>
            <span>{{ totalOutputSize ? formatBytes(totalOutputSize) : '--' }}</span>
            <small>输出</small>
          </div>
          <div>
            <span>{{ savingsRatio ? `${savingsRatio}%` : '--' }}</span>
            <small>节省</small>
          </div>
        </div>

        <div v-if="queue.length" class="queue-list">
          <article v-for="item in queue" :key="item.id" class="queue-item" :class="`status-${item.status}`">
            <div class="file-leading">
              <FileVideo :size="21" />
            </div>
            <div class="file-body">
              <div class="file-title-row">
                <div>
                  <h3>{{ item.name }}</h3>
                  <p>
                    {{ formatBytes(item.size) }}
                    <span v-if="item.metadata">
                      · {{ item.metadata.width }}×{{ item.metadata.height }} · {{ formatDuration(item.metadata.duration) }}
                    </span>
                  </p>
                </div>
                <span class="status-pill">{{ statusLabel(item) }}</span>
              </div>

              <div class="progress-track" aria-label="处理进度">
                <span :style="{ width: `${Math.round(item.progress * 100)}%` }" />
              </div>

              <p v-if="item.error" class="error-text">
                <AlertCircle :size="14" />
                {{ item.error }}
              </p>

              <p v-if="item.status === 'done' && item.outputSize" class="success-text">
                <CheckCircle2 :size="14" />
                {{ formatBytes(item.outputSize) }} · 节省
                {{ Math.max(0, Math.round((1 - item.outputSize / item.size) * 100)) }}%
              </p>
            </div>
            <div class="item-actions">
              <a
                v-if="item.outputUrl"
                class="icon-button"
                :href="item.outputUrl"
                :download="item.outputName"
                title="下载"
              >
                <Download :size="17" />
              </a>
              <button
                v-if="item.status === 'error' || item.status === 'cancelled'"
                class="icon-button"
                title="重试"
                @click="retryItem(item)"
              >
                <RotateCcw :size="17" />
              </button>
              <button
                v-if="item.status === 'pending' || item.status === 'processing'"
                class="icon-button"
                title="取消"
                @click="cancelItem(item)"
              >
                <X :size="17" />
              </button>
              <button class="icon-button" title="移除" @click="removeItem(item)">
                <Trash2 :size="17" />
              </button>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <HardDrive :size="24" />
          <p>队列为空</p>
        </div>
      </section>
    </section>
  </main>
</template>
