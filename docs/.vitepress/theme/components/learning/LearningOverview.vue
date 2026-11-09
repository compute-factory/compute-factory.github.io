<script setup lang="ts">
import { withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import KnowledgeMap from './KnowledgeMap.vue'
</script>

<template>
  <div class="cf-page learning-page">
    <nav class="topic-nav" aria-label="教学板块">
      <a v-for="topic in learningTopics" :key="topic.id" :href="'#' + topic.id">{{ topic.title }}</a>
    </nav>
    <header class="learning-header">
      <p class="cf-eyebrow">LEARNING MAP / 教学板块</p>
      <h1>找到你的开工方向</h1>
      <p>第一次来，从入门导读开始。点击地图上的节点，进入对应的学习方向。</p>
    </header>
    <KnowledgeMap />
    <div class="topic-details">
      <section v-for="(topic, index) in learningTopics" :id="topic.id" :key="topic.id" class="topic-detail cf-anchor">
        <span class="topic-index cf-eyebrow">0{{ index + 1 }}</span>
        <div>
          <h2>{{ topic.title }}</h2>
          <p>{{ topic.summary }}</p>
          <div class="reading-links">
            <a v-for="link in topic.links" :key="link.href" :href="withBase(link.href)">{{ link.text }} <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.learning-page { padding-bottom: 3rem; }
.topic-nav { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; padding-block: 1rem; border-bottom: 1px solid var(--cf-border); }
.topic-nav a { padding: 0.6rem 0; font-weight: 600; color: var(--cf-text); }
.topic-nav a:hover { color: var(--cf-gold); }
.learning-header { padding-block: 2.5rem 1.75rem; }
.learning-header h1 { margin-block: 0.5rem 0.6rem; font-size: clamp(1.9rem, 4vw, 2.75rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1.25; }
.learning-header > p:last-child { color: var(--cf-text); line-height: 1.75; }
.topic-details { margin-top: 2rem; }
.topic-detail { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: 1rem; padding: 1.75rem 1rem; border-bottom: 1px solid var(--cf-border); }
.topic-detail:target { background: var(--cf-soft); }
.topic-index { padding-top: 0.35rem; }
.topic-detail h2 { font-size: 1.35rem; font-weight: 700; }
.topic-detail p { max-width: 48em; margin-top: 0.5rem; color: var(--cf-text); line-height: 1.8; }
.reading-links { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; margin-top: 0.75rem; }
.reading-links a { color: var(--cf-gold); font-size: 0.9rem; font-weight: 600; }
.reading-links a:hover { text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 560px) {
  .topic-nav { justify-content: flex-start; font-size: 0.875rem; }
  .topic-detail { grid-template-columns: 1.5rem minmax(0, 1fr); gap: 0.75rem; padding-inline: 0; }
}
</style>
