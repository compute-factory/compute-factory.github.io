<script setup lang="ts">
import KnowledgeMap from './KnowledgeMap.vue'
</script>

<template>
  <div class="cf-page cf-page--wide learning-page">
    <header class="learning-header">
      <h1>AI Infra 学习地图</h1>
    </header>
    <KnowledgeMap />
  </div>
</template>

<style scoped>
.learning-page { padding-bottom: 3rem; }

.learning-header { padding-block: 2rem 1.5rem; }

.learning-header h1 {
  margin: 0;
  font-size: clamp(1.9rem, 3vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.25;
}

</style>
