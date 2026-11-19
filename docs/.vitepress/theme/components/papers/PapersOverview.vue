<script setup lang="ts">
import { BookOpen, Download, ExternalLink, ListTree } from '@lucide/vue'
import { withBase } from 'vitepress'
import type { Paper } from '../../../content/papers'
import { arxivPdfUrl, papers, paperHref, paperReportHref } from '../../../content/papers'

function downloadName(paper: Paper, ext: 'md' | 'pdf'): string {
  const base = paper.title.split(/[：:]/)[0].trim() || paper.slug
  return `${base}-精读报告.${ext}`
}
</script>

<template>
  <div class="cf-page cf-overview">
    <header class="cf-section-header">
      <h1><SectionMark />论文阅读</h1>
    </header>

    <article v-for="paper in papers" :key="paper.slug" class="paper-card">
      <a class="paper-entry" :href="withBase(paperHref(paper.slug))" :aria-labelledby="paper.slug">
        <h2 :id="paper.slug">{{ paper.title }}</h2>
        <p class="paper-citation">{{ paper.citation }}</p>
        <p class="paper-summary">{{ paper.summary }}</p>
        <span class="paper-read"><BookOpen :size="17" aria-hidden="true" />阅读精读报告</span>
      </a>

      <section class="paper-points">
        <h3><ListTree :size="19" aria-hidden="true" />阅读要点</h3>
        <ul><li v-for="item in paper.items" :key="item">{{ item }}</li></ul>
      </section>

      <footer class="paper-actions">
        <a :href="withBase(paperReportHref(paper.slug, 'md'))" :download="downloadName(paper, 'md')">
          <Download :size="16" aria-hidden="true" />下载 Markdown
        </a>
        <a v-if="paper.reportPdf" :href="withBase(paperReportHref(paper.slug, 'pdf'))" :download="downloadName(paper, 'pdf')">
          <Download :size="16" aria-hidden="true" />下载 PDF
        </a>
        <a v-if="arxivPdfUrl(paper)" :href="arxivPdfUrl(paper)" target="_blank" rel="noopener">
          <ExternalLink :size="16" aria-hidden="true" />原文 PDF
        </a>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.paper-card {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 0 clamp(1.5rem, 3vw, 3rem);
  padding: clamp(1.25rem, 2.5vw, 2rem);
  margin-bottom: 1rem;
  border: 1px solid var(--cf-border);
  border-radius: 1rem;
  background: var(--cf-surface);
}
.paper-entry { min-width: 0; align-self: start; }
.paper-entry h2 { font-size: clamp(1.25rem, 2vw, 1.65rem); font-weight: 720; line-height: 1.5; overflow-wrap: anywhere; }
.paper-entry:hover h2 { color: var(--cf-section-ink); }
.paper-citation { margin-top: 0.65rem; font-size: 0.875rem; line-height: 1.65; color: var(--cf-muted); }
.paper-summary { margin-block: 1rem; line-height: 1.8; color: var(--cf-text); }
.paper-read, .paper-actions a { display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 650; font-size: 0.9rem; }
.paper-read { color: var(--cf-section-ink); }
.paper-entry:is(:hover, :focus-visible) .paper-read { text-decoration: underline; text-underline-offset: 3px; }
.paper-points { padding-inline-start: clamp(1rem, 2vw, 2rem); border-left: 1px solid var(--cf-border); }
.paper-points h3 { display: flex; gap: 0.55rem; align-items: center; font-size: 1rem; font-weight: 700; }
.paper-points h3 svg, .paper-points li::marker { color: var(--cf-section-ink); }
.paper-points ul { margin-top: 0.65rem; padding-left: 1.2rem; list-style: disc; }
.paper-points li { padding-block: 0.18rem; color: var(--cf-text); line-height: 1.7; }
.paper-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--cf-border); }
.paper-actions a { min-height: 2.4rem; padding-inline: 0.8rem; border: 1px solid var(--cf-border); border-radius: 0.5rem; color: var(--cf-text); }
.paper-actions a:hover { background: var(--cf-section-tint); color: var(--cf-section-ink); }

@media (max-width: 760px) {
  .paper-card { grid-template-columns: minmax(0, 1fr); }
  .paper-points { margin-top: 1.25rem; padding: 1rem 0 0; border-left: 0; border-top: 1px solid var(--cf-border); }
}
</style>
