/** 食记功能冒烟：验证主栏目、记录表单与独立设置页都能在开发者工具中渲染。 */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOTS = path.resolve(__dirname, '../shots')

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    const journal = await mini.reLaunch('/pages/recipe-journal/index')
    await journal.waitFor(1800)
    console.log('journal:', journal.path)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-journal-empty.png') })
    // 只在自动化页面内注入展示数据，用来检查竖条层次，不写入云数据库。
    await journal.setData({
      loading: false,
      cards: [{
        recipeId: 'visual-recipe', recipeName: '南瓜牛肉烩饭', count: 7,
        latestDate: '30日', latestValue: '2026-08-30',
        attempts: [
          { id: 'v1', acceptance: 'rejected', acceptanceLabel: '不太接受', dateLabel: '2日' },
          { id: 'v2', acceptance: 'accepted', acceptanceLabel: '能接受', dateLabel: '7日' },
          { id: 'v3', acceptance: 'accepted', acceptanceLabel: '能接受', dateLabel: '12日' },
          { id: 'v4', acceptance: 'loved', acceptanceLabel: '很喜欢', dateLabel: '18日' },
          { id: 'v5', acceptance: 'accepted', acceptanceLabel: '能接受', dateLabel: '23日' },
          { id: 'v6', acceptance: 'loved', acceptanceLabel: '很喜欢', dateLabel: '27日' },
          { id: 'v7', acceptance: 'loved', acceptanceLabel: '很喜欢', dateLabel: '30日' },
        ],
      }],
    })
    await journal.waitFor(300)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-journal.png') })

    const form = await mini.navigateTo('/pages/recipe-attempt-edit/index')
    await form.waitFor(1200)
    console.log('attempt form:', form.path)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-attempt-form.png') })

    const settings = await mini.reLaunch('/pages/settings/index')
    await settings.waitFor(900)
    console.log('settings tab:', settings.path)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-settings-tab.png') })
  } finally {
    await mini.disconnect()
  }
}

main().catch((error) => {
  console.error('journal smoke failed:', error && error.message)
  process.exitCode = 1
})
