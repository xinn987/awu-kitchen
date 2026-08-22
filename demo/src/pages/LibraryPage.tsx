import { useMemo, useState } from 'react'
import { Box, Group, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useStore } from '../store'
import { FOOD_TYPES, type Recipe } from '../types'
import { relTime } from '../utils'
import { MemberAvatar } from '../components/shared'
import type { PageProps } from '../App'

export default function LibraryPage({ navigate }: PageProps) {
  const { recipes, formalRecipes, pendingRecipes, members, searchRecipes } = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('全部')

  const { formal, drafts } = useMemo(() => {
    const byQuery = query.trim() ? searchRecipes(query) : recipes
    const isDraft = (r: Recipe) => r.successKeys.every((k) => !k.trim())
    const matchFilter =
      filter === '全部' || filter === '待补充' ? () => true : (r: Recipe) => r.type === filter
    const filtered = byQuery.filter((r) => matchFilter(r))
    return {
      formal: filtered.filter((r) => !isDraft(r)),
      drafts: filter === '全部' || filter === '待补充' ? filtered.filter(isDraft) : [],
    }
  }, [query, filter, recipes, searchRecipes])

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>()
    formalRecipes.forEach((r) => {
      if (r.type) map.set(r.type, (map.get(r.type) ?? 0) + 1)
    })
    return map
  }, [formalRecipes])

  const chips = [
    { label: '全部', count: formalRecipes.length },
    ...FOOD_TYPES.filter((t) => (typeCounts.get(t) ?? 0) > 0).map((t) => ({
      label: t,
      count: typeCounts.get(t) ?? 0,
    })),
    ...(pendingRecipes.length > 0 ? [{ label: '待补充', count: pendingRecipes.length }] : []),
  ]

  return (
    <div className="page">
      <div className="page-scroll">
        {/* —— 页首 —— */}
        <Box px={20} pt={20} pb={14}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box>
              <Text className="font-serif" fz={23} fw={600} c="#1A1714" lh={1.2}>
                家庭食谱
              </Text>
              <Text fz={12} c="#7C6F63" mt={5}>
                {formalRecipes.length} 份食谱 · {pendingRecipes.length} 个待补条目
              </Text>
            </Box>
            {/* 成员头像叠放 */}
            <Box mt={2} style={{ display: 'flex' }}>
              {members.map((m) => (
                <Box
                  key={m.id}
                  ml={-7}
                  style={{
                    borderRadius: '50%',
                    border: '2px solid #F4EFE6',
                    lineHeight: 0,
                  }}
                >
                  <MemberAvatar name={m.name} size={27} />
                </Box>
              ))}
            </Box>
          </Group>

          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="搜索食谱名或食材"
            mt={14}
            leftSection={<IconSearch size={15} stroke={1.8} />}
            styles={{
              input: {
                height: 40,
                fontSize: 13.5,
                background: '#FFFFFF',
                borderColor: 'rgba(26,23,20,0.1)',
                '&:focus': { borderColor: '#BF5924' },
              },
            }}
          />
        </Box>

        {/* —— 类型筛选 —— */}
        <Box className="chip-scroll" px={20} pb={14}>
          {chips.map((chip) => {
            const active = filter === chip.label
            return (
              <UnstyledButton
                key={chip.label}
                onClick={() => setFilter(chip.label)}
                fz={12}
                px={12}
                h={30}
                bd={`1px solid ${active ? '#BF5924' : 'rgba(26,23,20,0.1)'}`}
                bg={active ? '#BF5924' : '#FFFFFF'}
                c={active ? '#FFF' : '#7C6F63'}
                style={{ borderRadius: 99, flexShrink: 0, fontWeight: 500, transition: 'all .15s ease' }}
              >
                {chip.label} {chip.count}
              </UnstyledButton>
            )
          })}
        </Box>

        {/* —— 卡片列表 —— */}
        <Box px={16} pb={28} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {formal.map((r) => (
            <RecipeCard key={r.id} recipe={r} onClick={() => navigate({ name: 'detail', id: r.id })} />
          ))}

          {drafts.length > 0 && formal.length > 0 && (
            <Group gap={12} mt={6} mb={2} px={4}>
              <Box style={{ flex: 1, height: 1, background: 'rgba(26,23,20,0.08)' }} />
              <Text fz={11} c="#9A8E82">
                待补条目
              </Text>
              <Box style={{ flex: 1, height: 1, background: 'rgba(26,23,20,0.08)' }} />
            </Group>
          )}
          {drafts.map((r) => (
            <RecipeCard key={r.id} recipe={r} onClick={() => navigate({ name: 'detail', id: r.id })} />
          ))}

          {formal.length === 0 && drafts.length === 0 && (
            <Box py={56} style={{ textAlign: 'center' }}>
              <Text fz={13.5} c="#9A8E82">
                {query ? `没有找到「${query}」相关的食谱` : '这里还没有食谱'}
              </Text>
            </Box>
          )}
        </Box>
      </div>
    </div>
  )
}

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const isDraft = recipe.successKeys.every((k) => !k.trim())

  return (
    <UnstyledButton
      onClick={onClick}
      p={16}
      bd={
        isDraft
          ? '1.5px dashed rgba(26,23,20,0.22)'
          : '1px solid rgba(26,23,20,0.1)'
      }
      bg={isDraft ? 'rgba(234,227,216,0.5)' : '#FFFFFF'}
      style={{
        borderRadius: 14,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
        boxShadow: isDraft ? 'none' : '0 1px 3px rgba(26,23,20,0.05)',
        transition: 'transform .15s ease',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap={10}>
        <Text
          className="font-serif"
          fz={16}
          fw={600}
          c={isDraft ? 'rgba(26,23,20,0.65)' : '#1A1714'}
          lineClamp={1}
          lh={1.4}
        >
          {recipe.name}
        </Text>
        {isDraft ? (
          <DraftBadge />
        ) : (
          recipe.type && (
            <Box
              fz={11}
              px={8}
              py={2}
              c="#7C6F63"
              bg="#EAE3D8"
              style={{ borderRadius: 99, flexShrink: 0, fontWeight: 500 }}
            >
              {recipe.type}
            </Box>
          )
        )}
      </Group>

      {isDraft ? (
        <Text fz={12} c="rgba(124,111,99,0.75)" fs="italic">
          尚无成功关键——补充后可正式存入
        </Text>
      ) : (
        <Box
          pl={11}
          style={{ borderLeft: '2px solid rgba(191,89,36,0.4)' }}
        >
          <Text className="font-serif" fz={13} c="rgba(26,23,20,0.78)" lh={1.65} lineClamp={2}>
            {recipe.successKeys[0]}
          </Text>
          {recipe.successKeys.length > 1 && (
            <Text fz={11} c="#9A8E82" mt={2}>
              +{recipe.successKeys.length - 1} 条关键
            </Text>
          )}
        </Box>
      )}

      <Group justify="space-between" wrap="nowrap" gap={8}>
        <Group gap={5} wrap="nowrap">
          {recipe.tags.slice(0, 3).map((t) => (
            <Box key={t} fz={11} px={7} py={2} bg="#EAE3D8" c="#7C6F63" style={{ borderRadius: 99 }}>
              {t}
            </Box>
          ))}
        </Group>
        <Group gap={6} wrap="nowrap">
          <MemberAvatar name={recipe.updatedBy} size={19} />
          <Text fz={11} c="#9A8E82">
            {relTime(recipe.updatedAt)}
          </Text>
        </Group>
      </Group>
    </UnstyledButton>
  )
}

function DraftBadge() {
  return (
    <Box
      fz={10.5}
      px={8}
      py={2}
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
  )
}
