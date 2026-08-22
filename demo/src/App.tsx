import { useMemo, useState } from 'react'
import { Box } from '@mantine/core'
import type { View } from './types'
import BottomNav from './components/BottomNav'
import QuickCaptureSheet from './components/QuickCaptureSheet'
import LibraryPage from './pages/LibraryPage'
import RecipeDetailPage from './pages/RecipeDetailPage'
import EditRecipePage from './pages/EditRecipePage'
import HistoryPage from './pages/HistoryPage'
import FamilyPage from './pages/FamilyPage'

export interface PageProps {
  navigate: (v: View) => void
}

const TOP_LEVEL: View['name'][] = ['library', 'family']

/** 桌面演示时的假状态栏 */
function StatusBar() {
  return (
    <div className="status-bar">
      <span>9:41</span>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
        <rect x="0" y="3" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.4" />
        <rect x="4.5" y="2" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
        <rect x="9" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
        <rect x="13.5" y="1" width="2" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <rect x="14" y="3" width="1" height="6" rx="0.3" fill="currentColor" opacity="0.6" />
      </svg>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'library' })
  const [captureOpen, setCaptureOpen] = useState(false)

  const navigate = (v: View) => setView(v)

  const page = useMemo(() => {
    switch (view.name) {
      case 'detail':
        return <RecipeDetailPage id={view.id} navigate={navigate} />
      case 'edit':
        return <EditRecipePage id={view.id} navigate={navigate} />
      case 'history':
        return <HistoryPage id={view.id} navigate={navigate} />
      case 'family':
        return <FamilyPage navigate={navigate} />
      default:
        return <LibraryPage navigate={navigate} />
    }
  }, [view])

  const isTopLevel = TOP_LEVEL.includes(view.name)

  return (
    <div className="device-wrap">
      <Box className="app-frame">
        <StatusBar />
        <Box className="app-screen" key={`${view.name}:${'id' in view ? view.id : ''}`}>
          {page}
        </Box>
        {isTopLevel && <BottomNav view={view} navigate={navigate} onCapture={() => setCaptureOpen(true)} />}
        <QuickCaptureSheet opened={captureOpen} onClose={() => setCaptureOpen(false)} navigate={navigate} />
      </Box>
    </div>
  )
}
