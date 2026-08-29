const automator = require('miniprogram-automator')
automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  .then(async (mini) => {
    try {
      const page = await mini.reLaunch('/pages/library/index')
      console.log('path:', page && page.path)
      const sys = await mini.systemInfo()
      console.log('sysinfo ok')
    } catch (e) { console.log('page error:', e.message) }
    await mini.disconnect()
  })
  .catch((e) => console.log('connect error:', e.message))
