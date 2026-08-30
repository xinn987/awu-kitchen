/** 底部选择弹层的通用容器：白底、把手、上滑入场；内容由使用方通过 slot 提供。 */
let exitTimer: ReturnType<typeof setTimeout> | undefined

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    /** 遮罩是否可点关闭；带未保存选择的弹层可以关掉。 */
    maskClosable: { type: Boolean, value: true },
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
  methods: {
    onMaskTap() {
      if (this.properties.maskClosable) this.triggerEvent('close')
    },
    close() {
      this.triggerEvent('close')
    },
    noop() {},
  },
})

export {}
