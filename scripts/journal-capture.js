/** 食记功能截图：食记页/记录表单/详情嵌入/设置。 */
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
    const journal = await mini.reLaunch('/pages/recipe-journal/index')
    await journal.waitFor(1500)
    await mini.screenshot({ path: path.join(SHOTS, 'j1-journal.png') })
    log('shot: j1 journal')

    const attempt = await mini.reLaunch('/pages/recipe-attempt-edit/index')
    await attempt.waitFor(1200)
    await mini.screenshot({ path: path.join(SHOTS, 'j2-attempt-edit.png') })
    log('shot: j2 attempt edit')

    const library = await mini.reLaunch('/pages/library/index')
    await library.waitFor(1500)
    const card = await library.$('.recipe-card')
    await card.tap()
    const detail = await waitPage(mini, 'pages/recipe-detail/index')
    const sv = await detail.$('.page-scroll')
    const blocks = await detail.$$('.detail-section')
    log(`sections: ${blocks.length}`)
    await sv.scrollTo(0, 2000)
    await detail.waitFor(500)
    await mini.screenshot({ path: path.join(SHOTS, 'j3-detail-recent.png') })
    log('shot: j3 detail recent')

    const settings = await mini.reLaunch('/pages/settings/index')
    await settings.waitFor(1000)
    await mini.screenshot({ path: path.join(SHOTS, 'j4-settings.png') })
    log('shot: j4 settings')

    const family = await mini.reLaunch('/pages/family/index')
    await family.waitFor(1200)
    await mini.screenshot({ path: path.join(SHOTS, 'j5-family.png') })
    log('shot: j5 family')

    await mini.disconnect()
    log('done')
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
