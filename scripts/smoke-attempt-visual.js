/** 记录表单视觉检查：覆盖食谱/日期选择器、选中态与“有调整”展开态。 */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOTS = path.resolve(__dirname, '../shots')

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    const form = await mini.reLaunch('/pages/recipe-attempt-edit/index')
    await form.waitFor(1200)
    const fields = await form.$$('.select-field')
    await fields[0].tap()
    await form.waitFor(350)
    await mini.screenshot({ path: path.join(SHOTS, 'attempt-recipe-sheet.png') })
    const options = await form.$$('.recipe-option')
    await options[0].tap()

    const refreshedFields = await form.$$('.select-field')
    await refreshedFields[1].tap()
    await form.waitFor(350)
    await mini.screenshot({ path: path.join(SHOTS, 'attempt-date-sheet.png') })
    await form.callMethod('closeDateSheet')
    await form.waitFor(280)

    const acceptanceCards = await form.$$('.acceptance-card')
    await acceptanceCards[0].tap()
    const segments = await form.$$('.segment-option')
    await segments[1].tap()
    await form.waitFor(250)
    await mini.screenshot({ path: path.join(SHOTS, 'attempt-selected.png') })
    process.stdout.write('食谱选择器、日期选择器、反馈选中态截图完成\n')
  } finally {
    await mini.disconnect()
  }
}

main().catch((error) => {
  process.stderr.write(`记录表单视觉检查失败：${error && error.message}\n`)
  process.exitCode = 1
})
