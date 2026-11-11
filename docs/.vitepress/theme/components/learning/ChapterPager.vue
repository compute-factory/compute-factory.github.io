<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import { chaptersOf, chapterHref, findChapterByPath } from '../../../content/curriculum'

const route = useRoute()

// 全站章节按课程顺序排成一列，上一篇/下一篇可以跨板块
const allChapters = learningTopics.flatMap((topic, index) => chaptersOf(topic.id, topic.title, index + 1))

const position = computed(() => {
  const current = findChapterByPath(route.path)
  return current ? allChapters.findIndex((c) => c.topicId === current.topicId && c.slug === current.slug) : -1
})
const previous = computed(() => (position.value > 0 ? allChapters[position.value - 1] : undefined))
const next = computed(() => (position.value >= 0 ? allChapters[position.value + 1] : undefined))
</script>

<template>
  <nav v-if="previous || next" class="chapter-pager" aria-label="相邻章节">
    <a v-if="previous" class="pager-link" :href="withBase(chapterHref(previous.topicId, previous.slug))">
      <span class="pager-label">上一篇</span>
      <span class="pager-title">{{ previous.title }}</span>
    </a>
    <a v-if="next" class="pager-link pager-link--next" :href="withBase(chapterHref(next.topicId, next.slug))">
      <span class="pager-label">下一篇</span>
      <span class="pager-title">{{ next.title }}</span>
    </a>
  </nav>
</template>

<style scoped>
.chapter-pager {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 4rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--cf-border);
}

.pager-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.5rem;
  text-decoration: none;
  transition: border-color 0.15s;
}

.pager-link--next {
  grid-column: 2;
  text-align: right;
}

.pager-link:hover { border-color: var(--cf-amber); }

.pager-link:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: 2px;
}

.pager-label {
  font-size: 0.8125rem;
  color: var(--cf-muted);
}

.pager-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--cf-gold);
}

@media (max-width: 640px) {
  .chapter-pager { grid-template-columns: 1fr; }
  .pager-link--next { grid-column: 1; }
}
</style>
