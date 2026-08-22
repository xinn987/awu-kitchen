import { useState } from 'react'
import { Box, Button, Group, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconCrown, IconUserPlus, IconX } from '@tabler/icons-react'
import { FAMILY_NAME } from '../data'
import { useStore } from '../store'
import { MemberAvatar } from '../components/shared'
import type { PageProps } from '../App'

const EXTRA_COLORS = ['#8A5A4A', '#5A7A8A', '#8A6A4A', '#4A6A8A']

export default function FamilyPage({ navigate: _navigate }: PageProps) {
  const { members, recipes, currentUser } = useStore()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [extraMembers, setExtraMembers] = useState<{ id: string; name: string; color: string }[]>([])
  const [removing, setRemoving] = useState<string | null>(null)

  const allMembers = [...members, ...extraMembers]
  const contributionCount = (name: string) =>
    recipes.filter((r) => r.createdBy === name || r.updatedBy === name).length

  const sendInvite = () => {
    const name = inviteInput.trim()
    if (!name) return
    setExtraMembers((prev) => [
      ...prev,
      {
        id: `extra-${Date.now()}`,
        name,
        color: EXTRA_COLORS[Math.floor(Math.random() * EXTRA_COLORS.length)],
      },
    ])
    setInviteInput('')
    setInviteOpen(false)
  }

  const handleRemove = (id: string) => {
    if (extraMembers.some((m) => m.id === id)) setExtraMembers((prev) => prev.filter((m) => m.id !== id))
    setRemoving(null)
  }

  return (
    <div className="page">
      <div className="page-scroll">
        <Box px={20} pt={20} pb={14}>
          <Text className="font-serif" fz={23} fw={600} c="#1A1714">
            家庭成员
          </Text>
          <Text fz={12} c="#7C6F63" mt={5}>
            {FAMILY_NAME} · {allMembers.length} 位成员
          </Text>
        </Box>

        <Box px={16} pb={24} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allMembers.map((m) => {
            const isSelf = m.id === currentUser.id
            const role = 'role' in m ? m.role : 'member'
            return (
              <Group
                key={m.id}
                gap={13}
                p={15}
                wrap="nowrap"
                bg="#FFFFFF"
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(26,23,20,0.1)',
                  boxShadow: '0 1px 3px rgba(26,23,20,0.05)',
                }}
              >
                <MemberAvatar
                  name={m.name}
                  size={40}
                  color={(m as { color?: string }).color}
                />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={7} wrap="nowrap">
                    <Text fz={14} fw={500} c="#1A1714">
                      {m.name}
                    </Text>
                    {isSelf && (
                      <Text fz={11} c="#9A8E82">
                        （你）
                      </Text>
                    )}
                    {role === 'admin' && <IconCrown size={13} stroke={1.8} style={{ color: '#D97706' }} />}
                  </Group>
                  <Text fz={11.5} c="#9A8E82" mt={3}>
                    {role === 'admin' ? '管理员' : '成员'} · 参与了 {contributionCount(m.name)} 份食谱
                  </Text>
                </Box>
                {!isSelf && currentUser.role === 'admin' && (
                  <UnstyledButton
                    onClick={() => setRemoving(m.id)}
                    c="rgba(124,111,99,0.4)"
                    title="移出家庭"
                    style={{ flexShrink: 0 }}
                  >
                    <IconX size={16} stroke={2} />
                  </UnstyledButton>
                )}
              </Group>
            )
          })}

          {/* 邀请（行内展开） */}
          {inviteOpen ? (
            <Box p={15} bg="#FFFFFF" style={{ borderRadius: 14, border: '1px solid rgba(26,23,20,0.1)' }}>
              <Text fz={13.5} fw={500} c="#1A1714" mb={9}>
                通过名称邀请
              </Text>
              <Group gap={8} wrap="nowrap">
                <TextInput
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
                  placeholder="输入成员名称"
                  size="sm"
                  style={{ flex: 1 }}
                  data-autofocus
                  styles={{ input: { background: '#EDE6DA', border: 'none', fontSize: 13 } }}
                />
                <Button size="sm" onClick={sendInvite} disabled={!inviteInput.trim()} styles={{ root: { background: '#BF5924', fontWeight: 500 } }}>
                  邀请
                </Button>
                <UnstyledButton onClick={() => setInviteOpen(false)} c="#9A8E82">
                  <IconX size={18} stroke={1.8} />
                </UnstyledButton>
              </Group>
            </Box>
          ) : (
            <UnstyledButton
              onClick={() => setInviteOpen(true)}
              p={15}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                borderRadius: 14,
                border: '1.5px dashed rgba(26,23,20,0.2)',
                color: '#7C6F63',
                fontSize: 13.5,
  background: 'rgba(234,227,216,0.35)',
              }}
            >
              <IconUserPlus size={16} stroke={1.8} /> 邀请家庭成员
            </UnstyledButton>
          )}

          <Box p={15} mt={4} bg="rgba(234,227,216,0.5)" style={{ borderRadius: 14 }}>
            <Text fz={11.5} c="#7C6F63" lh={1.8}>
              所有成员均可查看和编辑食谱；管理员只负责邀请和移除成员。食谱属于家庭共同拥有，经验仅供参考，不构成专业建议。
            </Text>
          </Box>
        </Box>
      </div>

      {/* 移出确认（行内气泡） */}
      {removing !== null && (
        <Box
          pos="absolute"
          bottom={20}
          left={20}
          right={20}
          p={16}
          bg="#FFFFFF"
          style={{
            borderRadius: 16,
            border: '1px solid rgba(26,23,20,0.1)',
            boxShadow: '0 16px 40px rgba(26,23,20,0.18)',
            zIndex: 50,
          }}
        >
          <Group gap={10} mb={12}>
            <Text fz={14} fw={500} c="#1A1714">
              移出这位成员？
            </Text>
          </Group>
          <Text fz={12.5} c="#7C6F63" lh={1.65} mb={14}>
            移出后 TA 将无法访问家庭食谱；TA 记录的食谱仍属于家庭，不会被删除。
          </Text>
          <Group justify="flex-end" gap={8}>
            <Button variant="subtle" color="cocoa" size="compact-md" onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button
              variant="light"
              color="red"
              size="compact-md"
              onClick={() => handleRemove(removing)}
            >
              确认移出
            </Button>
          </Group>
        </Box>
      )}
    </div>
  )
}
