/** 验证 loading 态渲染：临时把页面置为加载中并截图，再恢复。 */
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
    // 食谱库骨架屏
    const library = await mini.reLaunch('/pages/library/index')
    await library.waitFor(1500)
    await library.setData({ loading: true })
    await library.waitFor(400)
    await mini.screenshot({ path: path.join(SHOTS, 'l1-library-skeleton.png') })
    log('shot: l1 skeleton')
    await library.setData({ loading: false })
    await library.waitFor(300)

    // 详情页 spinner
    const card = await library.$('.recipe-card')
    await card.tap()
    const detail = await waitPage(mini, 'pages/recipe-detail/index')
    await detail.setData({ loading: true, recipe: null })
    await detail.waitFor(400)
    await mini.screenshot({ path: path.join(SHOTS, 'l2-detail-loading.png') })
    log('shot: l2 detail spinner')
    await detail.setData({ loading: false })

    // 家庭页 loading
    const family = await mini.reLaunch('/pages/family/index')
    await family.waitFor(1200)
    await family.setData({ loading: true })
    await family.waitFor(400)
    await mini.screenshot({ path: path.join(SHOTS, 'l3-family-loading.png') })
    log('shot: l3 family loading')
    await family.setData({ loading: false })

    // 评论页 loading
    await mini.reLaunch('/pages/library/index')
    await library.waitFor(1000)
    const card2 = await library.$('.recipe-card')
    await card2.tap()
    const detail2 = await waitPage(mini, 'pages/recipe-detail/index')
    const commentBtn = await detail2.$('.compact-button')
    await commentBtn.tap()
    const comments = await waitPage(mini, 'pages/recipe-comments/index')
    await comments.setData({ loading: true, comments: [] })
    await comments.waitFor(400)
    await mini.screenshot({ path: path.join(SHOTS, 'l4-comments-loading.png') })
    log('shot: l4 comments loading')
    await comments.setData({ loading: false })

    await mini.disconnect()
    log('done')
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
