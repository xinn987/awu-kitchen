const path = require('path')
const automator = require('miniprogram-automator')
const SHOTS = path.resolve(__dirname, '../shots')
const log = (m) => process.stdout.write(`${m}\n`)

async function main() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    const attempt = await mini.reLaunch('/pages/recipe-attempt-edit/index')
    await attempt.waitFor(1200)
    await (await attempt.$('.note-head')).tap()
    await attempt.waitFor(600)
    await mini.screenshot({ path: path.join(SHOTS, 'f5-recipe-sheet.png') })
    log('f5 recipe sheet')
    await (await attempt.$('.sheet-close')).tap()
    await attempt.waitFor(400)
    const metas = await attempt.$$('.meta-item')
    await metas[0].tap()
    await attempt.waitFor(600)
    await mini.screenshot({ path: path.join(SHOTS, 'f6-date-sheet.png') })
    log('f6 date sheet')
    await mini.disconnect()
    log('done')
  } catch (error) {
    log(`failed: ${error && error.message}`)
    try { await mini.disconnect() } catch (_) {}
    process.exitCode = 1
  }
}
main()
