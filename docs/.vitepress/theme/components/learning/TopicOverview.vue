<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import { chaptersOf, chapterHref } from '../../../content/curriculum'

const props = defineProps<{ topicId: string }>()
const topicIndex = computed(() => learningTopics.findIndex((topic) => topic.id === props.topicId))
const topic = computed(() => learningTopics[topicIndex.value])
const chapters = computed(() =>
  topic.value ? chaptersOf(topic.value.id, topic.value.title, topicIndex.value + 1) : [],
)
</script>

<template>
  <div v-if="topic" class="cf-page cf-overview">
    <header class="cf-section-header">
      <h1><SectionMark />{{ topic.title }}</h1>
    </header>

    <ol class="chapter-list" aria-label="章节目录">
      <li v-for="chapter in chapters" :key="chapter.slug">
        <a class="chapter-link" :href="withBase(chapterHref(topic.id, chapter.slug))">
          <span class="chapter-number">{{ String(chapter.number).padStart(2, '0') }}</span>
          <span class="chapter-title">{{ chapter.title }}</span>
          <span v-if="chapter.status !== 'published'" class="chapter-status" :data-status="chapter.status">
            {{ chapter.status === 'planned' ? '规划中' : '编写中' }}
          </span>
          <span class="chapter-points">{{ chapter.items.join('、') }}</span>
        </a>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.chapter-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; list-style: none; }

.chapter-link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto 1fr;
  align-items: start;
  gap: 0.7rem 0.8rem;
  height: 100%;
  padding: clamp(1rem, 2vw, 1.5rem);
  border: 1px solid var(--cf-border);
  border-radius: 0.85rem;
  background: var(--cf-surface);
}

.chapter-link:is(:hover, :focus-visible) { border-color: var(--cf-gold); background: var(--cf-soft); }
.chapter-number { align-self: center; color: var(--cf-gold); font: 650 0.9rem/1.5 var(--vp-font-family-mono); }
.chapter-title { align-self: center; font-size: 1.125rem; font-weight: 700; line-height: 1.5; color: var(--cf-ink); }
.chapter-status { padding: 0.1rem 0.5rem; border-radius: 0.35rem; color: var(--cf-muted); background: var(--vp-c-default-soft); font-size: 0.8125rem; white-space: nowrap; }
.chapter-status[data-status="writing"] { color: var(--cf-gold); background: var(--cf-warm); }
.chapter-points { grid-column: 2 / -1; color: var(--cf-text); font-size: 0.9375rem; line-height: 1.8; }

@media (max-width: 760px) {
  .chapter-list { grid-template-columns: 1fr; }
  .chapter-points { grid-column: 1 / -1; }
}
</style>
