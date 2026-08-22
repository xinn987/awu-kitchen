import { useEffect, useState } from 'react'
import { Box, Button, Drawer, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core'
import { IconChevronLeft, IconX } from '@tabler/icons-react'
import { useStore } from '../store'
import type { View } from '../types'
import { notify } from '../utils'

interface Props {
  opened: boolean
  onClose: () => void
  navigate: (v: View) => void
}

const KEY_EXAMPLES = [
  '比如：牛肉逆纹剁碎抓一点淀粉，粥快好时下锅焖 5 分钟，肉末嫩而不柴',
  '比如：蛋黄液用温水 1:1.5 调开，盖扎了孔的保鲜膜蒸，嫩滑不起蜂窝',
  '比如：南瓜蒸到筷子能轻松穿透，过一遍筛，口感明显更细',
]

/**
 * 两步式快速收录:
 * 第一步只问名称 → 第二步记录成功关键（可跳过，暂存为待补条目）
 */
export default function QuickCaptureSheet({ opened, onClose, navigate }: Props) {
  const { quickCapture, savePending } = useStore()
  const [step, setStep] = useState<'name' | 'key'>('name')
  const [name, setName] = useState('')
  const [keyText, setKeyText] = useState('')
  const [exampleIdx] = useState(() => Math.floor(Math.random() * KEY_EXAMPLES.length))

  useEffect(() => {
    if (opened) {
      setStep('name')
      setName('')
      setKeyText('')
    }
  }, [opened])

  const nameFilled = name.trim().length > 0

  const saveFormal = () => {
    if (!nameFilled || !keyText.trim()) return
    const saved = quickCapture({
      name: name.trim(),
      successKeys: [keyText.trim()],
      ingredients: [],
      steps: [],
      type: undefined,
      stage: undefined,
      tags: [],
    })
    notify(`「${saved.name}」已正式收录`)
    onClose()
    navigate({ name: 'detail', id: saved.id })
  }

  const saveDraft = () => {
    if (!nameFilled) return
    const saved = savePending(name.trim())
    notify('已暂存为待补条目')
    onClose()
    navigate({ name: 'library' })
    void saved
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      withCloseButton={false}
      lockScroll={false}
      styles={{
        content: {
          background: '#FFFFFF',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxWidth: 430,
          margin: '0 auto',
        },
        overlay: { background: 'rgba(26,23,20,0.35)' },
        inner: { zIndex: 200 },
      }}
    >
      <Box mx="auto" mt={10} mb={2} w={38} h={4.5} style={{ borderRadius: 99, background: '#E3DCD2' }} />

      {step === 'name' ? (
        <Box px={22} pt={10} pb={30}>
          <Box
            mb={18}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text fz={16} fw={600} c="#1A1714">
              收录一道新做法
            </Text>
            <UnstyledButton c="#9A8E82" onClick={onClose}>
              <IconX size={19} stroke={1.8} />
            </UnstyledButton>
          </Box>

          <Text fz={12} c="#7C6F63" mb={7}>
            食谱名称
          </Text>
          <TextInput
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nameFilled) setStep('key')
            }}
            placeholder="这道辅食叫什么？"
            data-autofocus
            size="lg"
            styles={{
              input: {
                background: '#EDE6DA',
                border: 'none',
                fontSize: 17,
                fontWeight: 500,
                padding: '0 16px',
                height: 52,
                color: '#1A1714',
              },
            }}
          />

          <Button
            fullWidth
            size="lg"
            mt={20}
            disabled={!nameFilled}
            onClick={() => setStep('key')}
            styles={{
              root: { background: nameFilled ? '#BF5924' : '#E3DCD2', color: nameFilled ? '#FFF' : '#9A8E82' },
              label: { fontWeight: 500 },
            }}
          >
            下一步
          </Button>
        </Box>
      ) : (
        <Box px={22} pt={10} pb={30}>
          <Box mb={18} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <UnstyledButton c="#9A8E82" onClick={() => setStep('name')}>
              <IconChevronLeft size={20} stroke={1.8} />
            </UnstyledButton>
            <Text className="font-serif" fz={17} fw={600} c="#1A1714" style={{ flex: 1 }} lineClamp={1}>
              {name.trim()}
            </Text>
            <UnstyledButton c="#9A8E82" onClick={onClose}>
              <IconX size={19} stroke={1.8} />
            </UnstyledButton>
          </Box>

          <Text fz={12} c="#7C6F63" mb={7}>
            这次做成功，关键在哪里？
          </Text>
          <Textarea
            value={keyText}
            onChange={(e) => setKeyText(e.currentTarget.value)}
            placeholder={KEY_EXAMPLES[exampleIdx]}
            minRows={3}
            autosize
            styles={{
              input: {
                background: '#EDE6DA',
                border: 'none',
                fontSize: 15,
                lineHeight: 1.7,
                padding: '14px 16px',
                color: '#1A1714',
              },
            }}
          />
          <Text fz={11.5} c="#9A8E82" mt={8} lh={1.6}>
            食材和步骤可以之后再补；有了成功关键，这道做法才算真正留下来了。
          </Text>

          <Button
            fullWidth
            size="lg"
            mt={18}
            disabled={!keyText.trim()}
            onClick={saveFormal}
            styles={{
              root: {
                background: keyText.trim() ? '#BF5924' : '#E3DCD2',
                color: keyText.trim() ? '#FFF' : '#9A8E82',
              },
              label: { fontWeight: 500 },
            }}
          >
            正式存入食谱库
          </Button>
          <Button variant="subtle" color="cocoa" fullWidth mt={8} disabled={!nameFilled} onClick={saveDraft}>
            暂存为待补条目，稍后补充
          </Button>
        </Box>
      )}
    </Drawer>
  )
}
