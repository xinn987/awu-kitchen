/** 统一轻量加载占位：品牌色 spinner 加可选说明文字，用于页面数据加载态。 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    label: { type: String, value: '' },
  },
})
