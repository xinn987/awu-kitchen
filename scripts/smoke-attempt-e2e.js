/**
 * 食记真实闭环：通过页面创建、更新、读取并删除一条临时记录。
 * 测试结束会清理自己创建的数据，不在家庭食记中留下测试内容。
 */
const automator = require('miniprogram-automator')

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitPage(mini, target, timeout = 12000) {
  const startedAt = Date.now()
  let page = await mini.currentPage()
  while (page.path !== target && Date.now() - startedAt < timeout) {
    await wait(300)
    page = await mini.currentPage()
  }
  if (page.path !== target) throw new Error(`页面未进入 ${target}，当前为 ${page.path}`)
  return page
}

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  let createdAttemptId = ''
  try {
    const form = await mini.reLaunch('/pages/recipe-attempt-edit/index')
    await form.waitFor(1800)

    const fields = await form.$$('.select-field')
    if (!fields.length) throw new Error('没有找到食谱选择字段')
    await fields[0].tap()
    await form.waitFor(450)
    const recipeOptions = await form.$$('.recipe-option')
    if (!recipeOptions.length) throw new Error('当前家庭没有可用于验证的食谱')
    await recipeOptions[0].tap()
    await form.waitFor(250)

    const selected = await form.data()
    const recipeId = selected.recipeId
    const recipeName = selected.recipeName
    const acceptanceCards = await form.$$('.acceptance-card')
    await acceptanceCards[1].tap()
    await (await form.$('.save-button')).tap()

    const journal = await waitPage(mini, 'pages/recipe-journal/index')
    await journal.waitFor(1200)
    const createdData = await journal.data()
    const journalCard = createdData.cards.find((card) => card.recipeId === recipeId)
    if (!journalCard) throw new Error('保存后食记页没有出现对应食谱卡片')
    const createdAttempt = journalCard.attempts[journalCard.attempts.length - 1]
    if (!createdAttempt || createdAttempt.acceptance !== 'accepted') {
      throw new Error('保存后没有即时回显“能接受”记录')
    }
    createdAttemptId = createdAttempt.id

    const edit = await mini.navigateTo(`/pages/recipe-attempt-edit/index?id=${createdAttemptId}`)
    await edit.waitFor(1800)
    const editData = await edit.data()
    if (editData.recipeName !== recipeName || editData.acceptance !== 'accepted') {
      throw new Error('单条读取没有恢复刚保存的记录')
    }
    const editAcceptanceCards = await edit.$$('.acceptance-card')
    await editAcceptanceCards[0].tap()
    await (await edit.$('.save-button')).tap()

    const updatedJournal = await waitPage(mini, 'pages/recipe-journal/index')
    await updatedJournal.waitFor(700)
    const updatedData = await updatedJournal.data()
    const updatedCard = updatedData.cards.find((card) => card.recipeId === recipeId)
    const updatedAttempt = updatedCard && updatedCard.attempts.find((attempt) => attempt.id === createdAttemptId)
    if (!updatedAttempt || updatedAttempt.acceptance !== 'loved') {
      throw new Error('更新后没有即时回显“很喜欢”记录')
    }

    const cleanup = await mini.navigateTo(`/pages/recipe-attempt-edit/index?id=${createdAttemptId}`)
    await cleanup.waitFor(900)
    await cleanup.callMethod('confirmDelete')
    const cleanedJournal = await waitPage(mini, 'pages/recipe-journal/index')
    await cleanedJournal.waitFor(700)
    const cleanedData = await cleanedJournal.data()
    const remains = cleanedData.cards.some((card) => card.attempts.some((attempt) => attempt.id === createdAttemptId))
    if (remains) throw new Error('测试记录删除后仍出现在食记页')

    process.stdout.write(JSON.stringify({
      ok: true,
      recipeName,
      createdAttemptId,
      verified: ['create', 'list-cache', 'get', 'update', 'delete'],
      cleaned: true,
    }, null, 2))
  } finally {
    await mini.disconnect()
  }
}

main().catch((error) => {
  process.stderr.write(`食记闭环验证失败：${error && error.message}\n`)
  process.exitCode = 1
})
