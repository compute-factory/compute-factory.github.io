<script setup lang="ts">
import { BookOpenText, FileText, FolderGit2 } from '@lucide/vue'
import type { Component } from 'vue'
import { withBase } from 'vitepress'
import { homeFeatures } from '../../../content/site'

const featureIcons: Record<string, Component> = {
  tutorials: BookOpenText,
  papers: FileText,
  'recommended-projects': FolderGit2,
}
</script>

<template>
  <section class="home-sections" aria-labelledby="site-content">
    <h2 id="site-content">如何开始</h2>

    <div class="feature-grid">
      <section v-for="feature in homeFeatures" :id="feature.id" :key="feature.id" class="feature cf-anchor">
        <div class="feature-heading">
          <span class="feature-icon">
            <component :is="featureIcons[feature.id] ?? BookOpenText" :size="24" :stroke-width="1.7" aria-hidden="true" />
          </span>
          <h3>{{ feature.title }}</h3>
        </div>
        <p>{{ feature.description }}</p>
        <a :href="withBase(feature.link.href)">{{ feature.link.text }}</a>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-sections { padding-block: clamp(2rem, 3.3vw, 3.25rem) clamp(3rem, 5vw, 4.5rem); }

.home-sections > h2 {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0 0 1.25rem;
  font-size: clamp(1.55rem, 2.2vw, 2rem);
  line-height: 1.4;
  font-weight: 750;
  letter-spacing: -0.035em;
}

.home-sections > h2::before { content: ''; width: 0.32rem; height: 0.95em; border-radius: 1px; background: var(--cf-amber); }
.feature-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(1rem, 1.65vw, 1.65rem); }

.feature {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: clamp(1.25rem, 2vw, 1.85rem);
  border: 1px solid color-mix(in srgb, var(--cf-amber) 34%, var(--cf-border));
  border-radius: 0.9rem;
  background: linear-gradient(145deg, var(--cf-soft), var(--cf-surface) 78%);
  transition: border-color 180ms, box-shadow 180ms;
}

/* The tutorial is the starting point for new readers. */
#tutorials {
  border-color: color-mix(in srgb, var(--cf-amber) 72%, var(--cf-border));
  background: linear-gradient(130deg, color-mix(in srgb, var(--cf-amber) 46%, var(--cf-warm)), var(--cf-warm) 78%);
}
html.dark #tutorials {
  background: linear-gradient(130deg, color-mix(in srgb, var(--cf-amber) 12%, var(--cf-warm)), var(--cf-warm) 78%);
}

.feature::before {
  content: '';
  position: absolute;
  top: 0;
  right: 1.35rem;
  width: 2.6rem;
  height: 0.32rem;
  background: repeating-linear-gradient(-55deg, transparent 0 4px, var(--cf-amber) 4px 8px);
}

.feature:is(:hover, :focus-within, :target) {
  border-color: var(--cf-gold);
  box-shadow: 0 6px 20px -12px color-mix(in srgb, var(--cf-gold) 50%, transparent);
}

.feature-heading { display: flex; align-items: center; gap: 0.8rem; }
.feature-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid color-mix(in srgb, var(--cf-amber) 45%, var(--cf-border));
  border-radius: 0.6rem;
  background: var(--cf-warm);
  color: var(--cf-gold);
}
#tutorials .feature-icon { color: #222018; background: var(--cf-amber); }
.feature h3 { font-size: 1.2rem; font-weight: 730; line-height: 1.4; }
.feature p { margin-block: 1rem 1.2rem; color: var(--cf-text); font-size: 1rem; line-height: 1.8; }
.feature a {
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px solid color-mix(in srgb, var(--cf-gold) 22%, transparent);
  color: var(--cf-gold);
  font-size: 0.925rem;
  font-weight: 650;
}
.feature a::after { content: ''; position: absolute; inset: 0; border-radius: 0.9rem; }
.feature:is(:hover, :focus-within) a { text-decoration: underline; text-underline-offset: 4px; }

@media (max-width: 760px) {
  .feature-grid { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .feature { transition: none; }
}
</style>
