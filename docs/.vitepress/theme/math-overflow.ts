// 超宽行内公式的横向滚动处理。
//
// MathJax 原生的行内公式和正文基线对齐得很好，但一条比正文栏还宽的公式
// 会把整页撑出横向滚动条。这里只给「确实超宽」的公式加 .math-overflow，
// 让公式自己滚动；其余公式保持原生 inline，不改变基线。
//
// 注意：inline-block 的基线在盒子底边，而公式 SVG 自带下沉量，
// 所以标记后要把 SVG 的 vertical-align 抄给容器，补偿这段偏移。

const SELECTOR = '.vp-doc mjx-container:not([display="true"])'
const CLASS = 'math-overflow'

function update() {
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    const svg = el.firstElementChild
    if (!(svg instanceof SVGSVGElement)) return

    const available = el.parentElement?.clientWidth ?? 0
    const natural = svg.getBoundingClientRect().width
    if (!available || !natural) return

    const overflow = natural > available + 1
    el.classList.toggle(CLASS, overflow)
    el.style.verticalAlign = overflow ? getComputedStyle(svg).verticalAlign : ''
  })
}

/** 安装滚动标记，返回清理函数。只在浏览器端执行。 */
export function installMathOverflow(): () => void {
  if (typeof window === 'undefined') return () => {}

  let frame = 0
  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(update)
  }

  schedule()
  // 字体与页面水合可能改变可用宽度，补算两次
  const timers = [window.setTimeout(schedule, 300), window.setTimeout(schedule, 1200)]
  window.addEventListener('resize', schedule)

  return () => {
    cancelAnimationFrame(frame)
    timers.forEach((id) => window.clearTimeout(id))
    window.removeEventListener('resize', schedule)
  }
}
