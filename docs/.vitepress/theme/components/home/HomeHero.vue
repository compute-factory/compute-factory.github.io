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
      <p class="hero-description">
        面向初学者的 AI Infra 教学站。按学习地图从大模型基础读到推理、GPU 算子和分布式训练，每篇围绕一个能动手验证的问题展开。
      </p>
      <a class="cf-button hero-action" :href="withBase('/guide/')">开始学习</a>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  display: grid;
  grid-template-columns: clamp(8rem, 14vw, 17rem) minmax(0, 1fr);
  align-items: center;
  gap: clamp(1.75rem, 4vw, 3.5rem);
  padding: clamp(2rem, 4vw, 3.5rem);
  margin-block: clamp(1.75rem, 4vw, 3rem) 0;
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background: var(--cf-soft);
}

.hero-logo {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  background-image: radial-gradient(var(--cf-grid) 1px, transparent 1px);
  background-size: 11px 11px;
}

.hero-logo img { width: 88%; height: auto; }

.hero-copy h1 {
  margin: 0 0 0.85rem;
  font-size: clamp(2.5rem, 4vw, 4.5rem);
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1.1;
}

.hero-description {
  max-width: 38em;
  font-size: clamp(1rem, 1.05vw, 1.125rem);
  line-height: 1.85;
  color: var(--cf-text);
}

.hero-action {
  margin-top: clamp(1.25rem, 2vw, 1.75rem);
  min-height: 3rem;
  padding-inline: 1.5rem;
  font-size: 1rem;
}

@media (max-width: 760px) {
  .home-hero {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    padding: 1.75rem;
  }

  .hero-logo { width: 7rem; }
}

@media (max-width: 480px) {
  .home-hero { padding: 1.25rem; }
  .hero-copy h1 { font-size: 2.25rem; }
}
</style>
