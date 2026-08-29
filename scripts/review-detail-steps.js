/** 详情页步骤缩略图截图（scroll-view 元素滚动）。 */
const path = require('path')
const automator = require('miniprogram-automator')
const SHOTS = path.resolve(__dirname, '../shots')
const log = (m) => process.stdout.write(`${m}\n`)

async function waitPage(mini, target, tries = 20) {
  let page = await mini.currentPage()
  for (let i = 0; i < tries && page.path !== target; i += 1) {
    await new Promise((r) => setTimeout(r, 300))
    page = await mini.currentPage()
  }
  await page.waitFor(800)
  return page
}

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    const library = await mini.reLaunch('/pages/library/index')
    await library.waitFor(1500)
    // 找「红酒炖牛肉」卡片（有步骤图）
    const cards = await library.$$('.recipe-card')
    for (const card of cards) {
      const text = await card.text()
      if (text.includes('红酒炖牛肉')) {
        await card.tap()
        break
      }
    }
    const detail = await waitPage(mini, 'pages/recipe-detail/index')
    const sv = await detail.$('.page-scroll')
    for (const [i, y] of [[1, 900], [2, 1500], [3, 2100]]) {
      await sv.scrollTo(0, y)
      await detail.waitFor(400)
      await mini.screenshot({ path: path.join(SHOTS, `d${i}-detail.png`) })
    }
    log('done')
    await mini.disconnect()
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
