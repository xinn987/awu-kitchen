import { useMemo } from 'react'
import { Box, Button, Group, Text, UnstyledButton } from '@mantine/core'
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconCopy,
  IconHistory,
  IconPencil,
} from '@tabler/icons-react'
import { useStore } from '../store'
import { relTime, shortDate, notify } from '../utils'
import { MemberAvatar, SectionTitle } from '../components/shared'
import type { PageProps } from '../App'

interface Props extends PageProps {
  id: string
}

export default function RecipeDetailPage({ id, navigate }: Props) {
  const { getRecipe, duplicateRecipe } = useStore()
  const recipe = getRecipe(id)

  const isDraft = useMemo(
    () => !recipe || recipe.successKeys.every((k) => !k.trim()),
    [recipe],
  )

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

  const handleDuplicate = () => {
    const copy = duplicateRecipe(id)
    if (copy) {
      notify(`已复制为「${copy.name}」`)
      navigate({ name: 'detail', id: copy.id })
    }
  }

  return (
    <div className="page">
      <Navbar
        left="食谱库"
        onLeft={() => navigate({ name: 'library' })}
        right={
          <UnstyledButton
            onClick={() => navigate({ name: 'edit', id })}
            fz={13.5}
            fw={500}
            c="#BF5924"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <IconPencil size={14} stroke={2} /> 编辑
          </UnstyledButton>
        }
      />

      <div className="page-scroll">
        <Box px={20} pb={20}>
          {/* —— 标题区 —— */}
          <Box pt={18} pb={16} style={{ borderBottom: '1px solid rgba(26,23,20,0.08)' }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap={10} mb={9}>
              <Text className="font-serif" fz={23} fw={600} c="#1A1714" lh={1.3}>
                {recipe.name}
              </Text>
              {isDraft ? (
                <Box
                  fz={10.5}
                  px={8}
                  py={2}
                  mt={6}
                  style={{
                    borderRadius: 99,
                    background: '#FEF3C7',
                    color: '#B45309',
                    border: '1px solid #FDE68A',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  待补充
                </Box>
              ) : (
                recipe.type && (
                  <Box
                    fz={11}
                    px={8}
                    py={2}
                    mt={6}
                    c="#7C6F63"
                    bg="#EAE3D8"
                    style={{ borderRadius: 99, fontWeight: 500, flexShrink: 0 }}
                  >
                    {recipe.type}
                  </Box>
                )
              )}
            </Group>

            <Group gap={7} wrap="nowrap">
              <Group gap={6} wrap="nowrap">
                <MemberAvatar name={recipe.updatedBy} size={19} />
                <Text fz={12} c="#7C6F63">
                  {recipe.updatedBy} 修改于 {shortDate(recipe.updatedAt)}
                </Text>
              </Group>
              <Text fz={12} c="rgba(124,111,99,0.4)">
                ·
              </Text>
              <UnstyledButton
                onClick={() => navigate({ name: 'history', id })}
                fz={12}
                c="#7C6F63"
                style={{ display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                <IconHistory size={12} stroke={1.8} /> 修订记录
              </UnstyledButton>
            </Group>

            {(recipe.tags.length > 0 || recipe.stage) && (
              <Group gap={6} mt={12}>
                {recipe.stage && (
                  <Box fz={11} px={8} py={2} bg="#EAE3D8" c="#7C6F63" style={{ borderRadius: 99 }}>
                    {recipe.stage}
                  </Box>
                )}
                {recipe.tags.map((t) => (
                  <Box key={t} fz={11} px={8} py={2} bg="#EAE3D8" c="#7C6F63" style={{ borderRadius: 99 }}>
                    {t}
                  </Box>
                ))}
              </Group>
            )}
          </Box>

          {/* —— 成功关键 —— */}
          <Box py={18} style={{ borderBottom: '1px solid rgba(26,23,20,0.08)' }}>
            <SectionTitle>成功关键</SectionTitle>

            {isDraft ? (
              <Box
                p={16}
                style={{
                  borderRadius: 12,
                  border: '1px dashed #FCD34D',
                  background: '#FFFBEB',
                }}
              >
                <Group gap={9} align="flex-start" wrap="nowrap">
                  <IconAlertTriangle size={16} stroke={1.8} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <Box>
                    <Text fz={13.5} fw={500} c="#92400E">
                      还没有记录成功关键
                    </Text>
                    <Text fz={12} c="#B45309" mt={3} lh={1.6}>
                      补充至少一条，这道做法才能正式存入食谱库。
                    </Text>
                    <UnstyledButton
                      onClick={() => navigate({ name: 'edit', id })}
                      fz={12}
                      fw={500}
                      c="#92400E"
                      mt={8}
                      style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      现在补充 →
                    </UnstyledButton>
                  </Box>
                </Group>
              </Box>
            ) : (
              <Box style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recipe.successKeys.filter(Boolean).map((key, i) => (
                  <Box
                    key={i}
                    p={13}
                    style={{
                      borderRadius: 12,
                      background: 'rgba(191,89,36,0.05)',
                      borderLeft: '3px solid #BF5924',
                    }}
                  >
                    <Text className="font-serif" fz={14} lh={1.8} c="#1A1714">
                      {key}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* —— 食材 —— */}
          {recipe.ingredients.length > 0 && (
            <Box py={18} style={{ borderBottom: '1px solid rgba(26,23,20,0.08)' }}>
              <SectionTitle>食材</SectionTitle>
              <Box>
                {recipe.ingredients.map((ing, i) => (
                  <Group
                    key={i}
                    justify="space-between"
                    py={9}
                    style={{
                      borderBottom:
                        i < recipe.ingredients.length - 1 ? '1px solid rgba(26,23,20,0.06)' : 'none',
                    }}
                  >
                    <Text fz={13.5} c="#1A1714">
                      {ing.name}
                    </Text>
                    <Text fz={12.5} c="#7C6F63">
                      {ing.amount || '—'}
                    </Text>
                  </Group>
                ))}
              </Box>
            </Box>
          )}

          {/* —— 步骤 —— */}
          {recipe.steps.length > 0 && (
            <Box py={18}>
              <SectionTitle>步骤</SectionTitle>
              <Box style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {recipe.steps.map((step, i) => (
                  <Group key={i} gap={11} align="flex-start" wrap="nowrap">
                    <Box
                      w={20}
                      h={20}
                      mt={2}
                      style={{
                        borderRadius: '50%',
                        background: '#EAE3D8',
                        color: '#7C6F63',
                        fontSize: 11,
                        fontWeight: 500,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </Box>
                    <Text fz={13.5} c="#1A1714" lh={1.75} style={{ flex: 1 }}>
                      {step}
                    </Text>
                  </Group>
                ))}
              </Box>
            </Box>
          )}

          {/* —— 脚注 —— */}
          <Box pt={14} mt={2} style={{ borderTop: '1px solid rgba(26,23,20,0.08)' }}>
            <Text fz={11.5} c="#9A8E82">
              由 {recipe.createdBy} 创建 · 家庭共同拥有 · {relTime(recipe.updatedAt)}更新
            </Text>
          </Box>
        </Box>
      </div>

      {/* —— 底部操作 —— */}
      <div className="app-action-bar">
        <Button
          variant="default"
          size="md"
          leftSection={<IconCopy size={15} stroke={1.8} />}
          onClick={handleDuplicate}
          style={{ borderColor: 'rgba(26,23,20,0.12)', color: '#7C6F63', background: '#FFF' }}
        >
          复制
        </Button>
        <Button
          size="md"
          fullWidth
          leftSection={<IconPencil size={15} stroke={2} />}
          onClick={() => navigate({ name: 'edit', id })}
          styles={{ root: { background: '#BF5924', fontWeight: 500 } }}
        >
          {isDraft ? '补充成功关键' : '完善食谱'}
        </Button>
      </div>
    </div>
  )
}

/** 屏幕顶部导航条 */
export function Navbar({
  left,
  onLeft,
  center,
  right,
}: {
  left?: string
  onLeft?: () => void
  center?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="page-navbar">
      {left && onLeft ? (
        <UnstyledButton
          onClick={onLeft}
          fz={13}
          c="#7C6F63"
          style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 64 }}
        >
          <IconChevronLeft size={17} stroke={1.8} /> {left}
        </UnstyledButton>
      ) : (
        <Box style={{ minWidth: 64 }} />
      )}
      <Box style={{ flex: 1, textAlign: 'center' }}>{center}</Box>
      <Box style={{ minWidth: 64, display: 'flex', justifyContent: 'flex-end' }}>{right}</Box>
    </div>
  )
}
