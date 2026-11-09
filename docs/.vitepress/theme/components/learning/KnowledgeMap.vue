<script setup lang="ts">
import { learningTopics } from '../../../content/learning'

const rowHeight = 96
const height = learningTopics.length * rowHeight

function branchPath(index: number) {
  return `M 0 ${height / 2} C 70 ${height / 2}, 45 ${index * rowHeight + rowHeight / 2}, 120 ${index * rowHeight + rowHeight / 2}`
}
</script>

<template>
  <div class="knowledge-map" aria-label="AI Infra 教学知识图">
    <div class="map-root"><span>AI Infra</span><small>从这里出发</small></div>
    <svg class="map-branches" :viewBox="'0 0 120 ' + height" preserveAspectRatio="none" aria-hidden="true">
      <path v-for="(topic, index) in learningTopics" :key="topic.id" :d="branchPath(index)" />
    </svg>
    <ul class="map-topics">
      <li v-for="(topic, index) in learningTopics" :key="topic.id">
        <a class="topic-node" :href="'#' + topic.id">
          <span class="node-number">0{{ index + 1 }}</span>
          <strong>{{ topic.title }}</strong>
          <span class="node-arrow" aria-hidden="true">↗</span>
        </a>
        <div class="topic-concepts">
          <span v-for="concept in topic.concepts" :key="concept">{{ concept }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.knowledge-map {
  display: grid;
  grid-template-columns: 8rem 7rem minmax(0, 1fr);
  align-items: center;
  padding: 1.5rem 2rem;
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background-color: var(--cf-soft);
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 16px 16px;
}
.map-root {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  aspect-ratio: 1;
  border: 2px solid var(--cf-amber);
  border-radius: 50%;
  background: var(--cf-surface);
}
.map-root span { font-size: 1.4rem; font-weight: 750; }
.map-root small { margin-top: 0.35rem; color: var(--cf-muted); font-size: 0.75rem; }
.map-branches { width: 100%; height: 100%; min-height: 480px; overflow: visible; }
.map-branches path { fill: none; stroke: var(--cf-amber); stroke-width: 2; vector-effect: non-scaling-stroke; }
.map-topics { margin: 0; padding: 0; list-style: none; }
.map-topics li { display: grid; grid-template-columns: 13rem minmax(0, 1fr); align-items: center; gap: 1.25rem; min-height: 96px; }
.topic-node {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.65rem;
  background: var(--cf-surface);
}
.topic-node:hover, .topic-node:focus-visible { border-color: var(--cf-gold); background: var(--cf-warm); }
.node-number { color: var(--cf-gold); font-family: var(--vp-font-family-mono); font-size: 0.75rem; }
.node-arrow { margin-left: auto; color: var(--cf-gold); }
.topic-concepts { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.topic-concepts span { border-bottom: 1px solid var(--cf-border); padding: 0.3rem 0.2rem; color: var(--cf-text); font-size: 0.8125rem; }
@media (max-width: 1000px) {
  .knowledge-map { grid-template-columns: 7rem 4rem minmax(0, 1fr); padding: 1rem; }
  .map-topics li { grid-template-columns: minmax(0, 1fr); gap: 0.25rem; padding-block: 0.5rem; }
  .topic-concepts { padding-left: 0.5rem; }
}
@media (max-width: 560px) {
  .knowledge-map { grid-template-columns: 1fr; gap: 1.25rem; }
  .map-root { width: 6rem; }
  .map-root span { font-size: 1.1rem; }
  .map-branches { display: none; }
  .map-topics { margin-left: 1rem; padding-left: 1rem; border-left: 2px solid var(--cf-amber); }
  .map-topics li { position: relative; }
  .map-topics li::before { content: ''; position: absolute; top: 2.25rem; left: -1rem; width: 1rem; border-top: 2px solid var(--cf-amber); }
}
</style>
