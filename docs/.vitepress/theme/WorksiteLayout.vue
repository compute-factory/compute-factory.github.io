<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import RepositoryLink from './components/RepositoryLink.vue'
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after><RepositoryLink /></template>
    <template #nav-screen-content-after><RepositoryLink /></template>
  </DefaultTheme.Layout>
</template>
