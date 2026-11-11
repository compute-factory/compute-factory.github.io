<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import RepositoryLink from './components/RepositoryLink.vue'
import TopicBar from './components/learning/TopicBar.vue'
import ChapterPager from './components/learning/ChapterPager.vue'

const { page } = useData()
// 主题教程下的所有页面（总览、板块、章节、实验）都带板块横条
const hasTopicBar = computed(() => page.value.relativePath.startsWith('guide/'))
</script>

<template>
  <DefaultTheme.Layout :class="{ 'has-topic-bar': hasTopicBar }">
    <template v-if="hasTopicBar" #layout-top><TopicBar /></template>
    <template #doc-after><ChapterPager /></template>
    <template #nav-bar-content-after><RepositoryLink /></template>
    <template #nav-screen-content-after><RepositoryLink /></template>
  </DefaultTheme.Layout>
</template>
