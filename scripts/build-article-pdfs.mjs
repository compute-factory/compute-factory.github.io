#!/usr/bin/env node
// 生成文章 PDF（使用日期：2026-11-17）
//
// 用法：
//   npm run build && npm run articles:pdf
//   npm run articles:pdf -- guide/orientation/llm-overview   # 只生成一篇
//
// 做法：起一个本地静态服务指向构建产物，用本机 Chrome/Edge 的无头模式
// 逐页打印成 PDF。之所以不用纯 JS 的 Markdown→PDF 库：文章里有构建时渲染的
// 公式 SVG、代码块、图表和中文正文，浏览器打印最接近读者在页面上看到的样子。
//
// 产物写到 docs/public/{papers,guide}/files/，随站点发布，需要提交进仓库。
// 正文或打印样式改动后重新执行一次，再跑 npm run build 让构建产物包含新 PDF。
// 打印样式在 docs/.vitepress/theme/worksite.css 的「打印与导出 PDF」一节。

import { spawn } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getArticleTargets, targetPublicFile, writeGuideManifest } from './article-targets.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(repoRoot, 'docs', '.vitepress', 'dist')
const profileDir = join(repoRoot, 'tmp', 'article-pdf-profile')

const onlyArg = process.argv.slice(2).find((arg) => !arg.startsWith('-'))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

function findBrowser() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path))
  if (!found) {
    throw new Error('找不到 Chrome 或 Edge。请安装其中之一，或用 CHROME_PATH 指定可执行文件。')
  }
  return found
}

function startServer() {
  const server = createServer((req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      res.statusCode = 400
      return res.end('bad request')
    }
    if (pathname.endsWith('/')) pathname += 'index.html'

    const file = join(distDir, pathname)
    if (!file.startsWith(distDir) || !existsSync(file) || statSync(file).isDirectory()) {
      res.statusCode = 404
      return res.end('not found')
    }

    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    createReadStream(file).pipe(res)
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

function printPdf(browser, url, outFile) {
  return new Promise((resolvePromise, reject) => {
    mkdirSync(dirname(outFile), { recursive: true })
    const child = spawn(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        `--user-data-dir=${profileDir}`,
        // 等图片、字体和水合完成后再打印
        '--virtual-time-budget=15000',
        '--run-all-compositor-stages-before-draw',
        '--no-pdf-header-footer',
        `--print-to-pdf=${outFile}`,
        url,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )

    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) return resolvePromise()
      reject(new Error(`浏览器退出码 ${code}\n${stderr.trim()}`))
    })
  })
}

async function main() {
  if (!existsSync(distDir)) {
    throw new Error('找不到构建产物。请先执行 npm run build。')
  }

  const targets = getArticleTargets().filter((target) => !onlyArg || target.id === onlyArg)
  if (targets.length === 0) {
    throw new Error(onlyArg ? `找不到文章 ${onlyArg}` : '没有可打印的文章')
  }

  const browser = findBrowser()
  console.log(`浏览器：${browser}`)

  rmSync(profileDir, { recursive: true, force: true })
  mkdirSync(profileDir, { recursive: true })

  const server = await startServer()
  const port = server.address().port

  try {
    for (const target of targets) {
      const outFile = targetPublicFile(target, 'pdf')
      process.stdout.write(`打印 ${target.id} ... `)
      await printPdf(browser, `http://127.0.0.1:${port}${target.route}`, outFile)
      if (!existsSync(outFile) || statSync(outFile).size < 10_000) {
        throw new Error(`${outFile} 没有生成或体积异常`)
      }
      const size = (statSync(outFile).size / 1024 / 1024).toFixed(1)
      console.log(`完成（${size} MB）`)
    }
  } finally {
    server.close()
    rmSync(profileDir, { recursive: true, force: true })
  }

  const guideCount = writeGuideManifest()
  console.log(`PDF 已生成；教程下载清单更新为 ${guideCount} 篇，记得 npm run build 后再提交。`)
}

main().catch((error) => {
  console.error(`\n生成失败：${error.message}`)
  process.exit(1)
})
