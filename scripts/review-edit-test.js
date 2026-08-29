/** 编辑页交互回归：主食材切换、步骤增删排序、分区折叠、保存流程。 */
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

    // 顶部截图（名称/成功关键/主图卡片）
    const sv = await edit.$('.page-scroll')
    await sv.scrollTo(0, 0)
    await edit.waitFor(400)
    await mini.screenshot({ path: path.join(SHOTS, 't1-edit-top.png') })
    log('shot: t1 top')

    // 主食材切换：点亮 → 取消 → 再点亮
    let toggle = await edit.$('.primary-toggle')
    log(`toggle class before: ${await toggle.attribute('class')}`)
    await toggle.tap()
    await edit.waitFor(300)
    toggle = await edit.$('.primary-toggle')
    log(`toggle class after off: ${await toggle.attribute('class')}`)
    await toggle.tap()
    await edit.waitFor(300)
    toggle = await edit.$('.primary-toggle')
    log(`toggle class re-on: ${await toggle.attribute('class')}`)

    // 步骤：新增一步 → 排序（下移/上移）→ 删除
    await edit.$$('.add-button') // 确认存在
    const addButtons = await edit.$$('.add-button')
    log(`add buttons: ${addButtons.length}`)
    // 最后一个 add-button 是「添加一步」
    await addButtons[addButtons.length - 1].tap()
    await edit.waitFor(300)
    let stepTextareas = await edit.$$('.step-textarea')
    log(`steps after add: ${stepTextareas.length}`)
    await stepTextareas[1].input('测试新增的一步')
    await edit.waitFor(300)
    // 下移第一步
    let tools = await edit.$$('.step-tool:not(.danger)')
    log(`move tools: ${tools.length}`)
    await tools[1].tap() // 第二步的下移? 顺序: step0 up/down, step1 down => tap step0's down = tools[1]
    await edit.waitFor(300)
    let numbers = await edit.$$('.step-number')
    log(`first step number text: ${await numbers[0].text()}`)
    const firstText = await (await edit.$$('.step-textarea'))[0].input('')
    // 删除新增步（此时它是第一步）
    const danger = await edit.$('.step-tool.danger')
    await danger.tap()
    await edit.waitFor(300)
    stepTextareas = await edit.$$('.step-textarea')
    log(`steps after remove: ${stepTextareas.length}`)

    // 分区折叠：点分类标题折叠再展开
    const heads = await edit.$$('.section-head')
    log(`card heads: ${heads.length}`)
    await heads[heads.length - 1].tap()
    await edit.waitFor(300)
    await heads[heads.length - 1].tap()
    await edit.waitFor(300)

    // 保存流程：直接保存（未改成功关键，应走直接保存并跳详情）
    const save = await edit.$('.save-button')
    await save.tap()
    const afterDetail = await waitPage(mini, 'pages/recipe-detail/index', 30)
    log(`after save page: ${afterDetail.path}`)
    await mini.screenshot({ path: path.join(SHOTS, 't2-after-save.png') })
    log('done')
    await mini.disconnect()
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
