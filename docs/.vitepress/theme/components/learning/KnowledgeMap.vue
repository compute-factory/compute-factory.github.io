<script setup lang="ts">
import { withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'

const rowHeight = 100
const height = learningTopics.length * rowHeight

function branchPath(index: number) {
  return `M 0 ${height / 2} C 65 ${height / 2}, 55 ${index * rowHeight + rowHeight / 2}, 120 ${index * rowHeight + rowHeight / 2}`
}
</script>

<template>
  <div class="knowledge-map" aria-label="AI Infra 教学知识图">
    <div class="map-root"><span>AI Infra</span><small>学习地图</small></div>
    <svg class="map-branches" :viewBox="'0 0 120 ' + height" preserveAspectRatio="none" aria-hidden="true">
      <path v-for="(topic, index) in learningTopics" :key="topic.id" :d="branchPath(index)" />
    </svg>
    <ul class="map-topics">
      <li v-for="(topic, index) in learningTopics" :key="topic.id">
        <a :id="topic.id" class="topic-node cf-anchor" :href="withBase(topic.links[0].href)" :aria-label="topic.title + '：' + topic.summary">
          <span class="node-number">0{{ index + 1 }}</span>
          <strong>{{ topic.title }}</strong>
          <span class="node-arrow" aria-hidden="true">↗</span>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.knowledge-map {
  --map-height: max(34rem, calc(100svh - 19rem));
  display: grid;
  grid-template-columns: minmax(7rem, 15%) minmax(4rem, 33%) minmax(0, 1fr);
  align-items: center;
  height: var(--map-height);
  padding: clamp(1rem, 3vw, 3rem);
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background-color: var(--cf-soft);
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 20px 20px;
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
.map-root span { font-size: clamp(1.1rem, 2.2vw, 2.5rem); font-weight: 750; }
.map-root small { margin-top: 0.35rem; color: var(--cf-muted); font-size: 0.8125rem; }
.map-branches { width: 100%; height: 100%; min-height: 0; min-width: 0; align-self: stretch; overflow: visible; }
.map-branches path { fill: none; stroke: var(--cf-amber); stroke-width: 2; vector-effect: non-scaling-stroke; }
.map-topics { display: grid; grid-auto-rows: 1fr; align-self: stretch; margin: 0; padding: 0; list-style: none; }
.map-topics li { display: flex; align-items: center; min-height: 5.5rem; }
.topic-node {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: min(100%, 25rem);
  min-height: 4rem;
  padding: 1rem clamp(0.75rem, 2vw, 2rem);
  border: 1px solid var(--cf-border);
  border-radius: 0.75rem;
  background: var(--cf-surface);
}
.topic-node:hover, .topic-node:focus-visible, .topic-node:target { border-color: var(--cf-gold); background: var(--cf-warm); }
.topic-node strong { font-size: clamp(1rem, 1.25vw, 1.5rem); }
.node-number { color: var(--cf-gold); font-family: var(--vp-font-family-mono); font-size: 0.8125rem; }
.node-arrow { margin-left: auto; color: var(--cf-gold); }
@media (max-width: 560px) {
  .knowledge-map { grid-template-columns: 1fr; gap: 1rem; height: auto; min-height: 34rem; }
  .map-root { width: 6rem; }
  .map-branches { display: none; }
  .map-topics { margin-left: 1rem; padding-left: 1rem; border-left: 2px solid var(--cf-amber); }
  .map-topics li { position: relative; }
  .map-topics li::before { content: ''; position: absolute; top: 50%; left: -1rem; width: 1rem; border-top: 2px solid var(--cf-amber); }
}
</style>
