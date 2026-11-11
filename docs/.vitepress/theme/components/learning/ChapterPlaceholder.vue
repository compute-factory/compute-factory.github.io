<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vitepress'
import { findChapterByPath } from '../../../content/curriculum'

const route = useRoute()
const chapter = computed(() => findChapterByPath(route.path))
</script>

<template>
  <article v-if="chapter" class="chapter-page">
    <h1 class="chapter-title">{{ chapter.title }}</h1>

    <!-- 计划小节渲染成二级标题（带 id），左侧本页目录才能列出它们，和正文写好后的结构一致 -->
    <h2 v-for="(item, index) in chapter.items" :id="`section-${index + 1}`" :key="item" class="outline-item">
      {{ item }}
    </h2>
  </article>
</template>

<style scoped>
.chapter-page {
  padding-bottom: 3rem;
}

.chapter-page .chapter-title {
  margin: 0 0 2rem;
  padding: 0;
  border: 0;
  font-size: clamp(1.9rem, 2.6vw, 2.375rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.25;
  color: var(--cf-ink);
}

.chapter-page .outline-item {
  margin: 0;
  padding: 0.8rem 0;
  border-top: 1px solid var(--cf-border);
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.7;
  color: var(--cf-ink);
}

.chapter-page .outline-item:last-child { border-bottom: 1px solid var(--cf-border); }

@media (max-width: 640px) {
  .chapter-page .chapter-title { font-size: 1.75rem; }
}
</style>
