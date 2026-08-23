/** 两端页签加中央悬浮收录按钮。 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { active: { type: String, value: 'library' } },
  methods: {
    goLibrary() {
      if (this.data.active !== 'library') wx.reLaunch({ url: '/pages/library/index' })
    },
    goFamily() {
      if (this.data.active !== 'family') wx.reLaunch({ url: '/pages/family/index' })
    },
    capture() { this.triggerEvent('capture') },
  },
})
