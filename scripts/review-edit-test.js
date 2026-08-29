/** 编辑页交互回归：主食材切换、步骤增删配图按钮、辅食类型选择、分区折叠、保存流程。 */
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

    // 主食材切换：点亮 → 取消 → 再点亮
    let toggle = await edit.$('.primary-toggle')
    log(`toggle before: ${await toggle.attribute('class')}`)
    await toggle.tap()
    await edit.waitFor(300)
    toggle = await edit.$('.primary-toggle')
    log(`toggle off: ${await toggle.attribute('class')}`)
    await toggle.tap()
    await edit.waitFor(300)
    toggle = await edit.$('.primary-toggle')
    log(`toggle on: ${await toggle.attribute('class')}`)

    // 辅食类型：选择一个 chip
    const chip = await edit.$('.option-chip')
    await chip.tap()
    await edit.waitFor(300)
    log(`type chip active: ${await chip.attribute('class')}`)
    await chip.tap() // 再点取消
    await edit.waitFor(300)

    // 步骤：新增一步 → 检查图片按钮 → 删除
    const addButtons = await edit.$$('.add-button')
    await addButtons[addButtons.length - 1].tap()
    await edit.waitFor(300)
    let stepTextareas = await edit.$$('.step-textarea')
    log(`steps after add: ${stepTextareas.length}`)
    await stepTextareas[stepTextareas.length - 1].input('回归测试步骤')
    await edit.waitFor(300)
    const imageTools = await edit.$$('.step-tool.accent')
    log(`image-plus tools: ${imageTools.length}`)
    const stepBlocks = await edit.$$('.step-block')
    const lastBlock = stepBlocks[stepBlocks.length - 1]
    const removeTool = await lastBlock.$('.step-tool:not(.accent)')
    await removeTool.tap()
    await edit.waitFor(300)
    stepTextareas = await edit.$$('.step-textarea')
    log(`steps after remove: ${stepTextareas.length}`)

    // 主图分区：默认收起，点开 → 收起
    const heads = await edit.$$('.section-head')
    log(`section heads: ${heads.length}`)
    await heads[1].tap() // 主图
    await edit.waitFor(300)
    const emptyImage = await edit.$('.image-empty')
    log(`main image expanded: ${emptyImage ? 'yes' : 'no'}`)
    await heads[1].tap()
    await edit.waitFor(300)

    // 保存流程
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
