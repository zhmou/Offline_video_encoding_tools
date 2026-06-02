<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileVideo,
  HardDrive,
  Layers,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
  X,
  Zap,
} from 'lucide-vue-next';
import { LocalFfmpegRunner } from '@/lib/ffmpegRunner';
import {
  createQueueId,
  formatBytes,
  formatDuration,
  getVideoMetadata,
  isVideoFile,
} from '@/lib/video';
import type { CompressionProfile, CompressionSettings, OutputFormat, QueueItem } from '@/types';

const settings = reactive<CompressionSettings>({
  outputFormat: 'mp4',
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
    rejectedMessage.value = `已跳过 ${rejected} 个非视频文件。`;
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
      item.error = error instanceof Error ? error.message : '无法读取视频信息。';
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
        item.error = error instanceof Error ? error.message : '压缩失败，请尝试更低分辨率或更短的视频。';
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
  item.error = '已取消。';
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

function onFormatChange(event: Event): void {
  settings.outputFormat = (event.target as HTMLSelectElement).value as OutputFormat;
}

function onProfileChange(event: Event): void {
  const profile = (event.target as HTMLButtonElement).dataset.profile as CompressionProfile | undefined;
  if (profile) {
    settings.profile = profile;
    settings.intensity = profile === 'quality' ? 35 : profile === 'small' ? 82 : 60;
  }
}

function onTargetSizeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  settings.targetSizeMb = Number.isFinite(value) && value > 0 ? value : null;
}

function onMaxWidthInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  settings.maxWidth = Number.isFinite(value) ? value : 1280;
}

function onIntensityInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  settings.intensity = Number.isFinite(value) ? value : 60;
}

function onKeepAudioChange(event: Event): void {
  settings.keepAudio = Boolean((event.target as HTMLInputElement).checked);
}

function statusLabel(item: QueueItem): string {
  const labels: Record<QueueItem['status'], string> = {
    pending: '等待中',
    processing: '处理中',
    done: '已完成',
    error: '失败',
    cancelled: '已取消',
  };

  return labels[item.status];
}
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <nav class="topbar" aria-label="主导航">
        <div class="brand">
          <span class="brand-mark"><Zap :size="18" /></span>
          <span>本地视频压缩</span>
        </div>
        <div class="privacy-chip">
          <WifiOff :size="16" />
          <span>浏览器本地处理</span>
        </div>
      </nav>

      <div class="hero-copy">
        <p class="eyebrow">Offline Video Encoding Tools</p>
        <h1>批量压缩视频，不上传文件。</h1>
        <p>
          选择视频、设定目标体积或压缩强度，ffmpeg.wasm 会在当前浏览器里串行处理队列。
        </p>
      </div>

      <section class="tool-grid" aria-label="视频压缩工具">
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
          <div class="upload-icon">
            <Upload :size="34" />
          </div>
          <h2>拖放视频到这里</h2>
          <p>支持 MP4、MOV、WebM、MKV 等常见视频。文件只会进入本地内存。</p>
          <div class="actions">
            <fluent-button appearance="accent" @click="openFilePicker">
              <Upload :size="17" />
              选择视频
            </fluent-button>
            <fluent-button appearance="neutral" :disabled="!queue.length" @click="clearAll">
              <Trash2 :size="17" />
              清空队列
            </fluent-button>
          </div>
          <p v-if="rejectedMessage" class="notice">
            <AlertCircle :size="16" />
            {{ rejectedMessage }}
          </p>
        </div>

        <aside class="settings-panel" aria-label="压缩设置">
          <div class="panel-heading">
            <Settings2 :size="20" />
            <div>
              <h2>压缩设置</h2>
              <p>设置会在每个文件开始处理时生效。</p>
            </div>
          </div>

          <div class="profile-group" aria-label="压缩预设">
            <button
              class="profile-button"
              :class="{ active: settings.profile === 'small' }"
              data-profile="small"
              @click="onProfileChange"
            >
              小体积
            </button>
            <button
              class="profile-button"
              :class="{ active: settings.profile === 'balanced' }"
              data-profile="balanced"
              @click="onProfileChange"
            >
              均衡
            </button>
            <button
              class="profile-button"
              :class="{ active: settings.profile === 'quality' }"
              data-profile="quality"
              @click="onProfileChange"
            >
              高画质
            </button>
          </div>

          <label class="field">
            <span>输出格式</span>
            <fluent-select :value="settings.outputFormat" @change="onFormatChange">
              <fluent-option value="mp4">MP4 · H.264/AAC</fluent-option>
              <fluent-option value="webm">WebM · VP9/Opus</fluent-option>
            </fluent-select>
          </label>

          <label class="field">
            <span>目标大小 MB</span>
            <fluent-text-field
              type="number"
              min="1"
              placeholder="留空则按强度压缩"
              :value="settings.targetSizeMb ?? ''"
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

          <label class="field">
            <span>压缩强度：{{ settings.intensity }}</span>
            <fluent-slider
              min="10"
              max="95"
              step="1"
              :value="String(settings.intensity)"
              @input="onIntensityInput"
            />
          </label>

          <label class="switch-row">
            <fluent-switch :checked="settings.keepAudio" @change="onKeepAudioChange" />
            <span>保留音频轨道</span>
          </label>
        </aside>
      </section>
    </section>

    <section class="queue-section" aria-label="压缩队列">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Queue</p>
          <h2>压缩队列</h2>
        </div>
        <div class="queue-actions">
          <fluent-button appearance="accent" :disabled="!canStart" @click="startQueue">
            <Play :size="17" />
            开始压缩
          </fluent-button>
          <fluent-button appearance="neutral" :disabled="!queue.length" @click="clearFinished">
            <X :size="17" />
            清理完成项
          </fluent-button>
        </div>
      </div>

      <div class="summary-strip" aria-label="队列统计">
        <div>
          <span>{{ acceptedCount }}</span>
          <small>队列文件</small>
        </div>
        <div>
          <span>{{ completedCount }}</span>
          <small>已完成</small>
        </div>
        <div>
          <span>{{ formatBytes(totalOriginalSize) }}</span>
          <small>原始体积</small>
        </div>
        <div>
          <span>{{ totalOutputSize ? formatBytes(totalOutputSize) : '--' }}</span>
          <small>输出体积</small>
        </div>
        <div>
          <span>{{ savingsRatio ? `${savingsRatio}%` : '--' }}</span>
          <small>节省空间</small>
        </div>
      </div>

      <div v-if="queue.length" class="queue-list">
        <article v-for="item in queue" :key="item.id" class="queue-item" :class="`status-${item.status}`">
          <div class="file-leading">
            <FileVideo :size="24" />
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
              <AlertCircle :size="15" />
              {{ item.error }}
            </p>

            <p v-if="item.status === 'done' && item.outputSize" class="success-text">
              <CheckCircle2 :size="15" />
              输出 {{ formatBytes(item.outputSize) }}，节省
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
              <Download :size="18" />
            </a>
            <button
              v-if="item.status === 'error' || item.status === 'cancelled'"
              class="icon-button"
              title="重试"
              @click="retryItem(item)"
            >
              <RotateCcw :size="18" />
            </button>
            <button
              v-if="item.status === 'pending' || item.status === 'processing'"
              class="icon-button"
              title="取消"
              @click="cancelItem(item)"
            >
              <X :size="18" />
            </button>
            <button class="icon-button" title="移除" @click="removeItem(item)">
              <Trash2 :size="18" />
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <HardDrive :size="28" />
        <p>还没有视频，添加文件后会在这里看到队列和结果。</p>
      </div>
    </section>

    <section class="info-grid" aria-label="本地处理说明">
      <article>
        <ShieldCheck :size="24" />
        <h2>本地处理</h2>
        <p>视频文件不会离开当前浏览器。刷新页面或清空队列后，临时结果会被释放。</p>
      </article>
      <article>
        <Layers :size="24" />
        <h2>串行队列</h2>
        <p>多个视频会按顺序压缩，降低内存峰值，失败项不会阻塞后续任务。</p>
      </article>
      <article>
        <Clock :size="24" />
        <h2>速度取舍</h2>
        <p>为兼容 GitHub Pages，首版采用单线程 ffmpeg.wasm；长视频会更慢。</p>
      </article>
    </section>

    <section class="faq-section" aria-label="常见问题">
      <div>
        <p class="eyebrow">FAQ</p>
        <h2>常见问题</h2>
      </div>
      <details open>
        <summary>为什么第一次压缩前会等待？</summary>
        <p>浏览器需要加载 ffmpeg.wasm 核心文件，后续同一页面内会复用已加载实例。</p>
      </details>
      <details>
        <summary>目标大小一定完全准确吗？</summary>
        <p>目标大小会换算成平均码率，真实结果会受内容复杂度、音频和容器开销影响。</p>
      </details>
      <details>
        <summary>可以断网使用吗？</summary>
        <p>页面和 wasm 资源加载完成后，压缩过程不需要网络连接。</p>
      </details>
    </section>
  </main>
</template>
