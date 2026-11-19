<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import RepositoryLink from './components/RepositoryLink.vue'
import TopicBar from './components/learning/TopicBar.vue'
import ChapterPager from './components/learning/ChapterPager.vue'
import PaperTools from './components/papers/PaperTools.vue'
import GuideTools from './components/guide/GuideTools.vue'
import { findPaperByPath } from '../content/papers'
import { guideDownloads } from '../content/guide-downloads.generated'
import { installMathOverflow } from './math-overflow'

const { page } = useData()
const section = computed(() => page.value.relativePath.split('/')[0].replace(/\.md$/, ''))
// 主题教程下的所有页面（总览、板块、章节、实验）都带板块横条
const hasTopicBar = computed(() => page.value.relativePath.startsWith('guide/'))
// 论文精读页顶部带下载与原文入口；列表页自己渲染操作按钮
const currentPaper = computed(() => {
  const routePath = '/' + page.value.relativePath.replace(/\.md$/, '')
  return findPaperByPath(routePath)
})
// 主题课程的真实正文页带下载栏，清单由构建前脚本生成
const guideDownload = computed(() => {
  const relativePath = page.value.relativePath
  if (!relativePath.startsWith('guide/')) return undefined
  return guideDownloads['/' + relativePath.replace(/\.md$/, '')]
})

// 超宽行内公式单独滚动，其余公式保持 MathJax 原生排版
let stopMathOverflow: (() => void) | undefined
onMounted(() => { stopMathOverflow = installMathOverflow() })
onBeforeUnmount(() => stopMathOverflow?.())
watch(() => page.value.relativePath, () => {
  stopMathOverflow?.()
  stopMathOverflow = installMathOverflow()
})
</script>

<template>
  <DefaultTheme.Layout :data-section="section" :class="{ 'has-topic-bar': hasTopicBar }">
    <template v-if="hasTopicBar" #layout-top><TopicBar /></template>
    <template #doc-before>
      <GuideTools v-if="guideDownload?.md" />
      <PaperTools v-if="currentPaper" :paper="currentPaper" />
    </template>
    <template #doc-after><ChapterPager /></template>
    <template #nav-bar-content-after><RepositoryLink /></template>
    <template #nav-screen-content-after><RepositoryLink /></template>
  </DefaultTheme.Layout>
</template>
