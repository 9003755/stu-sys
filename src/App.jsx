import { Suspense } from 'react'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom'
import ClassDocumentUpload from './pages/ClassDocumentUpload'
import { lazyWithRetry } from './lib/lazyWithRetry'

const PrivateApp = lazyWithRetry(() => import('./PrivateApp'))

function AppRoutes() {
  const location = useLocation()

  if (location.pathname.startsWith('/class-documents/')) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">加载中...</div>}>
        <Routes>
          <Route path="/class-documents/:accessToken" element={<ClassDocumentUpload />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">加载中...</div>}>
      <PrivateApp />
    </Suspense>
  )
}

export default function App() {
  return <Router><AppRoutes /></Router>
}
