/** 补充截图：onboarding、AI 导入页、快速收录第二步。 */
const path = require('path')
const automator = require('miniprogram-automator')
const SHOTS = path.resolve(__dirname, '../shots')
const log = (m) => process.stdout.write(`${m}\n`)

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    const onboarding = await mini.reLaunch('/pages/onboarding/index')
    await onboarding.waitFor(1200)
    await mini.screenshot({ path: path.join(SHOTS, 'x1-onboarding.png') })
    log('shot: x1 onboarding')

    const importer = await mini.reLaunch('/pages/recipe-import/index')
    await importer.waitFor(1200)
    await mini.screenshot({ path: path.join(SHOTS, 'x2-import.png') })
    log('shot: x2 import')

    const library = await mini.reLaunch('/pages/library/index')
    await library.waitFor(1200)
    const fab = await library.$('.capture-button')
    if (fab) {
      await fab.tap()
      await library.waitFor(500)
      const nameInput = await library.$('.name-input')
      if (nameInput) {
        await nameInput.input('测试')
        await library.waitFor(300)
        const next = await library.$('.sheet-primary')
        await next.tap()
        await library.waitFor(500)
      }
      await mini.screenshot({ path: path.join(SHOTS, 'x3-capture-step2.png') })
      log('shot: x3 capture step2')
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
