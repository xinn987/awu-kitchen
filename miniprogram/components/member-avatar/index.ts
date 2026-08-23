/** 家庭成员的纯文字头像，颜色与 HTTP demo 保持一致。 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    name: { type: String, value: '' },
    size: { type: Number, value: 52 },
    color: { type: String, value: '#8A7E74' },
  },
  data: { initial: '' },
  observers: {
    name(value: string) {
      this.setData({ initial: value.slice(0, 1) })
    },
  },
})
