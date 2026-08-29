/** 交互 review 第二段：搜索态、评论页、编辑页、详情底部、历史页（带食谱）。 */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOTS = path.resolve(__dirname, '../shots')
const log = (m) => process.stdout.write(`${m}\n`)

async function shot(mini, name) {
  await mini.screenshot({ path: path.join(SHOTS, `r-${name}.png`) })
  log(`shot: ${name}`)
}

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
    // 搜索态
    const library = await mini.reLaunch('/pages/library/index')
    await library.waitFor(1500)
    // 搜索框是原生 input，placeholder 类是 search-placeholder
    const searchInput = await library.$('.search-box input')
    if (searchInput) {
      await searchInput.input('牛肉')
      await library.waitFor(600)
      await shot(mini, '15-library-search')
    } else {
      log('search input not found')
    }

    // 进入第一份食谱详情
    const card = await library.$('.recipe-card')
    await card.tap()
    const detail = await waitPage(mini, 'pages/recipe-detail/index')
    // 滚到底部看步骤和归档链接
    await mini.pageScrollTo(2000)
    await detail.waitFor(600)
    await shot(mini, '16-detail-bottom')

    // 修订记录（带食谱 id）
    const historyLink = await detail.$('.history-link')
    if (historyLink) {
      await historyLink.tap()
      const history = await waitPage(mini, 'pages/history/index')
      await shot(mini, '17-history')
      await mini.navigateBack()
      await detail.waitFor(500)
    }

    // 编辑页
    const editButton = await detail.$('.edit-button')
    if (editButton) {
      await editButton.tap()
      const edit = await waitPage(mini, 'pages/recipe-edit/index')
      await shot(mini, '18-edit')
      await mini.navigateBack()
      await detail.waitFor(500)
    }

    // 评论页（底部 评论 按钮）
    const commentButton = await detail.$('.compact-button')
    if (commentButton) {
      await commentButton.tap()
      const comments = await waitPage(mini, 'pages/recipe-comments/index')
      await shot(mini, '19-comments')
    }

    await mini.disconnect()
    log('done')
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}

main()
