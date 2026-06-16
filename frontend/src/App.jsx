import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from './api/client'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import EntityHub from './pages/EntityHub'
import NewEntity from './pages/NewEntity'

export default function App() {
  const [setupDone, setSetupDone] = useState(null)

  useEffect(() => {
    api.getSetupStatus()
      .then(s => setSetupDone(s.configured))
      .catch(() => setSetupDone(false))
  }, [])

  if (setupDone === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Cargando...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<Setup onComplete={() => setSetupDone(true)} />} />
        <Route path="/" element={setupDone ? <Dashboard /> : <Navigate to="/setup" />} />
        <Route path="/entities/new" element={setupDone ? <NewEntity /> : <Navigate to="/setup" />} />
        <Route path="/entities/:id/edit" element={setupDone ? <NewEntity edit /> : <Navigate to="/setup" />} />
        <Route path="/entities/:id/*" element={setupDone ? <EntityHub /> : <Navigate to="/setup" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
