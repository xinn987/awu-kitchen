/** 四个主栏目围绕中央“添加食谱”按钮，栏目名均表达内容而非动作。 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { active: { type: String, value: 'library' } },
  methods: {
    goLibrary() {
      if (this.data.active !== 'library') wx.reLaunch({ url: '/pages/library/index' })
    },
    goJournal() {
      if (this.data.active !== 'journal') wx.reLaunch({ url: '/pages/recipe-journal/index' })
    },
    goFamily() {
      if (this.data.active !== 'family') wx.reLaunch({ url: '/pages/family/index' })
    },
    goSettings() {
      if (this.data.active !== 'settings') wx.reLaunch({ url: '/pages/settings/index' })
    },
    capture() { this.triggerEvent('capture') },
  },
})
