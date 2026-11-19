<script setup lang="ts">
import { BookOpen, FileText } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import type { Paper } from '../../../content/papers'
import { arxivAbsUrl, arxivPdfUrl, paperReportHref } from '../../../content/papers'

const props = defineProps<{ paper: Paper }>()

const readerOpen = ref(false)
const closeButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null

const absUrl = computed(() => arxivAbsUrl(props.paper))
const pdfUrl = computed(() => arxivPdfUrl(props.paper))
const mdHref = computed(() => withBase(paperReportHref(props.paper.slug, 'md')))
const reportPdfHref = computed(() => withBase(paperReportHref(props.paper.slug, 'pdf')))
// 用标题冒号前的主体部分做下载文件名，避开过长和带标点的标题
const fileBase = computed(() => props.paper.title.split(/[：:]/)[0].trim() || props.paper.slug)

function lockScroll(lock: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.style.overflow = lock ? 'hidden' : ''
}

async function openReader() {
  previousFocus = document.activeElement as HTMLElement | null
  readerOpen.value = true
  lockScroll(true)
  await nextTick()
  closeButton.value?.focus()
}

function closeReader() {
  readerOpen.value = false
  lockScroll(false)
  previousFocus?.focus()
  previousFocus = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && readerOpen.value) closeReader()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  lockScroll(false)
})
</script>

<template>
  <div class="paper-tools">
    <div class="tool-group">
      <span class="tool-label"><FileText :size="15" aria-hidden="true" />精读报告</span>
      <a class="tool-link" :href="mdHref" :download="`${fileBase}-精读报告.md`">下载 Markdown</a>
      <a
        v-if="paper.reportPdf"
        class="tool-link"
        :href="reportPdfHref"
        :download="`${fileBase}-精读报告.pdf`"
      >下载 PDF</a>
    </div>
    <div v-if="pdfUrl || absUrl" class="tool-group">
      <span class="tool-label"><BookOpen :size="15" aria-hidden="true" />原文</span>
      <button v-if="pdfUrl" type="button" class="tool-link tool-link--primary" @click="openReader">
        阅读 PDF
      </button>
      <a v-if="absUrl" class="tool-link" :href="absUrl" target="_blank" rel="noopener">arXiv 摘要</a>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="readerOpen && pdfUrl"
      class="paper-reader"
      role="dialog"
      aria-modal="true"
      aria-label="阅读论文原文 PDF"
      @click.self="closeReader"
    >
      <div class="reader-panel">
        <div class="reader-head">
          <p class="reader-title">
            原文 PDF<span class="reader-id">arXiv:{{ paper.arxivId }}</span>
          </p>
          <div class="reader-actions">
            <a class="reader-open" :href="pdfUrl" target="_blank" rel="noopener">在新窗口打开</a>
            <button
              ref="closeButton"
              type="button"
              class="reader-close"
              aria-label="关闭原文阅读器"
              @click="closeReader"
            >✕</button>
          </div>
        </div>
        <iframe class="reader-frame" :src="pdfUrl" :title="`${paper.title} 原文 PDF`"></iframe>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.paper-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.5rem;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 1.75rem auto;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.5rem;
  background: var(--cf-section-tint);
  font-size: 0.8125rem;
}

.tool-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.tool-label {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--cf-section-ink);
}

.tool-link {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  background: var(--cf-surface);
  color: var(--cf-ink);
  font: inherit;
  font-weight: 600;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}

.tool-link:hover {
  border-color: var(--cf-amber);
  background: var(--cf-warm);
  color: var(--cf-gold);
}

.tool-link:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: 2px;
}

.tool-link--primary {
  border-color: var(--cf-amber);
  background: var(--cf-amber);
  color: #222018;
}

.tool-link--primary:hover {
  border-color: #ffda70;
  background: #ffda70;
  color: #222018;
}

.paper-reader {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  padding: clamp(0.75rem, 3vw, 2rem);
  background: rgba(20, 18, 14, 0.55);
}

.reader-panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 72rem);
  height: 100%;
  margin: auto;
  overflow: hidden;
  border: 1px solid var(--cf-border);
  border-radius: 0.75rem;
  background: var(--cf-surface);
}

.reader-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0.5rem 0.4rem 1rem;
  border-bottom: 1px solid var(--cf-border);
}

.reader-title {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--cf-ink);
}

.reader-id {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--cf-muted);
}

.reader-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.reader-open {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--cf-gold);
}

.reader-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--cf-ink);
  font-size: 1rem;
  cursor: pointer;
}

.reader-close:hover {
  background: var(--cf-warm);
}

.reader-close:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: 1px;
}

.reader-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

/* 宽屏时放到正文栏右侧的空白里，不占标题和正文的宽度 */
@media (min-width: 1280px) {
  .paper-tools {
    position: absolute;
    top: 0;
    left: calc(100% + 1rem);
    flex-direction: column;
    align-items: flex-start;
    gap: 0.55rem;
    width: max-content;
    margin: 0;
  }

  .tool-group {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .tool-link { white-space: nowrap; }
}

@media (max-width: 600px) {
  .paper-tools {
    gap: 0.4rem 0.75rem;
    margin: 0 0 1.25rem;
  }

  .paper-reader {
    padding: 0;
  }

  .reader-panel {
    border: 0;
    border-radius: 0;
  }
}
</style>
