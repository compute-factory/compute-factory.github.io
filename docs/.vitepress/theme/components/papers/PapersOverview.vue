<script setup lang="ts">
import { withBase } from 'vitepress'
import type { Paper } from '../../../content/papers'
import { arxivPdfUrl, papers, paperHref, paperReportHref } from '../../../content/papers'

function downloadName(paper: Paper, ext: 'md' | 'pdf'): string {
  const base = paper.title.split(/[：:]/)[0].trim() || paper.slug
  return `${base}-精读报告.${ext}`
}
</script>

<template>
  <div class="cf-page topic-page">
    <h1 class="topic-title">论文阅读</h1>

    <ol class="chapter-list">
      <li v-for="(paper, index) in papers" :key="paper.slug" class="chapter-item">
        <a class="chapter-link" :href="withBase(paperHref(paper.slug))">
          <span class="chapter-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="chapter-body">
            <span class="chapter-title">{{ paper.title }}</span>
            <span class="paper-citation">{{ paper.citation }}</span>
            <span class="chapter-points">{{ paper.items.join('、') }}</span>
          </span>
        </a>
        <div class="chapter-actions">
          <a
            class="paper-action"
            :href="withBase(paperReportHref(paper.slug, 'md'))"
            :download="downloadName(paper, 'md')"
          >下载 Markdown</a>
          <a
            v-if="paper.reportPdf"
            class="paper-action"
            :href="withBase(paperReportHref(paper.slug, 'pdf'))"
            :download="downloadName(paper, 'pdf')"
          >下载 PDF</a>
          <a
            v-if="arxivPdfUrl(paper)"
            class="paper-action"
            :href="arxivPdfUrl(paper)"
            target="_blank"
            rel="noopener"
          >原文 PDF ↗</a>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.topic-page {
  max-width: 80rem;
  padding-block: 2.5rem 5rem;
}

.topic-title {
  margin: 0 0 2rem;
  font-size: clamp(2.1rem, 3vw, 2.875rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
  color: var(--cf-ink);
}

.chapter-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.chapter-item { border-top: 1px solid var(--cf-border); }

.chapter-item:last-child { border-bottom: 1px solid var(--cf-border); }

.chapter-link {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  align-items: baseline;
  column-gap: 1rem;
  padding: 1.5rem 0.75rem 0.75rem 0;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.15s;
}

.chapter-link:hover { background: var(--cf-soft); }

.chapter-link:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: -2px;
}

.chapter-number {
  font-size: 0.875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--cf-muted);
  transition: color 0.15s;
}

.chapter-link:hover .chapter-number { color: var(--cf-gold); }

.chapter-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.chapter-title {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.5;
  color: var(--cf-ink);
}

.chapter-link:hover .chapter-title { color: var(--cf-gold); }

.paper-citation {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--cf-text);
}

.chapter-points {
  font-size: 0.875rem;
  line-height: 1.75;
  color: var(--cf-muted);
}

.chapter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0 0 1.25rem calc(2.5rem + 1rem);
}

.paper-action {
  display: inline-flex;
  align-items: center;
  min-height: 1.9rem;
  padding: 0.15rem 0.7rem;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  background: var(--cf-surface);
  color: var(--cf-text);
  font-size: 0.78125rem;
  font-weight: 600;
  line-height: 1.4;
  text-decoration: none;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}

.paper-action:hover {
  border-color: var(--cf-amber);
  background: var(--cf-warm);
  color: var(--cf-gold);
}

.paper-action:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .topic-page { padding-block: 1.5rem 3rem; }

  .chapter-link {
    grid-template-columns: 1.75rem minmax(0, 1fr);
    column-gap: 0.75rem;
    padding-block: 1.15rem;
  }

  .chapter-link { padding-bottom: 0.6rem; }

  .chapter-actions {
    padding: 0 0 1rem calc(1.75rem + 0.75rem);
  }
}
</style>
