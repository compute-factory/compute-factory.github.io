<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { learningTopics } from '../../../content/learning'
import { topicPath } from '../../../content/curriculum'

const { page } = useData()

// guide/<板块 id>/... 属于哪个板块；总览页和第一张工单不属于任何板块
const activeId = computed(() => {
  const [root, topicId] = page.value.relativePath.split('/')
  return root === 'guide' ? learningTopics.find((topic) => topic.id === topicId)?.id : undefined
})

const bar = useTemplateRef<HTMLElement>('bar')

// 窄屏上横条可以横向滑动，换页后把当前板块滑回可见位置
async function revealActive() {
  await nextTick()
  const el = bar.value?.querySelector<HTMLElement>('[aria-current="page"]')
  if (el && bar.value) bar.value.scrollLeft = el.offsetLeft - (bar.value.clientWidth - el.offsetWidth) / 2
}

onMounted(revealActive)
watch(activeId, revealActive)
</script>

<template>
  <nav class="topic-bar" aria-label="主题教程">
    <div ref="bar" class="topic-bar-scroll cf-page cf-page--wide">
      <a
        v-for="topic in learningTopics"
        :key="topic.id"
        class="topic-bar-link"
        :class="{ active: topic.id === activeId }"
        :href="withBase(topicPath(topic.id))"
        :aria-current="topic.id === activeId ? 'page' : undefined"
      >
        {{ topic.title }}
      </a>
    </div>
  </nav>
</template>

<style scoped>
/* 窄屏：留在文档流里，随页面粘在视口顶部（排序见 worksite.css）。
 * 宽屏：站点顶栏是 fixed 的，横条也 fixed 在它正下方，其余内容的让位偏移见 worksite.css。 */
.topic-bar {
  position: sticky;
  top: 0;
  z-index: 29;
  height: var(--cf-topbar-h);
  border-bottom: 1px solid var(--cf-border);
  background: var(--vp-c-bg);
}

@media (min-width: 960px) {
  .topic-bar {
    position: fixed;
    top: var(--vp-nav-height);
    left: 0;
    right: 0;
  }
}

.topic-bar-scroll {
  display: flex;
  align-items: stretch;
  gap: clamp(1.5rem, 4vw, 4rem);
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

/* 用 auto 外边距居中：放得下时整体居中、间距相等，放不下时从头开始横向滚动
 * （justify-content: center 会把溢出的左半截裁掉） */
.topic-bar-link:first-child { margin-inline-start: auto; }
.topic-bar-link:last-child { margin-inline-end: auto; }

.topic-bar-scroll::-webkit-scrollbar { display: none; }

.topic-bar-link {
  display: flex;
  align-items: center;
  flex: none;
  border-bottom: 2px solid transparent;
  font-size: 1.0625rem;
  font-weight: 600;
  white-space: nowrap;
  color: var(--cf-text);
  text-decoration: none;
}

.topic-bar-link:hover { color: var(--cf-gold); }

.topic-bar-link.active {
  border-bottom-color: var(--cf-amber);
  color: var(--cf-ink);
}

.topic-bar-link:focus-visible {
  outline: 2px solid var(--cf-gold);
  outline-offset: -4px;
}
</style>
