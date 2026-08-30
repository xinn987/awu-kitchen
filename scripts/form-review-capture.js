/** 表单深度 review：记录表单 + 参照组件（编辑页/录入面板/选项页）。 */
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
    // 1. 记录表单顶部
    const attempt = await mini.reLaunch('/pages/recipe-attempt-edit/index')
    await attempt.waitFor(1200)
    await mini.screenshot({ path: path.join(SHOTS, 'f1-attempt-top.png') })
    log('f1 ok')

    // 2. 编辑页顶部（label+输入框参照）
    const library = await mini.reLaunch('/pages/library/index')
    await library.waitFor(1500)
    const card = await library.$('.recipe-card')
    await card.tap()
    const detail = await waitPage(mini, 'pages/recipe-detail/index')
    await (await detail.$('.edit-button')).tap()
    const edit = await waitPage(mini, 'pages/recipe-edit/index')
    await mini.screenshot({ path: path.join(SHOTS, 'f2-edit-reference.png') })
    log('f2 ok')

    // 3. 录入面板第二步（serif 名称+关键问题参照）
    await mini.navigateBack()
    await detail.waitFor(400)
    await mini.reLaunch('/pages/library/index')
    await library.waitFor(1200)
    const fab = await library.$('.capture-button')
    await fab.tap()
    await library.waitFor(500)
    const nameInput = await library.$('.name-input')
    if (nameInput) {
      await nameInput.input('对照参照')
      await library.waitFor(300)
      await (await library.$('.sheet-primary')).tap()
      await library.waitFor(500)
    }
    await mini.screenshot({ path: path.join(SHOTS, 'f3-capture-reference.png') })
    log('f3 ok')

    // 4. 选项页（chips 单选参照）
    const options = await mini.reLaunch('/pages/recipe-options/index')
    await options.waitFor(1000)
    await mini.screenshot({ path: path.join(SHOTS, 'f4-options-reference.png') })
    log('f4 ok')

    await mini.disconnect()
    log('done')
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
