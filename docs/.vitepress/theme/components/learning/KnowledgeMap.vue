<script setup lang="ts">
import { withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import { curriculum, chapterHref, topicPath } from '../../../content/curriculum'
</script>

<template>
  <div class="km" aria-label="AI Infra 教学知识图">
    <!-- 方向 → 模块 → 知识点 -->
    <ul class="km-branches">
      <li v-for="topic in learningTopics" :id="topic.id" :key="topic.id" class="km-branch cf-anchor">
        <div class="km-topic">
          <h2><a class="km-topic-link" :href="withBase(topicPath(topic.id))">{{ topic.title }}</a></h2>
        </div>

        <ul class="km-modules">
          <li v-for="mod in curriculum[topic.id]" :key="mod.slug" class="km-module">
            <a class="km-module-name" :href="withBase(chapterHref(topic.id, mod.slug))">{{ mod.title }}</a>
            <ul class="km-leaves">
              <li v-for="item in mod.items" :key="item">{{ item }}</li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/*
 * Connectors are pure CSS (pseudo-elements), so the tree stays aligned however
 * tall a row grows. --km-line / --km-gap drive every elbow in the map.
 */
.km {
  --km-line: 2px solid var(--cf-amber);
  --km-gap: clamp(1.25rem, 3vw, 3rem);
  padding: clamp(1rem, 3vw, 3rem);
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background-color: var(--cf-soft);
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* ── L1 branches ─────────────────────────────────────── */
.km-branches { margin: 0; padding: 0; list-style: none; }
.km-branch {
  position: relative;
  display: grid;
  grid-template-columns: minmax(11rem, 15rem) minmax(0, 1fr);
  align-items: center;
  column-gap: 2.5rem;
  padding: 1rem 0 1rem var(--km-gap);
}
/* elbow into the branch node, and the spine segment that joins the siblings */
.km-branch::before { content: ''; position: absolute; left: 0; top: 50%; width: var(--km-gap); border-top: var(--km-line); }
.km-branch::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: var(--km-line); }
.km-branch:first-child::after { top: 50%; }
.km-branch:last-child::after { bottom: 50%; }

.km-topic {
  position: relative;
  padding: 0.9rem 1rem;
  border: 1px solid var(--cf-border);
  border-left: 4px solid var(--cf-amber);
  border-radius: 0.75rem;
  background: var(--cf-surface);
  transition: border-color 0.18s, box-shadow 0.18s;
}
.km-topic::after { content: ''; position: absolute; left: 100%; top: 50%; width: 2.5rem; border-top: var(--km-line); }
.km-topic h2 { margin: 0; padding: 0; border: 0; font-size: 1.15rem; font-weight: 700; line-height: 1.3; color: var(--cf-ink); }
.km-topic-link { color: inherit; text-decoration: none; }
.km-topic-link:hover { color: var(--cf-gold); text-decoration: underline; text-underline-offset: 3px; }
.km-branch:target .km-topic,
.km-topic:focus-within { border-color: var(--cf-gold); box-shadow: 0 3px 14px -5px color-mix(in srgb, var(--cf-gold) 35%, transparent); }

/* ── L2 modules ──────────────────────────────────────── */
.km-modules { margin: 0; padding: 0; list-style: none; }
.km-module {
  position: relative;
  display: grid;
  grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
  align-items: center;
  column-gap: 1.5rem;
  margin: 0;
  padding: 0.35rem 0 0.35rem 1.5rem;
}
.km-module::before { content: ''; position: absolute; left: 0; top: 50%; width: 1.5rem; border-top: var(--km-line); }
.km-module::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: var(--km-line); }
.km-module:first-child::after { top: 50%; }
.km-module:last-child::after { bottom: 50%; }

.km-module-name {
  position: relative;
  display: block;
  padding: 0.55rem 0.8rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.5rem;
  background: var(--cf-surface);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cf-ink);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.km-module-name::after { content: ''; position: absolute; left: 100%; top: 50%; width: 1.5rem; border-top: 2px dashed var(--cf-amber); }
.km-module:hover .km-module-name,
.km-module-name:hover { border-color: var(--cf-gold); background: var(--cf-warm); color: var(--cf-gold); }

/* ── L3 leaves ───────────────────────────────────────── */
.km-leaves { display: flex; flex-wrap: wrap; gap: 0.35rem 0.4rem; margin: 0; padding: 0; list-style: none; }
.km-leaves li {
  margin: 0;
  padding: 0.15em 0.7em;
  border: 1px solid var(--cf-border);
  border-radius: 9999px;
  background: var(--cf-surface);
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--cf-text);
  overflow-wrap: anywhere;
}
.km-module:hover .km-leaves li { border-color: color-mix(in srgb, var(--cf-amber) 70%, transparent); }

/* ── Responsive ──────────────────────────────────────── */
@media (max-width: 1100px) {
  .km-branch { grid-template-columns: 1fr; row-gap: 0.75rem; align-items: start; }
  .km-topic { width: fit-content; max-width: 100%; }
  .km-topic::after { display: none; }
  /* elbow now meets the node's heading row instead of the row centre */
  .km-branch::before { top: 2.25rem; }
  .km-branch:first-child::after { top: 2.25rem; }
  .km-branch:last-child::after { bottom: auto; height: 2.25rem; }
  .km-modules { padding-left: 1rem; border-left: var(--km-line); margin-left: 0.25rem; }
  .km-module { padding-left: 0; }
  .km-module::before, .km-module::after { display: none; }
}

@media (max-width: 760px) {
  .km-branch { padding-left: 1.25rem; --km-gap: 1.25rem; }
  .km-module { grid-template-columns: 1fr; row-gap: 0.45rem; padding-block: 0.5rem; }
  .km-module-name::after { display: none; }
}
</style>
