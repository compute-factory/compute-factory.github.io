<script setup lang="ts">
import { withBase } from 'vitepress'
import { homeFeatures, repository } from '../../../content/site'
</script>

<template>
  <section class="home-sections" aria-labelledby="site-content">
    <p class="cf-eyebrow">开工指南</p>
    <h2 id="site-content">在工地学什么</h2>

    <div class="feature-grid">
      <section v-for="feature in homeFeatures" :id="feature.id" :key="feature.id" class="feature cf-anchor">
        <p class="feature-number cf-eyebrow">{{ feature.number }}</p>
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.description }}</p>
        <a :href="withBase(feature.link.href)">{{ feature.link.text }} <span aria-hidden="true">→</span></a>
      </section>
    </div>

    <div class="site-meta">
      <section id="updates" class="cf-anchor">
        <h2>更新日志</h2>
        <p>查看教程、实验和站点的更新记录。</p>
        <a :href="repository + '/commits/main/'">GitHub 提交记录 <span aria-hidden="true">↗</span></a>
      </section>
      <section>
        <h2>制作名单</h2>
        <p>算力工地由项目维护者和贡献者共同建设。</p>
        <a :href="repository + '/graphs/contributors'">查看贡献者 <span aria-hidden="true">↗</span></a>
      </section>
      <section>
        <h2>联系方式</h2>
        <p>欢迎提交勘误、建议教程选题或推荐项目。</p>
        <a :href="repository + '/issues'">在 GitHub 提 Issue <span aria-hidden="true">↗</span></a>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-sections { padding-block: 2.75rem 3.25rem; }
.home-sections > h2 { margin-top: 0.35rem; font-size: clamp(1.65rem, 3vw, 2.15rem); font-weight: 750; }

.feature-grid,
.site-meta {
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
.feature p:not(.feature-number), .site-meta p { color: var(--cf-text); line-height: 1.7; }

.home-sections a { color: var(--cf-gold); font-weight: 650; }
.home-sections a:hover { text-decoration: underline; text-underline-offset: 3px; }
.feature a { margin-top: auto; padding-top: 0.2rem; }

.site-meta { gap: 1.5rem; margin-top: 2.25rem; padding-top: 1.5rem; border-top: 1px solid var(--cf-border); }
.site-meta h2 { font-size: 1.05rem; font-weight: 700; }
.site-meta p { margin: 0.3rem 0 0.45rem; font-size: 0.9rem; }

@media (max-width: 720px) {
  .feature-grid, .site-meta { grid-template-columns: 1fr; }
}
</style>
