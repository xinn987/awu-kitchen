import { useState } from 'react'
import { Box, Group, Text, UnstyledButton } from '@mantine/core'
import { IconClock, IconRotateClockwise } from '@tabler/icons-react'
import { useStore } from '../store'
import { notify, relTime, shortDate } from '../utils'
import { MemberAvatar } from '../components/shared'
import { Navbar } from './RecipeDetailPage'
import type { PageProps } from '../App'

interface Props extends PageProps {
  id: string
}

export default function HistoryPage({ id, navigate }: Props) {
  const { getRecipe, restoreRevision } = useStore()
  const recipe = getRecipe(id)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (!recipe) {
    return (
      <div className="page">
        <Navbar left="返回" onLeft={() => navigate({ name: 'library' })} />
        <div className="page-scroll">
          <Text px={20} py={48} ta="center" fz={13} c="#9A8E82">
            没有找到这份食谱
          </Text>
        </div>
      </div>
    )
  }

  const sorted = [...recipe.revisions].reverse()
  const latestId = recipe.revisions[recipe.revisions.length - 1]?.id

  const handleRestore = (revId: string) => {
    restoreRevision(id, revId)
    setConfirmId(null)
    notify('已恢复旧版本')
    navigate({ name: 'detail', id })
  }

  return (
    <div className="page">
      <Navbar
        left="返回"
        onLeft={() => navigate({ name: 'detail', id })}
        center={
          <Box lh={1.15}>
            <Text fz={13.5} fw={500} c="#1A1714">
              修订记录
            </Text>
            <Text fz={11} c="#9A8E82">
              {recipe.name}
            </Text>
          </Box>
        }
      />

      <div className="page-scroll">
        <Box px={18} py={18} pb={28}>
          {sorted.length === 0 ? (
            <Text py={44} ta="center" fz={13} c="#9A8E82">
              暂无修订记录
            </Text>
          ) : (
            <Box style={{ display: 'flex', flexDirection: 'column' }}>
              {sorted.map((rev, i) => {
                const isCurrent = rev.id === latestId
                const isConfirming = confirmId === rev.id
                return (
                  <Box key={rev.id} pos="relative" style={{ display: 'flex', gap: 14 }}>
                    {i < sorted.length - 1 && (
                      <Box
                        pos="absolute"
                        left={13}
                        top={32}
                        bottom={0}
                        w={1}
                        bg="rgba(26,23,20,0.08)"
                      />
                    )}
                    <Box
                      w={27}
                      h={27}
                      mt={2}
                      style={{
                        borderRadius: '50%',
                        background: isCurrent ? '#BF5924' : '#E3DCD2',
                        color: isCurrent ? '#FFF' : '#9A8E82',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        zIndex: 1,
                      }}
                    >
                      {isCurrent ? (
                        <IconClock size={13} stroke={2} />
                      ) : (
                        <IconRotateClockwise size={13} stroke={2} />
                      )}
                    </Box>

                    <Box pb={22} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={7} mb={3}>
                        <MemberAvatar name={rev.author} size={19} />
                        <Text fz={13} fw={500} c="#1A1714">
                          {rev.author}
                        </Text>
                        {isCurrent && (
                          <Box
                            fz={10}
                            px={6}
                            py={1}
                            style={{
                              borderRadius: 99,
                              background: 'rgba(191,89,36,0.1)',
                              color: '#BF5924',
                              fontWeight: 500,
                            }}
                          >
                            当前版本
                          </Box>
                        )}
                      </Group>
                      <Text fz={11.5} c="#9A8E82" mb={4}>
                        {shortDate(rev.time)} · {relTime(rev.time)}
                      </Text>
                      <Text fz={12.5} c="rgba(26,23,20,0.7)" lh={1.6}>
                        {rev.summary}
                      </Text>

                      {rev.snapshot.successKeys.filter(Boolean).length > 0 && (
                        <Box
                          mt={9}
                          p={12}
                          style={{
                            borderRadius: 12,
                            background: 'rgba(234,227,216,0.55)',
                            border: '1px solid rgba(26,23,20,0.06)',
                          }}
                        >
                          <Text fz={10.5} c="#9A8E82" mb={6}>
                            该版本的成功关键
                          </Text>
                          {rev.snapshot.successKeys.filter(Boolean).map((k, ki) => (
                            <Text key={ki} className="font-serif" fz={12} lh={1.7} c="#1A1714" mb={ki < rev.snapshot.successKeys.filter(Boolean).length - 1 ? 4 : 0}>
                              {ki + 1}. {k}
                            </Text>
                          ))}
                        </Box>
                      )}

                      {!isCurrent && (
                        <Box mt={9}>
                          {isConfirming ? (
                            <Group gap={10}>
                              <Text fz={11.5} c="#7C6F63">
                                确认恢复到这个版本？
                              </Text>
                              <UnstyledButton
                                onClick={() => handleRestore(rev.id)}
                                fz={11.5}
                                fw={600}
                                c="#BF5924"
                              >
                                确认恢复
                              </UnstyledButton>
                              <UnstyledButton onClick={() => setConfirmId(null)} fz={11.5} c="#9A8E82">
                                取消
                              </UnstyledButton>
                            </Group>
                          ) : (
                            <UnstyledButton
                              onClick={() => setConfirmId(rev.id)}
                              fz={11.5}
                              c="#7C6F63"
                              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <IconRotateClockwise size={12} stroke={2} /> 恢复此版本
                            </UnstyledButton>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      </div>
    </div>
  )
}
