<script setup lang="ts">
import { BookOpen } from '@lucide/vue'
import { withBase } from 'vitepress'

// Fixed streams make the first frame identical during prerendering and hydration.
const streams = ['01A3F0', '10C01E', 'F170B0', '018A01', '410D01', '1F00C0', '01B8A0', 'C701F1', '018D00', '100A0F', '01F711', '10E4D0']
</script>

<template>
  <section class="home-hero" aria-labelledby="home-title">
    <div class="hero-stage">
      <div class="hero-copy">
        <p class="hero-brand" lang="en">Compute Factory</p>
        <h1 id="home-title">算力<span>工地</span></h1>
        <p class="hero-lead">面向初学者的 AI Infra 教学站</p>
        <p class="hero-description">沿着学习地图，从大模型基础走到推理、GPU 算子、训练优化和分布式并行。每篇围绕一个能动手验证的问题展开。</p>
        <a class="cf-button hero-action" :href="withBase('/guide/')"><BookOpen :size="19" aria-hidden="true" />开始学习</a>
      </div>

      <div class="hero-art" aria-hidden="true">
        <div class="glyph-field">
          <span v-for="(stream, index) in streams" :key="stream" :style="{ '--column': index }">{{ stream }}</span>
        </div>
        <div class="art-frame"></div>
        <img :src="withBase('/images/compute-board.webp')" width="1080" height="720" fetchpriority="high" alt="">
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  margin-top: clamp(1rem, 2.5vw, 2.25rem);
  overflow: hidden;
  border: 1px solid #373935;
  border-radius: 1.15rem;
  background: #181b1b;
  color: #f6f5ed;
}

.hero-stage {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: 1.12fr 1fr;
  align-items: center;
  background:
    radial-gradient(ellipse at 80% 50%, #57452252, transparent 48%),
    linear-gradient(110deg, #222522, #171a1b 72%);
}

.hero-stage::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  background-image: linear-gradient(#f1e7c80c 1px, transparent 1px), linear-gradient(90deg, #f1e7c80c 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(90deg, #0003, black 65%);
}

.hero-copy {
  z-index: 1;
  padding: clamp(2.5rem, 4.5vw, 4.25rem) 0 clamp(2.75rem, 4.5vw, 4.25rem) clamp(2rem, 4.4vw, 4.25rem);
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #ffcf57;
  font: 650 0.8rem/1.3 var(--vp-font-family-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-brand::before {
  content: '';
  width: 2.25rem;
  height: 0.75rem;
  background: repeating-linear-gradient(-56deg, transparent 0 4px, currentColor 4px 8px);
}

.hero-copy h1 {
  margin: 1.05rem 0 1.1rem;
  font-size: clamp(3.5rem, 5.6vw, 5.6rem);
  font-weight: 850;
  letter-spacing: -0.045em;
  line-height: 1.17;
}

.hero-copy h1 span { color: #ffca43; }

@media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
  .hero-copy h1 span {
    background: linear-gradient(110deg, #ffca43 36%, #fff0ab 49%, #ffca43 62%) 100% / 280% 100%;
    background-clip: text;
    color: transparent;
    animation: title-sheen 6.5s ease-in-out infinite;
  }
}

@keyframes title-sheen {
  0%, 52% { background-position-x: 100%; }
  86%, 100% { background-position-x: 0%; }
}
.hero-lead { font-size: clamp(1.1rem, 1.55vw, 1.45rem); line-height: 1.6; font-weight: 650; }
.hero-description { max-width: 29em; margin-top: 0.45rem; color: #c9ccc5; font-size: 1rem; line-height: 1.85; }
.hero-action { margin-top: 1.7rem; gap: 0.6rem; padding-inline: 1.25rem; min-height: 2.9rem; }
.home-hero a:focus-visible { outline: 2px solid #ffe298; outline-offset: 3px; }

.hero-art {
  position: relative;
  display: grid;
  place-items: center;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  align-self: stretch;
  min-width: 0;
  margin-right: clamp(1.5rem, 3vw, 3.25rem);
  isolation: isolate;
}

.hero-art img {
  width: min(92%, 33rem);
  height: auto;
  filter: drop-shadow(0 1.1rem 0.8rem #0006);
}

.art-frame {
  position: absolute;
  inset: 11% 1% 10% 2%;
  z-index: -1;
  color: #ddc37765;
  background:
    linear-gradient(currentColor, currentColor) top left / 15px 1px,
    linear-gradient(currentColor, currentColor) top left / 1px 15px,
    linear-gradient(currentColor, currentColor) bottom right / 15px 1px,
    linear-gradient(currentColor, currentColor) bottom right / 1px 15px;
  background-repeat: no-repeat;
}

.glyph-field {
  position: absolute;
  z-index: -1;
  inset: 0 -4% 0 -6%;
  container-type: size;
  overflow: hidden;
  mask-image: linear-gradient(transparent, black 18% 82%, transparent);
}

.glyph-field span {
  position: absolute;
  top: 0;
  left: calc(3% + var(--column) * 8.2%);
  writing-mode: vertical-rl;
  text-orientation: upright;
  font: 0.72rem/1 var(--vp-font-family-mono);
  letter-spacing: 0.25em;
  color: #eec357;
  opacity: 0.43;
  mask-image: linear-gradient(transparent, black);
  animation: glyph-fall calc(9s + var(--column) * 0.26s) linear infinite;
  animation-delay: calc(-3.1s * var(--column) - 2s);
}

@keyframes glyph-fall {
  from { transform: translateY(-100%); }
  to { transform: translateY(100cqh); }
}

@media (max-width: 800px) {
  .hero-stage { grid-template-columns: 1.25fr 1fr; }
  .hero-copy { padding-left: 1.75rem; }
  .hero-art { margin-right: 0.9rem; }
}

@media (max-width: 600px) {
  .hero-stage { grid-template-columns: minmax(0, 1fr); }
  .hero-copy { padding: 1.7rem 1.25rem 0; }
  .hero-copy h1 { font-size: clamp(3rem, 12vw, 4rem); margin-block: 0.7rem; }
  .hero-description { font-size: 1rem; line-height: 1.7; }
  .hero-action { margin-top: 1.15rem; padding-inline: 0.8rem; font-size: 0.925rem; min-height: 2.75rem; }
  .hero-art { margin: 0.65rem 0.9rem; height: clamp(9.5rem, 43vw, 13rem); }
  .hero-art img { width: auto; max-width: 92%; height: 100%; object-fit: contain; }
}

@media (prefers-reduced-motion: reduce) {
  .glyph-field span { animation: none; top: calc(5% + var(--column) * 6%); }
}
</style>
