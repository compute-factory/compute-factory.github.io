<script setup lang="ts">
import { BookOpen, Compass, Cpu, Gauge, Network, SquareTerminal } from '@lucide/vue'
import type { Component } from 'vue'

defineProps<{ topicId: string }>()
const icons: Record<string, Component> = {
  orientation: Compass,
  programming: SquareTerminal,
  inference: Gauge,
  'gpu-kernels': Cpu,
  'distributed-training': Network,
}
</script>

<template>
  <component :is="icons[topicId] ?? BookOpen" :size="18" :stroke-width="1.7" aria-hidden="true" />
</template>
