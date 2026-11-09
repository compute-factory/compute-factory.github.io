<script setup lang="ts">
import { withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import { curriculum } from '../../../content/curriculum'

// SVG coordinate space: one row per topic
const ROW = 130
const svgH = learningTopics.length * ROW
const centerY = svgH / 2

function branchPath(index: number): string {
  const ty = index * ROW + ROW / 2
  return `M 0 ${centerY} C 55 ${centerY}, 45 ${ty}, 100 ${ty}`
}
</script>

<template>
  <div class="km" aria-label="AI Infra 教学知识图">

    <!-- ① Hub -->
    <div class="km-hub" role="img" aria-label="中心节点：AI Infra 学习地图">
      <div class="hub-outer">
        <div class="hub-inner">
          <span class="hub-title">AI Infra</span>
          <small class="hub-sub">学习地图</small>
        </div>
      </div>
    </div>

    <!-- ② Animated bezier branches -->
    <svg class="km-svg"
         :viewBox="`0 0 100 ${svgH}`"
         preserveAspectRatio="none"
         aria-hidden="true">
      <g v-for="(topic, i) in learningTopics" :key="topic.id">
        <path :d="branchPath(i)" class="branch" :style="`--i:${i}`" />
        <circle cx="100" :cy="i * ROW + ROW / 2" r="5"
                class="branch-dot" :style="`--i:${i}`" />
      </g>
    </svg>

    <!-- ③ Topic cards -->
    <ul class="km-cards">
      <li v-for="(topic, i) in learningTopics" :key="topic.id" class="km-row">
        <div :id="topic.id" class="card cf-anchor">
          <div class="card-head">
            <span class="card-num">0{{ i + 1 }}</span>
            <strong class="card-name">{{ topic.title }}</strong>
            <a :href="withBase(topic.links[0].href)"
               class="card-link"
               :aria-label="`${topic.title} · ${topic.links[0].text}`">
              阅读入口&nbsp;<span aria-hidden="true">↗</span>
            </a>
          </div>
          <ul class="chips" aria-label="子主题列表">
            <li v-for="mod in curriculum[topic.id]"
                :key="mod.title"
                class="chip">{{ mod.title }}</li>
          </ul>
        </div>
      </li>
    </ul>

  </div>
</template>

<style scoped>
/* ── Layout grid ─────────────────────────────────────── */
.km {
  display: grid;
  grid-template-columns: minmax(80px, 13%) minmax(32px, 18%) minmax(0, 1fr);
  align-items: center;
  min-height: max(30rem, calc(100svh - 22rem));
  padding: clamp(1.25rem, 3vw, 2.5rem);
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background-color: var(--cf-soft);
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 20px 20px;
  gap: 0 0.25rem;
}

/* ── Hub ─────────────────────────────────────────────── */
.km-hub { display: flex; justify-content: center; align-items: center; }

.hub-outer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(76px, 11vw, 128px);
  aspect-ratio: 1;
  border: 2px solid var(--cf-amber);
  border-radius: 50%;
  background: var(--cf-surface);
  box-shadow:
    0 0 0 6px color-mix(in srgb, var(--cf-amber) 18%, transparent),
    inset 0 0 28px color-mix(in srgb, var(--cf-amber) 10%, transparent);
}

.hub-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15em;
  text-align: center;
  padding: 0.5em;
}

.hub-title {
  font-size: clamp(0.7rem, 1.3vw, 1rem);
  font-weight: 800;
  color: var(--cf-ink);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.hub-sub {
  font-size: 0.65rem;
  color: var(--cf-muted);
  letter-spacing: 0.02em;
}

/* ── SVG branches ────────────────────────────────────── */
.km-svg { width: 100%; align-self: stretch; overflow: visible; }

.branch {
  fill: none;
  stroke: var(--cf-amber);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
  animation: draw-in 0.55s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: calc(0.1s + var(--i) * 0.07s);
}

.branch-dot {
  fill: var(--cf-amber);
  opacity: 0;
  animation: pop-in 0.2s ease forwards;
  animation-delay: calc(0.55s + var(--i) * 0.07s);
}

@keyframes draw-in { to { stroke-dashoffset: 0; } }
@keyframes pop-in  { to { opacity: 1; } }

/* ── Cards column ────────────────────────────────────── */
.km-cards {
  display: grid;
  grid-auto-rows: 1fr;
  align-self: stretch;
  margin: 0;
  padding: 0;
  list-style: none;
  gap: 0.5rem;
}

.km-row { display: flex; align-items: stretch; }

.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.875rem clamp(0.75rem, 1.5vw, 1.375rem);
  border: 1px solid var(--cf-border);
  border-left: 3px solid var(--cf-amber);
  border-radius: 0.75rem;
  background: var(--cf-surface);
  transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
}

.card:hover,
.card:focus-within,
.card:target {
  border-color: var(--cf-gold);
  border-left-color: var(--cf-gold);
  background: var(--cf-warm);
  box-shadow: 0 3px 14px -5px color-mix(in srgb, var(--cf-gold) 30%, transparent);
  outline: none;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-num {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--cf-gold);
  background: var(--cf-warm);
  padding: 0.1em 0.45em;
  border-radius: 4px;
  flex-shrink: 0;
}

.card-name {
  font-size: clamp(0.9rem, 1.2vw, 1.1rem);
  font-weight: 700;
  color: var(--cf-ink);
  line-height: 1.3;
}

.card-link {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--cf-gold);
  white-space: nowrap;
  text-decoration: none;
  flex-shrink: 0;
}
.card-link:hover { text-decoration: underline; text-underline-offset: 3px; }

/* Sub-topic chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  padding: 0.18em 0.62em;
  border: 1px solid var(--cf-border);
  border-radius: 9999px;
  font-size: 0.72rem;
  color: var(--cf-text);
  background: var(--cf-soft);
  line-height: 1.6;
  white-space: nowrap;
  transition: border-color 0.15s;
}

.card:hover .chip,
.card:focus-within .chip {
  border-color: color-mix(in srgb, var(--cf-amber) 60%, transparent);
}

/* ── Mobile ──────────────────────────────────────────── */
@media (max-width: 600px) {
  .km {
    grid-template-columns: 1fr;
    gap: 1.25rem;
    min-height: unset;
    padding: 1.25rem;
  }

  .km-hub { justify-content: flex-start; }
  .hub-outer { width: 72px; }
  .km-svg { display: none; }

  .km-cards {
    padding-left: 1.125rem;
    border-left: 2px solid var(--cf-amber);
    gap: 0.625rem;
  }

  .km-row { position: relative; }

  .km-row::before {
    content: '';
    position: absolute;
    left: -1.5rem;
    top: calc(50% - 4px);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--cf-amber);
    border: 2px solid var(--cf-soft);
  }
}
</style>
