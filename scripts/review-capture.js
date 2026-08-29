/** 交互 review 用：遍历全部主要页面截图。用法：node scripts/review-capture.js */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOTS = path.resolve(__dirname, '../shots')
const log = (m) => process.stdout.write(`${m}\n`)

async function shot(mini, name) {
  await mini.screenshot({ path: path.join(SHOTS, `r-${name}.png`) })
  log(`shot: ${name}`)
}

async function goto(mini, route, wait = 1000) {
  const page = await mini.reLaunch(route)
  await page.waitFor(wait)
  return page
}

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    // 1. 食谱库
    const library = await goto(mini, '/pages/library/index', 1500)
    await shot(mini, '01-library')
    // 搜索态
    const search = await library.$('.search-input')
    if (search) {
      await search.input('鸡')
      await library.waitFor(600)
      await shot(mini, '02-library-search')
      const clear = await library.$('.search-clear')
      if (clear) await clear.tap()
      await library.waitFor(400)
    }
    // 筛选待补
    const chips = await library.$$('.filter-chip')
    for (const chip of chips) {
      if ((await chip.text()).includes('待补')) {
        await chip.tap()
        break
      }
    }
    await library.waitFor(500)
    await shot(mini, '03-library-drafts')
    for (const chip of await library.$$('.filter-chip')) {
      if ((await chip.text()).includes('全部')) {
        await chip.tap()
        break
      }
    }
    await library.waitFor(400)

    // 2. 快速收录面板
    const captureBtn = await library.$('.capture-button')
    if (captureBtn) {
      await captureBtn.tap()
      await library.waitFor(600)
      await shot(mini, '04-capture-panel')
      const cancel = await library.$('.panel-cancel')
      if (cancel) await cancel.tap()
      await library.waitFor(300)
    }

    // 3. 详情页（正式 + 待补）
    let cards = await library.$$('.recipe-card')
    if (cards.length) {
      await cards[0].tap()
      let detail = await mini.currentPage()
      for (let i = 0; i < 20 && detail.path !== 'pages/recipe-detail/index'; i += 1) {
        await new Promise((r) => setTimeout(r, 300))
        detail = await mini.currentPage()
      }
      await detail.waitFor(1000)
      await shot(mini, '05-detail')
      // 评论区
      const commentEntry = await detail.$('.comment-entry, .comments-link')
      if (commentEntry) {
        await commentEntry.tap()
        let comments = await mini.currentPage()
        for (let i = 0; i < 20 && comments.path !== 'pages/recipe-comments/index'; i += 1) {
          await new Promise((r) => setTimeout(r, 300))
          comments = await mini.currentPage()
        }
        await comments.waitFor(800)
        await shot(mini, '06-comments')
      }
      // 选项页
      await goto(mini, '/pages/recipe-options/index', 800)
      await shot(mini, '07-options')
    }

    // 4. 编辑页
    const edit = await goto(mini, '/pages/recipe-edit/index', 800)
    await shot(mini, '08-edit-empty')
    const nameInput = await edit.$('input, .name-input, textarea')
    if (nameInput) {
      await nameInput.input('测试食谱')
      await edit.waitFor(300)
      await shot(mini, '09-edit-filled')
    }

    // 5. 历史 / 废纸篓
    await goto(mini, '/pages/history/index', 800)
    await shot(mini, '10-history')
    await goto(mini, '/pages/trash/index', 1200)
    await shot(mini, '11-trash')

    // 6. 家庭页
    const family = await goto(mini, '/pages/family/index', 1000)
    await shot(mini, '12-family')
    const inviteBtn = await family.$('.invite-button, .invite-entry')
    if (inviteBtn) {
      await inviteBtn.tap()
      await family.waitFor(600)
      await shot(mini, '13-family-invite')
    }

    // 7. 设置
    await goto(mini, '/pages/settings/index', 800)
    await shot(mini, '14-settings')

    await mini.disconnect()
    log('done')
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}

main()
