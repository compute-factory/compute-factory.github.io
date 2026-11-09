<script setup lang="ts">
import { repository } from '../../content/site'
</script>

<template>
  <a class="repo-link" :href="repository" target="_blank" rel="noopener noreferrer">
    <span aria-hidden="true">☆</span> Star on GitHub
  </a>
</template>

<style scoped>
.repo-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-inline-start: 0.75rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  color: var(--cf-ink);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
}

.repo-link:hover {
  border-color: var(--cf-amber);
  background: var(--cf-soft);
}

.repo-link span { color: var(--cf-gold); font-size: 1.1rem; }

@media (max-width: 767px) {
  .repo-link { margin: 1rem 0 0; }
}

</style>
