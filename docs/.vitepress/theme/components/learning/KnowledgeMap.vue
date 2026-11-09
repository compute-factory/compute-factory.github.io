<script setup lang="ts">
import { withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import { curriculum } from '../../../content/curriculum'
</script>

<template>
  <div class="knowledge-map" aria-label="AI Infra 教学知识图">
    <div class="map-root"><strong>AI Infra</strong><small>学习地图</small></div>
    <ul class="map-topics">
      <li v-for="(topic, index) in learningTopics" :id="topic.id" :key="topic.id" class="map-branch cf-anchor">
        <div class="branch-heading">
          <span class="cf-eyebrow">0{{ index + 1 }}</span>
          <h2>{{ topic.title }}</h2>
          <a :href="withBase(topic.links[0].href)">阅读入口 <span aria-hidden="true">↗</span></a>
        </div>
        <div class="module-list">
          <details v-for="module in curriculum[topic.id]" :key="module.title" class="map-module">
            <summary>{{ module.title }}<span aria-hidden="true">+</span></summary>
            <ul>
              <li v-for="item in module.items" :key="item">{{ item }}</li>
            </ul>
          </details>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.knowledge-map {
  display: grid;
  grid-template-columns: clamp(7rem, 12vw, 14rem) minmax(0, 1fr);
  align-items: center;
  gap: clamp(1.5rem, 4vw, 5rem);
  padding: clamp(1rem, 3vw, 3rem);
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background-color: var(--cf-soft);
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 20px 20px;
}
.map-root {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 2px solid var(--cf-amber);
  border-radius: 50%;
  background: var(--cf-surface);
}
.map-root::after { content: ''; position: absolute; left: 100%; width: clamp(1.5rem, 4vw, 5rem); top: 50%; border-top: 2px solid var(--cf-amber); }
.map-root strong { font-size: clamp(1.1rem, 2vw, 2rem); }
.map-root small { color: var(--cf-muted); margin-top: 0.35rem; }
.map-topics { margin: 0; padding: 0; list-style: none; }
.map-branch { position: relative; display: grid; grid-template-columns: 11rem minmax(0, 1fr); gap: 1.5rem; padding: 1.25rem 0 1.25rem 2rem; }
.map-branch::before { content: ''; position: absolute; left: 0; top: 50%; width: 2rem; border-top: 2px solid var(--cf-amber); }
.map-branch::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: 2px solid var(--cf-amber); }
.map-branch:first-child::after { top: 50%; }
.map-branch:last-child::after { bottom: 50%; }
.branch-heading { position: relative; align-self: center; padding: 1rem; background: var(--cf-surface); border: 1px solid var(--cf-border); border-radius: 0.75rem; }
.branch-heading::after { content: ''; position: absolute; left: 100%; top: 50%; width: 1.5rem; border-top: 2px solid var(--cf-amber); }
.branch-heading h2 { margin-block: 0.3rem 0.65rem; font-size: 1.125rem; font-weight: 700; }
.branch-heading a { color: var(--cf-gold); font-size: 0.8125rem; }
.branch-heading a:hover { text-decoration: underline; }
.map-branch:target .branch-heading { border-color: var(--cf-gold); }
.module-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 0.75rem; }
.map-module { min-width: 0; background: var(--cf-surface); border: 1px solid var(--cf-border); border-radius: 0.5rem; }
.map-module summary { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; min-height: 3.25rem; padding: 0.75rem; cursor: pointer; list-style: none; font-weight: 600; }
.map-module summary::-webkit-details-marker { display: none; }
.map-module summary span { color: var(--cf-gold); flex-shrink: 0; }
.map-module[open] summary { border-bottom: 1px solid var(--cf-border); }
.map-module[open] summary span { transform: rotate(45deg); }
.map-module ul { padding: 0.5rem 0.85rem 0.75rem 1.75rem; list-style: disc; }
.map-module li { padding-block: 0.3rem; color: var(--cf-text); font-size: 0.875rem; line-height: 1.7; overflow-wrap: anywhere; }
.map-module summary:focus-visible { outline: 2px solid var(--cf-gold); outline-offset: 3px; }
@media (max-width: 1200px) {
  .module-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 850px) {
  .knowledge-map { grid-template-columns: 1fr; gap: 0.5rem; }
  .map-root { width: 7rem; }
  .map-root::after { display: none; }
  .map-branch { grid-template-columns: 1fr; padding-left: 1rem; gap: 0.75rem; }
  .map-branch::before { width: 1rem; top: 3.5rem; }
  .map-branch:first-child::after { top: 3.5rem; }
  .map-branch:last-child::after { bottom: auto; height: 3.5rem; }
  .branch-heading { width: fit-content; }
  .branch-heading::after { display: none; }
}
@media (max-width: 480px) {
  .module-list { grid-template-columns: 1fr; }
}
</style>
