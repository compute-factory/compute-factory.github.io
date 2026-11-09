<script setup lang="ts">
import { learningTopics } from '../../../content/learning'
import KnowledgeMap from './KnowledgeMap.vue'
</script>

<template>
  <div class="cf-page learning-page">
    <nav class="topic-nav" aria-label="主题教程">
      <a v-for="topic in learningTopics" :key="topic.id" :href="'#' + topic.id">{{ topic.title }}</a>
    </nav>
    <header class="learning-header">
      <p class="cf-eyebrow">LEARNING MAP / 主题教程</p>
      <h1>AI Infra 学习地图</h1>
      <p>从五个方向开始，逐步展开你的知识地图。</p>
    </header>
    <KnowledgeMap />
  </div>
</template>

<style scoped>
.learning-page { padding-bottom: 1.5rem; }
.topic-nav { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; padding-block: 1rem; border-bottom: 1px solid var(--cf-border); }
.topic-nav a { padding: 0.6rem 0; font-weight: 600; color: var(--cf-text); }
.topic-nav a:hover { color: var(--cf-gold); }
.learning-header { padding-block: 1.75rem 1.25rem; }
.learning-header h1 { margin-block: 0.5rem 0.6rem; font-size: clamp(1.9rem, 3vw, 3rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1.25; }
.learning-header > p:last-child { color: var(--cf-text); line-height: 1.75; }
@media (max-width: 560px) {
  .topic-nav { justify-content: flex-start; font-size: 0.875rem; }
}
</style>
