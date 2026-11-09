<script setup lang="ts">
import { withBase } from 'vitepress'
</script>

<template>
  <section class="home-hero" aria-labelledby="home-title">
    <div class="hero-logo">
      <img :src="withBase('/logo.png')" width="1024" height="1024" alt="戴安全帽的芯片">
    </div>

    <div class="hero-copy">
      <h1 id="home-title">算力工地</h1>
      <p class="hero-english cf-eyebrow">Compute Factory</p>
      <p class="hero-description">初学者友好的 AI Infra 教学站。沿着学习地图，从认识什么是大模型，到成为一名Infra工程师</p>
    </div>

    <a class="cf-button hero-action" :href="withBase('/guide/')">
      开始学习 <span aria-hidden="true">→</span>
    </a>
  </section>
</template>

<style scoped>
.home-hero {
  display: grid;
  grid-template-columns: clamp(9rem, 16vw, 20rem) minmax(0, 1fr) auto;
  min-height: clamp(20rem, 45svh, 42rem);
  align-items: center;
  gap: clamp(1.75rem, 4vw, 3.75rem);
  padding: clamp(2rem, 4.5vw, 3.875rem);
  margin-block: clamp(1.75rem, 4.5vw, 3.75rem) 0;
  border: 1px solid var(--cf-border);
  border-radius: 1.25rem;
  background: var(--cf-soft);
}

.hero-logo {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 11px 11px;
}

.hero-logo img { width: 82%; height: auto; }

.hero-copy h1 {
  margin: 0.5rem 0 0.25rem;
  font-size: clamp(2.6rem, 4.5vw, 6rem);
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1.12;
}

.hero-english { margin-top: 0.5rem; font-size: 0.875rem; text-transform: uppercase; }
.hero-description { max-width: 50em; margin-top: 0.875rem; color: var(--cf-text); line-height: 1.75; }
.hero-action {
  justify-self: start;
  min-height: clamp(3.5rem, 4.4vw, 5rem);
  padding: 0.9rem clamp(1.5rem, 2vw, 3rem);
  font-size: clamp(1.125rem, 1.2vw, 1.75rem);
}

@media (min-width: 1440px) {
  .home-hero {
    width: 70vw;
    max-width: 100%;
    margin-inline: auto;
  }
}

@media (max-width: 850px) {
  .home-hero { grid-template-columns: minmax(5.5rem, 9rem) minmax(0, 1fr); }
  .hero-action { grid-column: 2; }
}

@media (max-width: 510px) {
  .home-hero { grid-template-columns: 1fr; gap: 1.2rem; padding: 1.5rem; }
  .hero-logo { width: 6rem; }
  .hero-logo img { width: 100%; }
  .hero-action { grid-column: 1; }
}
</style>
