import { createTheme, rem, type MantineColorsTuple } from '@mantine/core'

// —— 品牌色板（取自 Figma 设计稿）——————————————————————
// 主色「赤陶」: 沉稳的陶土橙, 温暖而不轻飘
const terracotta: MantineColorsTuple = [
  '#F8EFE7',
  '#F0DCCB',
  '#E1B894',
  '#D3966B',
  '#C57744',
  '#BF5924',
  '#A64A1E',
  '#8C3E19',
  '#723414',
  '#582810',
]

// 辅助色「橄榄绿」: 天然食材、成功状态
const sage: MantineColorsTuple = [
  '#F0F2E9',
  '#DFE5D1',
  '#C3CCAA',
  '#A5B282',
  '#8A9A63',
  '#6B8A4A',
  '#5A7740',
  '#4A6236',
  '#3B4E2C',
  '#2C3B21',
]

// 中性色「可可」: 暖灰文字
const cocoa: MantineColorsTuple = [
  '#F6F1EA',
  '#EAE2D6',
  '#D6C9B6',
  '#BCAA91',
  '#A4907A',
  '#8F7E6B',
  '#7C6F63',
  '#63584D',
  '#463E36',
  '#2A251F',
]

export const theme = createTheme({
  colors: {
    terracotta,
    sage,
    cocoa,
  },
  primaryColor: 'terracotta',
  primaryShade: 5,
  defaultRadius: 'md',
  radius: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '14px',
    xl: '18px',
  },
  fontFamily:
    "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
  headings: {
    fontFamily: "'Noto Serif SC', 'Songti SC', 'STSong', Georgia, serif",
    fontWeight: '600',
  },
  fontSizes: {
    xs: rem(11),
    sm: rem(12.5),
    md: rem(14),
    lg: rem(16),
    xl: rem(19),
  },
  other: {
    paper: '#F4EFE6',
    card: '#FFFFFF',
    ink: '#1A1714',
    inkSoft: '#7C6F63',
    line: 'rgba(26, 23, 20, 0.1)',
    inputBg: '#EDE6DA',
    terracotta: '#BF5924',
  },
  components: {
    Button: {
      defaultProps: { radius: 'lg', fw: 500 },
    },
    ActionIcon: {
      defaultProps: { radius: 'lg' },
    },
    Card: {
      defaultProps: { radius: 'lg', padding: 'lg' },
    },
    Modal: {
      defaultProps: { radius: 'xl', centered: true },
    },
    Drawer: {
      defaultProps: { radius: 'lg' },
    },
    TextInput: {
      defaultProps: { radius: 'md' },
    },
    Textarea: {
      defaultProps: { radius: 'md' },
    },
    Chip: {
      defaultProps: { radius: 'xl' },
    },
    Badge: {
      defaultProps: { radius: 'sm', fw: 500 },
    },
    Tooltip: {
      defaultProps: { radius: 'sm', withArrow: true },
    },
  },
})
