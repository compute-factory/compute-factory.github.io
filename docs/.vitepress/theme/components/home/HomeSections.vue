<script setup lang="ts">
import { withBase } from 'vitepress'
import { homeFeatures } from '../../../content/site'
</script>

<template>
  <section class="home-sections" aria-labelledby="site-content">
    <h2 id="site-content">如何开始</h2>

    <div class="feature-grid">
      <section v-for="feature in homeFeatures" :id="feature.id" :key="feature.id" class="feature cf-anchor">
        <p class="feature-number cf-eyebrow">{{ feature.number }}</p>
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.description }}</p>
        <a :href="withBase(feature.link.href)">{{ feature.link.text }} <span aria-hidden="true">→</span></a>
      </section>
    </div>

  </section>
</template>

<style scoped>
.home-sections { padding-block: 2.75rem 3.25rem; }
.home-sections > h2 { margin-top: 0.35rem; font-size: clamp(1.65rem, 3vw, 2.15rem); font-weight: 750; }

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
  margin-top: 1.25rem;
}

.feature {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 1.375rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.875rem;
  background: var(--cf-surface);
}

.feature:target { border-color: var(--cf-gold); background: var(--cf-soft); }
.feature-number { padding: 0.125rem 0.45rem; border-radius: 4px; background: var(--cf-warm); }
.feature h3 { font-size: 1.2rem; font-weight: 700; }
.feature p:not(.feature-number) { color: var(--cf-text); line-height: 1.7; }

.home-sections a { color: var(--cf-gold); font-weight: 650; }
.home-sections a:hover { text-decoration: underline; text-underline-offset: 3px; }
.feature a { margin-top: auto; padding-top: 0.2rem; }


@media (max-width: 720px) {
  .feature-grid { grid-template-columns: 1fr; }
}
</style>
