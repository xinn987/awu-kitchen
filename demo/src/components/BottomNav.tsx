import { UnstyledButton } from '@mantine/core'
import { IconBooks, IconPlus, IconUsers } from '@tabler/icons-react'
import type { View } from '../types'

interface Props {
  view: View
  navigate: (v: View) => void
  onCapture: () => void
}

export default function BottomNav({ view, navigate, onCapture }: Props) {
  return (
    <nav className="app-tabbar">
      <UnstyledButton
        className={`app-tab${view.name === 'library' ? ' active' : ''}`}
        onClick={() => navigate({ name: 'library' })}
      >
        <IconBooks size={21} stroke={view.name === 'library' ? 1.9 : 1.6} />
        食谱库
      </UnstyledButton>

      <div className="app-tab-center">
        <button className="capture-btn" onClick={onCapture} aria-label="收录新做法">
          <IconPlus size={22} stroke={2.5} />
        </button>
      </div>

      <UnstyledButton
        className={`app-tab${view.name === 'family' ? ' active' : ''}`}
        onClick={() => navigate({ name: 'family' })}
      >
        <IconUsers size={21} stroke={view.name === 'family' ? 1.9 : 1.6} />
        家庭
      </UnstyledButton>
    </nav>
  )
}
