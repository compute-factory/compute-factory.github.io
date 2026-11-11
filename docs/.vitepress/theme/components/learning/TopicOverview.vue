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
  <div v-if="topic" class="cf-page topic-page">
    <h1 class="topic-title">{{ topic.title }}</h1>

    <ol class="chapter-list">
      <li v-for="chapter in chapters" :key="chapter.slug" class="chapter-item">
        <a class="chapter-link" :href="withBase(chapterHref(topic.id, chapter.slug))">
          <span class="chapter-number">{{ String(chapter.number).padStart(2, '0') }}</span>
          <span class="chapter-body">
            <span class="chapter-title">{{ chapter.title }}</span>
            <span class="chapter-points">{{ chapter.items.join('、') }}</span>
          </span>
        </a>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.topic-page {
  max-width: 80rem;
  padding-block: 2.5rem 5rem;
}

.topic-title {
  margin: 0 0 2rem;
  font-size: clamp(2.1rem, 3vw, 2.875rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
  color: var(--cf-ink);
}

/* ── 章节列表 ───────────────────────────────────────── */
.chapter-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.chapter-item { border-top: 1px solid var(--cf-border); }

.chapter-item:last-child { border-bottom: 1px solid var(--cf-border); }

.chapter-link {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  align-items: baseline;
  column-gap: 1rem;
  padding: 1.5rem 0.75rem 1.5rem 0;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.15s;
}

.chapter-link:hover { background: var(--cf-soft); }

.chapter-link:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: -2px;
}

.chapter-number {
  font-size: 0.875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--cf-muted);
  transition: color 0.15s;
}

.chapter-link:hover .chapter-number { color: var(--cf-gold); }

.chapter-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.chapter-title {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.5;
  color: var(--cf-ink);
}

.chapter-link:hover .chapter-title { color: var(--cf-gold); }

.chapter-points {
  font-size: 0.875rem;
  line-height: 1.75;
  color: var(--cf-muted);
}

@media (max-width: 600px) {
  .topic-page { padding-block: 1.5rem 3rem; }

  .chapter-link {
    grid-template-columns: 1.75rem minmax(0, 1fr);
    column-gap: 0.75rem;
    padding-block: 1.15rem;
  }
}
</style>
