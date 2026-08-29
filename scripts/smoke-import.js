/** 添加食谱冒烟验证：确认统一入口的两个分支及图片导入页均可渲染。 */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOT = path.resolve(__dirname, '../shots/smoke-recipe-import.png')
const MENU_SHOT = path.resolve(__dirname, '../shots/smoke-create-menu.png')

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    let page = await mini.reLaunch('/pages/library/index')
    await page.waitFor(1000)
    const nav = await page.$('bottom-nav')
    const addButton = nav && await nav.$('.capture-button')
    if (!addButton) throw new Error('食谱库缺少添加食谱入口')
    await addButton.tap()
    await page.waitFor(350)

    const createSheet = await page.$('quick-capture')
    let options = createSheet && await createSheet.$$('.create-option')
    if (!options || options.length !== 2) throw new Error('添加食谱菜单缺少两个创建方式')
    await mini.screenshot({ path: MENU_SHOT })

    // 快速记录分支应进入名称输入，再能返回创建方式菜单。
    await options[0].tap()
    await page.waitFor(100)
    const nameInput = createSheet && await createSheet.$('.name-input')
    if (!nameInput) throw new Error('快速记录没有进入名称输入')
    const backButton = createSheet && await createSheet.$('.back-button')
    if (!backButton) throw new Error('快速记录缺少返回添加方式入口')
    await backButton.tap()
    await page.waitFor(100)

    options = createSheet && await createSheet.$$('.create-option')
    if (!options || options.length !== 2) throw new Error('返回后添加方式菜单没有恢复')
    await options[1].tap()
    await page.waitFor(1200)
    page = await mini.currentPage()
    if (!page || page.path !== 'pages/recipe-import/index') {
      const step = createSheet ? await createSheet.data('step') : 'missing'
      throw new Error(`图片导入入口没有打开导入页（当前 ${page && page.path}，菜单 ${step}）`)
    }
    await page.waitFor(1000)
    const intro = await page.$('.intro-card')
    const picker = await page.$('.select-button')
    if (!intro || !picker) throw new Error('导入页缺少介绍卡片或选图入口')
    await mini.screenshot({ path: SHOT })
    process.stdout.write(`create menu and recipe import: ${page.path}\n`)
    await mini.disconnect()
  } catch (error) {
    try { await mini.disconnect() } catch (_) {}
    throw error
  }
}

main().catch((error) => {
  console.error('recipe import smoke failed:', error && error.message)
  process.exitCode = 1
})
