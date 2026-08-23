/** 适配微信状态栏和右上角胶囊的自定义页内导航。 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    leftText: { type: String, value: '返回' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    rightText: { type: String, value: '' },
    rightIcon: { type: String, value: '' },
  },
  data: { statusBarHeight: 20, barHeight: 44, rightInset: 0 },
  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo()
      const menu = wx.getMenuButtonBoundingClientRect()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      const barHeight = Math.max(44, (menu.top - statusBarHeight) * 2 + menu.height)
      // 右侧操作要让开原生胶囊；扣除导航行自身的 28rpx 内边距，避免重复留白。
      const rowPadding = windowInfo.windowWidth * 28 / 750
      const rightInset = menu.width > 0
        ? Math.max(0, windowInfo.windowWidth - menu.left + 8 - rowPadding)
        : 0
      this.setData({ statusBarHeight, barHeight, rightInset })
    },
  },
  methods: {
    onLeft() { this.triggerEvent('left') },
    onRight() { this.triggerEvent('right') },
  },
})
