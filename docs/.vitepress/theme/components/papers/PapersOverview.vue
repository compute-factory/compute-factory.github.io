<script setup lang="ts">
import { ExternalLink, ListFilter, Search, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { arxivPdfUrl, paperCategories, paperDownloadName, papers, paperHref, paperReportHref, type PaperCategory } from '../../../content/papers'

const query = ref('')
const category = ref<PaperCategory | null>(null)
const searchInput = ref<HTMLInputElement>()
const categoryPanel = ref<HTMLElement>()
const narrowScreen = ref(false)
let sidebarMedia: MediaQueryList | undefined

function syncSidebar() {
  narrowScreen.value = sidebarMedia?.matches ?? false
}

onMounted(() => {
  sidebarMedia = window.matchMedia('(max-width: 700px)')
  syncSidebar()
  sidebarMedia.addEventListener('change', syncSidebar)
})
onBeforeUnmount(() => sidebarMedia?.removeEventListener('change', syncSidebar))

function openCategories() {
  if (categoryPanel.value instanceof HTMLDialogElement) categoryPanel.value.showModal()
}

function closeCategories() {
  if (categoryPanel.value instanceof HTMLDialogElement) categoryPanel.value.close()
}

function selectCategory(value: PaperCategory | null) {
  category.value = value
  closeCategories()
}

const batchSize = 30
const limit = ref(batchSize)

function normalize(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

const catalog = papers.map(paper => ({
  paper,
  searchText: normalize([
    paper.title, paper.summary, ...paper.authors, paper.venue, paper.firstPublished, paper.firstPublishedVia,
    ...paper.categories, paper.slug, paper.arxivId ? 'arXiv:' + paper.arxivId : '',
  ].join(' ')),
})).sort((a, b) => b.paper.firstPublished.localeCompare(a.paper.firstPublished))

const categoryFilters = [
  { label: '全部', value: null, count: papers.length },
  ...paperCategories.map(name => ({
    label: name,
    value: name,
    count: papers.filter(paper => paper.categories.includes(name)).length,
  })),
]

const matches = computed(() => {
  const words = normalize(query.value).trim().split(/\s+/).filter(Boolean)
  return catalog.filter(({ paper, searchText }) =>
    (!category.value || paper.categories.includes(category.value)) &&
    words.every(word => searchText.includes(word)),
  )
})

watch([query, category], () => { limit.value = batchSize })

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}
</script>

<template>
  <div class="cf-page cf-overview paper-catalog">
    <header class="cf-section-header catalog-header">
      <h1><SectionMark />论文阅读</h1>
      <div role="search" aria-label="论文目录" class="catalog-search">
        <Search :size="18" aria-hidden="true" />
        <input ref="searchInput" v-model="query" type="search" aria-label="搜索论文" placeholder="搜索论文、作者或关键词" aria-controls="paper-results">
        <button v-if="query" type="button" aria-label="清除搜索" @click="clearSearch"><X :size="16" aria-hidden="true" /></button>
      </div>
    </header>

    <div class="catalog-layout">
      <button type="button" class="filter-trigger" aria-haspopup="dialog" aria-controls="paper-categories" @click="openCategories">
        <ListFilter :size="16" aria-hidden="true" />分类 · {{ category ?? '全部' }}
      </button>
      <component :is="narrowScreen ? 'dialog' : 'aside'" id="paper-categories" ref="categoryPanel" class="catalog-sidebar" aria-label="论文分类" @click.self="closeCategories">
        <div class="sidebar-content">
          <div class="sidebar-heading">
            <h2><ListFilter :size="17" aria-hidden="true" />分类</h2>
            <button v-if="narrowScreen" type="button" aria-label="关闭分类" @click="closeCategories"><X :size="18" aria-hidden="true" /></button>
          </div>
          <div class="catalog-filters" role="group" aria-label="按论文分类筛选">
            <button
              v-for="(filter, index) in categoryFilters"
              :key="filter.label"
              type="button"
              :aria-label="filter.label"
              :aria-describedby="`paper-count-${index}`"
              :aria-pressed="category === filter.value"
              @click="selectCategory(filter.value)"
            >
              {{ filter.label }}
              <span :id="`paper-count-${index}`" class="category-count">{{ filter.count }}<span class="visually-hidden"> 篇论文</span></span>
            </button>
          </div>
        </div>
      </component>

      <div class="catalog-results">
        <ul id="paper-results" class="paper-list" aria-label="论文列表">
          <li v-for="{ paper } in matches.slice(0, limit)" :key="paper.slug" class="paper-row">
            <h2 :id="paper.slug"><a class="paper-entry" :href="withBase(paperHref(paper.slug))">{{ paper.title }}</a></h2>
            <p class="paper-summary" :title="paper.summary">{{ paper.summary }}</p>
            <div class="row-footer">
              <div class="paper-meta">
                <span :title="paper.authors.join(', ')">{{ paper.authors[0] }}{{ paper.authors.length > 1 ? ' 等' : '' }}</span>
                <span class="venue">{{ paper.venue }}</span>
                <time :datetime="paper.firstPublished">{{ paper.firstPublishedVia }} 首发 {{ paper.firstPublished }}</time>
                <span class="paper-tags">
                  <span v-for="tag in paper.categories" :key="tag" class="paper-tag">{{ tag }}</span>
                </span>
              </div>
              <div class="paper-actions" role="group" :aria-label="paper.title + ' 的文件'">
                <a :href="withBase(paperReportHref(paper.slug, 'md'))" :download="paperDownloadName(paper, 'md')" aria-label="下载精读 Markdown" title="下载精读 Markdown">MD</a>
                <a v-if="paper.reportPdf" :href="withBase(paperReportHref(paper.slug, 'pdf'))" :download="paperDownloadName(paper, 'pdf')" aria-label="下载精读 PDF" title="下载精读 PDF">PDF</a>
                <a v-if="arxivPdfUrl(paper)" :href="arxivPdfUrl(paper)" target="_blank" rel="noopener" aria-label="打开原文 PDF">原文<ExternalLink :size="13" aria-hidden="true" /></a>
              </div>
            </div>
          </li>
        </ul>
        <div v-if="!matches.length" class="empty-state">
          <p role="status">没有匹配的论文</p>
          <button v-if="query || category" type="button" @click="category = null; clearSearch()">清除筛选</button>
        </div>
        <button v-if="matches.length > limit" class="show-more" type="button" @click="limit += batchSize">显示更多论文</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-catalog { max-width: none; padding-inline: clamp(1rem, 2.5vw, 3rem); }
.catalog-layout {
  display: grid;
  grid-template-columns: clamp(10rem, 14vw, 15rem) minmax(0, 1fr);
  align-items: start;
  gap: clamp(1.25rem, 2vw, 2.5rem);
}
aside.catalog-sidebar {
  position: sticky;
  top: calc(var(--vp-nav-height) + 1rem);
  max-height: calc(100dvh - var(--vp-nav-height) - 2rem);
  overflow-y: auto;
  padding: 0.35rem clamp(0.75rem, 1.4vw, 1.4rem) 0.45rem 0.25rem;
  border-inline-end: 1px solid var(--cf-border);
}
.catalog-results { min-width: 0; }
.filter-trigger { display: none; }
.catalog-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
.catalog-search {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: min(100%, 21rem);
  min-height: 2.65rem;
  padding-inline: 0.75rem;
  border: 1px solid var(--cf-border);
  border-radius: 0.55rem;
  background: var(--cf-surface);
  color: var(--cf-muted);
}
.catalog-search:focus-within { outline: 2px solid var(--cf-section-ink); outline-offset: 1px; }
.catalog-search input { flex: 1; min-width: 0; appearance: none; color: var(--cf-ink); font: inherit; font-size: 1rem; }
.catalog-search input:focus { outline: none; }
.catalog-search input::-webkit-search-cancel-button { display: none; }
.catalog-search button { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; }
.sidebar-heading, .sidebar-heading h2 { display: flex; align-items: center; }
.sidebar-heading { justify-content: space-between; margin: 0 0 0.65rem 0.65rem; }
.sidebar-heading h2 { gap: 0.5rem; font-size: 1rem; font-weight: 650; color: var(--cf-ink); }
.sidebar-heading h2 svg { color: var(--cf-section-ink); }
.sidebar-heading button { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; color: var(--cf-text); }
.catalog-filters { display: grid; gap: 0.2rem; }
.catalog-filters button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  min-height: 2.5rem;
  padding: 0.4rem 0.75rem;
  border-inline-start: 3px solid transparent;
  border-radius: 0.35rem;
  text-align: start;
  font-size: 0.9375rem;
  color: var(--cf-text);
}
.category-count {
  flex: none;
  min-width: 1.55rem;
  padding: 0.05rem 0.35rem;
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 0.35rem;
  background: var(--cf-surface);
  text-align: center;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}
.catalog-filters button:hover { background: var(--cf-section-tint); }
.catalog-filters button[aria-pressed="true"] { color: var(--cf-section-ink); background: var(--cf-section-tint); border-inline-start-color: var(--cf-section-ink); font-weight: 650; }
.catalog-filters button:focus-visible { outline-offset: -2px; }
.paper-list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--cf-border); }
.paper-row { padding: 0.55rem 0.45rem; border-bottom: 1px solid var(--cf-border); }
.paper-row h2 { margin: 0; font-size: 1.1rem; font-weight: 680; line-height: 1.45; overflow-wrap: anywhere; }
.paper-entry { color: var(--cf-section-ink); }
.paper-entry:hover, .paper-actions a:hover { text-decoration: underline; text-underline-offset: 3px; }
.paper-summary { margin: 0.15rem 0 0.3rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cf-text); font-size: 0.9rem; line-height: 1.6; }
.row-footer, .paper-meta, .paper-actions { display: flex; flex-wrap: wrap; align-items: center; }
.row-footer { justify-content: space-between; gap: 0.2rem 1.25rem; }
.paper-meta { gap: 0.2rem 0.5rem; font-size: 0.8125rem; color: var(--cf-muted); }
.venue, .paper-meta time { padding-inline-start: 0.5rem; border-left: 1px solid var(--cf-border); line-height: 1.2; }
.venue { font-weight: 600; }
.paper-tags { display: inline-flex; flex-wrap: wrap; gap: 0.3rem; }
.paper-tag { padding: 0 0.4rem; border-radius: 0.3rem; background: var(--cf-section-tint); color: var(--cf-section-ink); }
.paper-actions { gap: 0.75rem; font-size: 0.8125rem; color: var(--cf-section-ink); font-weight: 600; }
.paper-actions a { display: inline-flex; align-items: center; gap: 0.25rem; min-height: 1.5rem; }
.empty-state { padding: 2rem 0; text-align: center; color: var(--cf-text); }
.empty-state button, .show-more { margin-top: 0.55rem; color: var(--cf-section-ink); font-weight: 600; }
.show-more { display: block; margin: 1rem auto; }
@media (max-width: 700px) {
  .catalog-layout { display: block; }
  aside.catalog-sidebar { display: none; }
  .filter-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.8rem;
    padding: 0.45rem 0.75rem;
    min-height: 2.5rem;
    border: 1px solid var(--cf-border);
    border-radius: 0.45rem;
    color: var(--cf-section-ink);
    background: var(--cf-surface);
  }
  dialog.catalog-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(18rem, calc(100% - 2rem));
    height: 100dvh;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: var(--cf-surface);
    color: var(--cf-ink);
  }
  dialog.catalog-sidebar::backdrop { background: rgb(20 23 26 / 42%); }
  .sidebar-content { min-height: 100%; padding: 1rem; }
  .catalog-filters button { min-height: 2.75rem; }
}
@media (max-width: 600px) {
  .catalog-search { width: 100%; }
  .paper-row { padding-inline: 0; }
  .row-footer { justify-content: flex-start; gap: 0.3rem 0.5rem; }
  .paper-meta { display: contents; }
  .paper-meta > :is(span, time) { font-size: 0.8125rem; color: var(--cf-muted); }
  .paper-actions { margin-inline-start: auto; }
}
</style>
