/** 第二段冒烟：待补卡片样式、详情页、归档确认面板的视觉验证。 */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOTS = path.resolve(__dirname, '../shots')
const log = (message) => process.stdout.write(`${message}\n`)

async function main() {
  log('connecting...')
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  log('relaunch library')
  const library = await mini.reLaunch('/pages/library/index')
  await library.waitFor(1500)

  // 切到“待补充”筛选，验证草稿卡片的新纸面样式
  const chips = await library.$$('.filter-chip')
  log(`chips: ${chips.length}`)
  for (const chip of chips) {
    const text = await chip.text()
    if (text.includes('待补充')) {
      log('tap 待补充')
      await chip.tap()
      break
    }
  }
  await library.waitFor(800)
  await mini.screenshot({ path: path.join(SHOTS, 'smoke-library-drafts.png') })
  log('drafts screenshot done')

  // 回到全部，进入第一份食谱详情
  const chipsAll = await library.$$('.filter-chip')
  await chipsAll[0].tap()
  await library.waitFor(500)
  const card = await library.$('.recipe-card')
  await card.tap()
  let detail = await mini.currentPage()
  for (let i = 0; i < 20 && detail.path !== 'pages/recipe-detail/index'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    detail = await mini.currentPage()
  }
  await detail.waitFor(1200)
  log(`detail: ${detail.path}`)
  await mini.screenshot({ path: path.join(SHOTS, 'smoke-detail.png') })

  // 打开归档确认面板（不确认），验证 confirm-panel 渲染
  const archiveLink = await detail.$('.archive-link')
  await archiveLink.tap()
  await detail.waitFor(500)
  await mini.screenshot({ path: path.join(SHOTS, 'smoke-confirm-panel.png') })
  const cancel = await detail.$('.panel-cancel')
  await cancel.tap()
  await detail.waitFor(300)
  log('confirm panel verified')

  await mini.disconnect()
  log('done')
}

main().catch((error) => {
  log(`smoke failed: ${error && error.message}`)
  process.exitCode = 1
})
