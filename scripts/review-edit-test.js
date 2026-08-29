/** 编辑页交互回归：主食材四角星切换/置顶、辅食类型选择、步骤增删、保存流程。 */
const path = require('path')
const automator = require('miniprogram-automator')

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

    // 主食材：空心 → 实心（自动置顶）→ 取消（回到原组）
    const toggles = await edit.$$('.primary-toggle')
    log(`toggles: ${toggles.length}`)
    const last = toggles[toggles.length - 1]
    const beforeClass = await last.attribute('class')
    await last.tap()
    await edit.waitFor(300)
    const firstToggle = await edit.$('.primary-toggle')
    const afterOn = await firstToggle.attribute('class')
    log(`toggle before: ${beforeClass} | first row after on: ${afterOn}`)
    // 取消刚点亮的（现在在第一行）
    await firstToggle.tap()
    await edit.waitFor(300)

    // 辅食类型：选择再取消
    const chip = await edit.$('.option-chip')
    await chip.tap()
    await edit.waitFor(300)
    log(`chip active: ${await chip.attribute('class')}`)
    await chip.tap()
    await edit.waitFor(300)

    // 步骤：新增一步（无上下箭头）→ 删除
    const addButtons = await edit.$$('.add-button')
    await addButtons[addButtons.length - 1].tap()
    await edit.waitFor(300)
    let stepTextareas = await edit.$$('.step-textarea')
    log(`steps after add: ${stepTextareas.length}`)
    await stepTextareas[stepTextareas.length - 1].input('回归测试步骤')
    await edit.waitFor(300)
    const allTools = await edit.$$('.step-tool')
    const dangerTools = await edit.$$('.step-tool.danger')
    log(`non-danger step tools (应为 0): ${allTools.length - dangerTools.length}`)
    const blocks = await edit.$$('.step-block')
    const lastBlock = blocks[blocks.length - 1]
    await (await lastBlock.$('.step-tool')).tap()
    await edit.waitFor(300)
    stepTextareas = await edit.$$('.step-textarea')
    log(`steps after remove: ${stepTextareas.length}`)

    // 保存
    const save = await edit.$('.save-button')
    await save.tap()
    const afterDetail = await waitPage(mini, 'pages/recipe-detail/index', 30)
    log(`after save page: ${afterDetail.path}`)
    log('done')
    await mini.disconnect()
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
