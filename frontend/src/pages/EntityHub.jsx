import { useParams, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ArrowLeft, FileText, Map, AlertTriangle, Link2, FileOutput, Bot, Zap, GitCompare } from 'lucide-react'
import Documents from './Documents'
import Coverage from './Coverage'
import Findings from './Findings'
import Traceability from './Traceability'
import Report from './Report'
import Copilot from './Copilot'
import Inconsistencies from './Inconsistencies'

const NAV = [
  { path: 'coverage',        label: 'Cobertura',      icon: Map },
  { path: 'documents',       label: 'Documentos',     icon: FileText },
  { path: 'findings',        label: 'Hallazgos',      icon: AlertTriangle },
  { path: 'inconsistencies', label: 'Inconsistencias',icon: GitCompare },
  { path: 'traceability',    label: 'Trazabilidad',   icon: Link2 },
  { path: 'report',          label: 'Reporte',        icon: FileOutput },
  { path: 'copilot',         label: 'Copiloto IA',    icon: Bot },
]

export default function EntityHub() {
  const { id } = useParams()
  const [entity, setEntity] = useState(null)
  const [usage, setUsage] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getEntity(id).then(setEntity).catch(() => navigate('/'))
    api.getGeminiUsage().then(setUsage).catch(() => {})
  }, [id])

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-5 py-3.5 flex items-center gap-3 shadow-md shadow-blue-200/50 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all duration-150 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center ring-1 ring-white/30">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-white text-sm">{entity?.name || '...'}</span>
            {entity?.industry && (
              <span className="text-blue-200 text-xs ml-2 hidden sm:inline capitalize">{entity.industry}</span>
            )}
          </div>
        </div>

        {usage && (
          <div className="ml-auto flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
            <div className="w-12 bg-white/20 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-white h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round(usage.today_requests / usage.daily_limit * 100)}%` }}
              />
            </div>
            <span className="text-xs text-blue-100 font-medium">{usage.today_requests}/{usage.daily_limit}</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar nav ─────────────────────────────────── */}
        <nav className="w-52 bg-white/80 backdrop-blur-sm border-r border-slate-200/80 flex flex-col py-4 px-2 gap-0.5 flex-shrink-0 shadow-sm">
          {NAV.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/entities/${id}/${path}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 font-medium ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── Main content ────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="coverage"        element={<Coverage        entityId={id} entity={entity} />} />
            <Route path="documents"       element={<Documents       entityId={id} entity={entity} />} />
            <Route path="findings"        element={<Findings        entityId={id} entity={entity} />} />
            <Route path="inconsistencies" element={<Inconsistencies entityId={id} entity={entity} />} />
            <Route path="traceability"    element={<Traceability    entityId={id} entity={entity} />} />
            <Route path="report"          element={<Report          entityId={id} entity={entity} />} />
            <Route path="copilot"         element={<Copilot         entityId={id} entity={entity} />} />
            <Route path="*"               element={<Navigate to="coverage" />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
