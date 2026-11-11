import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import WorksiteLayout from './WorksiteLayout.vue'
import ChapterPlaceholder from './components/learning/ChapterPlaceholder.vue'
import './worksite.css'

export default {
  extends: DefaultTheme,
  Layout: WorksiteLayout,
  enhanceApp({ app }) {
    // 章节页只有占位内容，正文写好后删掉 md 里的 <ChapterPlaceholder /> 或换成真实内容
    app.component('ChapterPlaceholder', ChapterPlaceholder)
  },
} satisfies Theme
