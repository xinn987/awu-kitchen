import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Group,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCircleCheck,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import { useStore } from '../store'
import { FOOD_TYPES, STAGES, type Ingredient, type Stage, type FoodType } from '../types'
import { notify } from '../utils'
import { Navbar } from './RecipeDetailPage'
import type { PageProps } from '../App'

interface Props extends PageProps {
  id: string
}

const MAX_TAGS = 3

export default function EditRecipePage({ id, navigate }: Props) {
  const { getRecipe, updateRecipe } = useStore()
  const recipe = getRecipe(id)

  const wasDraft = useMemo(
    () => !recipe || recipe.successKeys.every((k) => !k.trim()),
    [recipe],
  )

  const [name, setName] = useState(recipe?.name ?? '')
  const [keys, setKeys] = useState<string[]>(
    recipe && recipe.successKeys.length > 0 ? recipe.successKeys.map((k) => k) : [''],
  )
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe && recipe.ingredients.length > 0 ? recipe.ingredients.map((i) => ({ ...i })) : [{ name: '' }],
  )
  const [steps, setSteps] = useState<string[]>(
    recipe && recipe.steps.length > 0 ? recipe.steps.map((s) => s) : [''],
  )
  const [type, setType] = useState<FoodType | undefined>(recipe?.type)
  const [stage, setStage] = useState<Stage | undefined>(recipe?.stage)
  const [tags, setTags] = useState<string[]>(recipe?.tags.map((t) => t) ?? [])
  const [tagDraft, setTagDraft] = useState('')

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

  const cleanKeys = () => keys.map((k) => k.trim()).filter(Boolean)
  const wouldBeFormal = cleanKeys().length > 0
  const canSave = name.trim().length > 0 && wouldBeFormal

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '')
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return
    setTags([...tags, t])
    setTagDraft('')
  }

  const save = () => {
    if (!canSave) return
    const next = updateRecipe(
      id,
      {
        name: name.trim(),
        successKeys: cleanKeys(),
        ingredients: ingredients
          .map((i) => ({ name: i.name.trim(), amount: i.amount?.trim() }))
          .filter((i) => i.name),
        steps: steps.map((s) => s.trim()).filter(Boolean),
        stage,
        type,
        tags,
      },
      wasDraft ? '补充成功关键，转为正式食谱' : '更新食谱内容',
    )
    if (next) {
      notify(wasDraft ? '已转为正式食谱' : '已保存')
      navigate({ name: 'detail', id })
    }
  }

  return (
    <div className="page">
      <Navbar left="取消" onLeft={() => navigate({ name: 'detail', id })} center={<Text fz={13.5} fw={500} c="#1A1714">编辑食谱</Text>} />

      <div className="page-scroll">
        <Box px={20} py={18} pb={24} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* 转正提示 */}
          {wasDraft && wouldBeFormal && (
            <Alert
              variant="light"
              color="teal"
              radius="md"
              icon={<IconCircleCheck size={16} stroke={1.8} />}
              styles={{ root: { background: '#ECFDF5', border: '1px solid #A7F3D0' }, body: { alignItems: 'center' } }}
            >
              <Text fz={12.5} c="#065F46">
                补充了成功关键，保存后将正式存入食谱库
              </Text>
            </Alert>
          )}

          {/* 名称 */}
          <Box>
            <Text fz={12} fw={500} c="#7C6F63" mb={7}>
              食谱名称
            </Text>
            <TextInput
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              size="md"
              styles={{
                input: {
                  background: '#EDE6DA',
                  border: 'none',
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#1A1714',
                },
              }}
            />
          </Box>

          {/* 成功关键（多条） */}
          <Box>
            <Group justify="space-between" mb={7}>
              <Text fz={12} fw={500} c="#7C6F63">
                成功关键 <Text span c="#BF5924">*</Text>
              </Text>
              <Text fz={11} c="#9A8E82">
                至少一条才能正式存入
              </Text>
            </Group>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {keys.map((key, i) => (
                <Group key={i} gap={9} align="stretch" wrap="nowrap">
                  <Box w={3.5} my={8} style={{ background: 'rgba(191,89,36,0.4)', borderRadius: 99, flexShrink: 0 }} />
                  <Textarea
                    value={key}
                    onChange={(e) => setKeys(keys.map((k, j) => (j === i ? e.currentTarget.value : k)))}
                    placeholder="比如：蒸到筷子能轻松穿过才够烂"
                    minRows={2}
                    autosize
                    style={{ flex: 1 }}
                    styles={{
                      input: {
                        background: '#EDE6DA',
                        border: 'none',
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: '#1A1714',
                      },
                    }}
                  />
                  <UnstyledButton
                    onClick={() =>
                      setKeys(keys.length > 1 ? keys.filter((_, j) => j !== i) : [''])
                    }
                    mt={9}
                    c="rgba(124,111,99,0.5)"
                    style={{ flexShrink: 0 }}
                  >
                    <IconX size={15} stroke={2} />
                  </UnstyledButton>
                </Group>
              ))}
            </Box>
            <UnstyledButton
              onClick={() => setKeys([...keys, ''])}
              mt={9}
              fz={13}
              fw={500}
              c="#BF5924"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <IconPlus size={15} stroke={2.2} /> 添加成功关键
            </UnstyledButton>
          </Box>

          {/* 食材 */}
          <Box>
            <Text fz={12} fw={500} c="#7C6F63" mb={9}>
              食材 <Text span c="#9A8E82" fw={400}>（可选）</Text>
            </Text>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ingredients.map((ing, i) => (
                <Group key={i} gap={8} wrap="nowrap">
                  <TextInput
                    placeholder="食材名"
                    value={ing.name}
                    onChange={(e) =>
                      setIngredients(ingredients.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)))
                    }
                    style={{ flex: 1 }}
                    styles={{ input: { background: '#EDE6DA', border: 'none', fontSize: 13.5 } }}
                  />
                  <TextInput
                    placeholder="用量"
                    value={ing.amount ?? ''}
                    w={96}
                    onChange={(e) =>
                      setIngredients(ingredients.map((x, j) => (j === i ? { ...x, amount: e.currentTarget.value } : x)))
                    }
                    styles={{ input: { background: '#EDE6DA', border: 'none', fontSize: 13.5 } }}
                  />
                  <UnstyledButton
                    onClick={() =>
                      setIngredients(ingredients.length > 1 ? ingredients.filter((_, j) => j !== i) : [{ name: '' }])
                    }
                    c="rgba(124,111,99,0.5)"
                    style={{ flexShrink: 0 }}
                  >
                    <IconX size={15} stroke={2} />
                  </UnstyledButton>
                </Group>
              ))}
            </Box>
            <UnstyledButton
              onClick={() => setIngredients([...ingredients, { name: '' }])}
              mt={9}
              fz={13}
              fw={500}
              c="#BF5924"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <IconPlus size={15} stroke={2.2} /> 添加食材
            </UnstyledButton>
          </Box>

          {/* 步骤 */}
          <Box>
            <Text fz={12} fw={500} c="#7C6F63" mb={9}>
              步骤 <Text span c="#9A8E82" fw={400}>（可选）</Text>
            </Text>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((step, i) => (
                <Group key={i} gap={8} align="flex-start" wrap="nowrap">
                  <Box
                    w={21}
                    h={30}
                    mt={5}
                    style={{
                      borderRadius: 7,
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
                  <Textarea
                    placeholder={`第 ${i + 1} 步`}
                    value={step}
                    autosize
                    minRows={1}
                    style={{ flex: 1 }}
                    onChange={(e) => setSteps(steps.map((s, j) => (j === i ? e.currentTarget.value : s)))}
                    styles={{ input: { background: '#EDE6DA', border: 'none', fontSize: 13.5, lineHeight: 1.7 } }}
                  />
                  <Group gap={2} mt={5} style={{ flexShrink: 0 }}>
                    <UnstyledButton
                      onClick={() => {
                        if (i === 0) return
                        const next = [...steps]
                        ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                        setSteps(next)
                      }}
                      disabled={i === 0}
                      c={i === 0 ? '#DDD2C0' : '#B0A48F'}
                    >
                      <IconArrowUp size={14} stroke={2} />
                    </UnstyledButton>
                    <UnstyledButton
                      onClick={() => {
                        if (i === steps.length - 1) return
                        const next = [...steps]
                        ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                        setSteps(next)
                      }}
                      disabled={i === steps.length - 1}
                      c={i === steps.length - 1 ? '#DDD2C0' : '#B0A48F'}
                    >
                      <IconArrowDown size={14} stroke={2} />
                    </UnstyledButton>
                    <UnstyledButton
                      onClick={() => setSteps(steps.length > 1 ? steps.filter((_, j) => j !== i) : [''])}
                      c="rgba(124,111,99,0.5)"
                    >
                      <IconX size={15} stroke={2} />
                    </UnstyledButton>
                  </Group>
                </Group>
              ))}
            </Box>
            <UnstyledButton
              onClick={() => setSteps([...steps, ''])}
              mt={9}
              fz={13}
              fw={500}
              c="#BF5924"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <IconPlus size={15} stroke={2.2} /> 添加步骤
            </UnstyledButton>
          </Box>

          {/* 类型 + 阶段 */}
          <Box>
            <Text fz={12} fw={500} c="#7C6F63" mb={9}>
              辅食类型
            </Text>
            <Chip.Group value={type ?? null} onChange={(v) => setType((v as FoodType) ?? undefined)}>
              <Group gap={7}>
                {FOOD_TYPES.map((t) => (
                  <Chip key={t} value={t} styles={{ label: { padding: '3px 13px', fontSize: 12 } }}>
                    {t}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Box>

          <Box>
            <Text fz={12} fw={500} c="#7C6F63" mb={9}>
              适用阶段
            </Text>
            <Chip.Group value={stage ?? null} onChange={(v) => setStage((v as Stage) ?? undefined)}>
              <Group gap={7}>
                {STAGES.map((s) => (
                  <Chip key={s} value={s} styles={{ label: { padding: '3px 13px', fontSize: 12 } }}>
                    {s}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Box>

          {/* 标签 */}
          <Box>
            <Text fz={12} fw={500} c="#7C6F63" mb={9}>
              核心原料标签 <Text span c="#9A8E82" fw={400}>（最多 {MAX_TAGS} 个）</Text>
            </Text>
            <Group gap={7}>
              {tags.map((t) => (
                <Box
                  key={t}
                  fz={12}
                  px={9}
                  py={3}
                  bg="#EAE3D8"
                  c="#5C5045"
                  style={{ borderRadius: 99, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  {t}
                  <UnstyledButton onClick={() => setTags(tags.filter((x) => x !== t))} c="#9A8E82">
                    <IconX size={11} stroke={2.4} />
                  </UnstyledButton>
                </Box>
              ))}
              {tags.length < MAX_TAGS && (
                <TextInput
                  placeholder={tags.length === 0 ? '如：牛肉' : '再加一个'}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  size="xs"
                  w={tags.length === 0 ? 150 : 100}
                  rightSection={
                    <UnstyledButton onClick={addTag} c={tagDraft.trim() ? '#BF5924' : '#C9BFA9'}>
                      <IconPlus size={13} stroke={2.2} />
                    </UnstyledButton>
                  }
                  styles={{ input: { background: '#EDE6DA', border: 'none', fontSize: 12.5 } }}
                />
              )}
            </Group>
          </Box>

          <Alert
            variant="light"
            color="yellow"
            radius="md"
            icon={<IconAlertTriangle size={16} stroke={1.8} />}
            styles={{ root: { background: '#FFFBEB', border: '1px solid #FDE68A' }, body: { alignItems: 'center' } }}
          >
            <Text fz={12} c="#92400E" lh={1.6}>
              涉及食材、比例或关键步骤的实质修改，确认做成功后再保存。
            </Text>
          </Alert>
        </Box>
      </div>

      <div className="app-action-bar">
        <Button
          size="md"
          fullWidth
          disabled={!canSave}
          onClick={save}
          styles={{
            root: { background: canSave ? '#BF5924' : '#E3DCD2', color: canSave ? '#FFF' : '#9A8E82', fontWeight: 500 },
          }}
        >
          保存{wasDraft && wouldBeFormal ? '并转为正式食谱' : '修改'}
        </Button>
      </div>
    </div>
  )
}
