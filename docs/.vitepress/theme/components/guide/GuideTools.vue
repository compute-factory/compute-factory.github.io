<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { guideDownloads } from '../../../content/guide-downloads.generated'

const { page } = useData()

const route = computed(() => '/' + page.value.relativePath.replace(/\.md$/, ''))
const download = computed(() => guideDownloads[route.value])
// 用标题冒号前的主体部分做下载文件名
const fileBase = computed(() => {
  const title = page.value.title || ''
  return title.split(/[：:]/)[0].trim() || route.value.split('/').pop() || '文章'
})

const relative = computed(() => page.value.relativePath.replace(/^guide\//, ''))
const mdHref = computed(() => withBase(`/guide/files/${relative.value}`))
const pdfHref = computed(() => withBase(`/guide/files/${relative.value.replace(/\.md$/, '.pdf')}`))
</script>

<template>
  <div v-if="download?.md" class="guide-tools">
    <span class="tool-label"><Download :size="15" aria-hidden="true" />下载本页</span>
    <a class="tool-link" :href="mdHref" :download="`${fileBase}.md`">Markdown</a>
    <a v-if="download.pdf" class="tool-link" :href="pdfHref" :download="`${fileBase}.pdf`">PDF</a>
  </div>
</template>

<style scoped>
.guide-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 1.75rem auto;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.5rem;
  background: var(--cf-soft);
  font-size: 0.8125rem;
}

.tool-label {
  margin-right: 0.15rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--cf-muted);
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
  font-weight: 600;
  line-height: 1.4;
  text-decoration: none;
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

/* 宽屏时放到正文栏右侧的空白里，不占标题和正文的宽度 */
@media (min-width: 1280px) {
  .guide-tools {
    position: absolute;
    top: 0;
    left: calc(100% + 1rem);
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    width: max-content;
    margin: 0;
  }

  .tool-link { white-space: nowrap; }
}

@media (max-width: 600px) {
  .guide-tools { margin-bottom: 1.25rem; }
}
</style>
