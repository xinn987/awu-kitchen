/**
 * 冒烟验证：连接已开启自动化的开发者工具（cli auto --auto-port 9420），
 * 遍历主要页面并截图。用法：node scripts/smoke-check.js
 */
const path = require('path')
const automator = require('miniprogram-automator')

const SHOTS = path.resolve(__dirname, '../shots')

async function main() {
  console.log('connecting devtools...')
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  try {
    const page = await mini.reLaunch('/pages/library/index')
    await page.waitFor(1500)
    console.log('library:', page.path)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-library.png') })

    // 设置页 → 废纸篓（新页面链路）
    const settings = await mini.navigateTo('/pages/settings/index')
    await settings.waitFor(800)
    console.log('settings:', settings.path)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-settings.png') })

    const trash = await mini.navigateTo('/pages/trash/index')
    await trash.waitFor(1200)
    console.log('trash:', trash.path)
    await mini.screenshot({ path: path.join(SHOTS, 'smoke-trash.png') })

    await mini.disconnect()
  } catch (error) {
    console.error('smoke failed:', error && error.message)
    await mini.close().catch(() => {})
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('launch failed:', error && error.message)
  process.exitCode = 1
})
