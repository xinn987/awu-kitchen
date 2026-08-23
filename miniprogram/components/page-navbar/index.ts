/** 适配微信状态栏和右上角胶囊的自定义页内导航。 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    leftText: { type: String, value: '返回' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    rightText: { type: String, value: '' },
  },
  data: { statusBarHeight: 20, barHeight: 44 },
  lifetimes: {
    attached() {
      const windowInfo = wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect()
      const statusBarHeight = windowInfo.statusBarHeight ?? 20
      const barHeight = Math.max(44, (menu.top - statusBarHeight) * 2 + menu.height)
      this.setData({ statusBarHeight, barHeight })
    },
  },
  methods: {
    onLeft() { this.triggerEvent('left') },
    onRight() { this.triggerEvent('right') },
  },
})
