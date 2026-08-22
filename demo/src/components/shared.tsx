import { Box } from '@mantine/core'
import { MEMBER_COLORS } from '../utils'

export function MemberAvatar({
  name,
  size = 26,
  color,
}: {
  name: string
  size?: number
  color?: string
}) {
  const bg = color ?? MEMBER_COLORS[name] ?? '#8A7E74'
  return (
    <Box
      w={size}
      h={size}
      style={{
        borderRadius: '50%',
        backgroundColor: bg,
        color: '#FFF',
        fontSize: size * 0.42,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
      }}
      title={name}
    >
      {name.slice(0, 1)}
    </Box>
  )
}

/** 杂志式小节标题: 成功关键 / 食材 / 步骤 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Box component="h2" className="section-title" m={0} mb={12}>
      {children}
    </Box>
  )
}
