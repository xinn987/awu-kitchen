/** 底部选择弹层的通用容器：白底、把手、上滑入场；内容由使用方通过 slot 提供。 */
const exitTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()

/** 一个页面可能同时挂载多个选择器；退出计时器必须按组件实例隔离。 */
function clearExitTimer(instance: object) {
  const timer = exitTimers.get(instance)
  if (timer) clearTimeout(timer)
  exitTimers.delete(instance)
}

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
        clearExitTimer(this)
        this.setData({ mounted: true, open: false })
        wx.nextTick(() => this.setData({ open: true }))
      } else if (this.data.mounted) {
        this.setData({ open: false })
        clearExitTimer(this)
        const timer = setTimeout(() => {
          this.setData({ mounted: false })
          exitTimers.delete(this)
        }, 240)
        exitTimers.set(this, timer)
      }
    },
  },
  lifetimes: {
    detached() {
      clearExitTimer(this)
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
