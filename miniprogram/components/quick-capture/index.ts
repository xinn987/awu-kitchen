/**
 * 两步式快速收录：先留下名称，再填写成功关键。
 * 第二步可以明确暂存为待补条目，避免把草稿伪装成正式食谱。
 * mounted/open 两个状态负责滑入滑出动画，opened 只反映外部意图。
 */
import { quickCapture, savePending } from '../../services/recipe-store'

const KEY_EXAMPLES = [
  '比如：牛肉逆纹剁碎抓一点淀粉，粥快好时下锅焖 5 分钟，肉末嫩而不柴',
  '比如：蛋黄液用温水 1:1.5 调开，盖扎了孔的保鲜膜蒸，嫩滑不起蜂窝',
  '比如：南瓜蒸到筷子能轻松穿透，过一遍筛，口感明显更细',
]

/** 退场动画结束后才卸载面板。 */
let exitTimer: ReturnType<typeof setTimeout> | undefined

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { opened: { type: Boolean, value: false } },
  data: {
    mounted: false,
    open: false,
    step: 'name',
    name: '',
    keyText: '',
    example: KEY_EXAMPLES[0],
    nameFilled: false,
    keyFilled: false,
  },
  observers: {
    opened(opened: boolean) {
      if (opened) {
        if (exitTimer) {
          clearTimeout(exitTimer)
          exitTimer = undefined
        }
        const example = KEY_EXAMPLES[Math.floor(Math.random() * KEY_EXAMPLES.length)]
        this.setData({ mounted: true, open: false, step: 'name', name: '', keyText: '', example, nameFilled: false, keyFilled: false })
        wx.nextTick(() => this.setData({ open: true }))
      } else if (this.data.mounted) {
        this.setData({ open: false })
        exitTimer = setTimeout(() => this.setData({ mounted: false }), 280)
      }
    },
  },
  lifetimes: {
    detached() {
      if (exitTimer) clearTimeout(exitTimer)
    },
  },
  methods: {
    noop() { /* 阻止点击面板时关闭遮罩。 */ },
    close() { this.triggerEvent('close') },
    back() { this.setData({ step: 'name' }) },
    next() {
      if (this.data.nameFilled) this.setData({ step: 'key' })
    },
    onNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const name = event.detail.value
      this.setData({ name, nameFilled: name.trim().length > 0 })
    },
    onKeyInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const keyText = event.detail.value
      this.setData({ keyText, keyFilled: keyText.trim().length > 0 })
    },
    saveFormal() {
      if (!this.data.nameFilled || !this.data.keyFilled) return
      const recipe = quickCapture(this.data.name, this.data.keyText)
      this.triggerEvent('saved', { id: recipe.id, formal: true, message: `「${recipe.name}」已正式收录` })
    },
    saveDraft() {
      if (!this.data.nameFilled) return
      const recipe = savePending(this.data.name)
      this.triggerEvent('saved', { id: recipe.id, formal: false, message: '已暂存为待补条目' })
    },
  },
})
