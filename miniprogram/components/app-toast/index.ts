/** 设计稿中的深色胶囊提示；延迟卸载以保留退场动画。 */
let exitTimer: ReturnType<typeof setTimeout> | undefined

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: false },
    message: { type: String, value: '' },
  },
  data: {
    mounted: false,
    open: false,
  },
  observers: {
    visible(visible: boolean) {
      if (visible) {
        if (exitTimer) {
          clearTimeout(exitTimer)
          exitTimer = undefined
        }
        this.setData({ mounted: true, open: false })
        wx.nextTick(() => this.setData({ open: true }))
      } else if (this.data.mounted) {
        this.setData({ open: false })
        exitTimer = setTimeout(() => {
          this.setData({ mounted: false })
          exitTimer = undefined
        }, 240)
      }
    },
  },
  lifetimes: {
    detached() {
      if (exitTimer) clearTimeout(exitTimer)
    },
  },
})
