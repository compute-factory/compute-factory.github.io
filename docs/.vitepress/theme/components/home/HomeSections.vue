<script setup lang="ts">
import { withBase } from 'vitepress'
import { homeFeatures } from '../../../content/site'
</script>

<template>
  <section class="home-sections" aria-labelledby="site-content">
    <h2 id="site-content">如何开始</h2>

    <div class="feature-grid">
      <section v-for="feature in homeFeatures" :id="feature.id" :key="feature.id" class="feature cf-anchor">
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.description }}</p>
        <a :href="withBase(feature.link.href)">{{ feature.link.text }}</a>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-sections { padding-block: 3.5rem 4rem; }

.home-sections > h2 {
  margin: 0 0 1.75rem;
  font-size: clamp(1.5rem, 2.4vw, 1.875rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1.75rem, 3.5vw, 3rem);
}

.feature {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  padding-top: 1.1rem;
  border-top: 2px solid var(--cf-ink);
}

.feature:target { border-top-color: var(--cf-amber); }

.feature h3 { font-size: 1.125rem; font-weight: 700; }

.feature p {
  color: var(--cf-text);
  font-size: 0.9375rem;
  line-height: 1.8;
}

.feature a {
  margin-top: auto;
  padding-top: 0.4rem;
  color: var(--cf-gold);
  font-size: 0.9375rem;
  font-weight: 650;
}

.feature a:hover { text-decoration: underline; text-underline-offset: 3px; }

@media (max-width: 760px) {
  .home-sections { padding-block: 2.5rem 3rem; }
  .feature-grid { grid-template-columns: 1fr; gap: 1.75rem; }
}
</style>
