/** 用 scroll-view 元素自身滚动截取编辑页全表单。 */
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
    const card = await library.$('.recipe-card')
    await card.tap()
    const detail = await waitPage(mini, 'pages/recipe-detail/index')
    const editButton = await detail.$('.edit-button')
    await editButton.tap()
    const edit = await waitPage(mini, 'pages/recipe-edit/index')
    const sv = await edit.$('.page-scroll')
    for (let i = 1; i <= 8; i += 1) {
      await sv.scrollTo(0, i * 600)
      await edit.waitFor(400)
      await mini.screenshot({ path: path.join(SHOTS, `g${i}-edit.png`) })
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
