<script setup lang="ts">
import { FileText, FlaskConical, LibraryBig, Map } from '@lucide/vue'
import { useData } from 'vitepress'
import { computed } from 'vue'
import TopicIcon from './learning/TopicIcon.vue'

const { page } = useData()
const parts = computed(() => page.value.relativePath.split('/'))
</script>

<template>
  <span class="cf-section-mark" aria-hidden="true">
    <FileText v-if="parts[0] === 'papers'" />
    <LibraryBig v-else-if="parts[0] === 'resources.md'" />
    <FlaskConical v-else-if="parts[1] === 'first-lab.md'" />
    <TopicIcon v-else-if="parts.length > 2" :topic-id="parts[1]" />
    <Map v-else />
  </span>
</template>
