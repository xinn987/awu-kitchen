/**
 * 页内底部确认面板：所有破坏性或需要慎重的确认统一走这里，
 * 取代此前并存的 wx.showModal、行内确认条和各页自制浮层。
 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    copy: { type: String, value: '' },
    note: { type: String, value: '' },
    confirmText: { type: String, value: '确认' },
    cancelText: { type: String, value: '取消' },
    /** 危险操作确认键使用警示色；隐藏取消键可表达“只有一条出路”的提示面板。 */
    danger: { type: Boolean, value: false },
    cancelable: { type: Boolean, value: true },
  },
  methods: {
    confirm() { this.triggerEvent('confirm') },
    cancel() {
      if (!this.data.cancelable) return
      this.triggerEvent('cancel')
    },
    noop() { /* 阻止点击面板本身时关闭遮罩。 */ },
  },
})
