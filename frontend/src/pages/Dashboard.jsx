import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Plus, Settings, Building2, ChevronRight, AlertTriangle, CheckCircle, Zap, Landmark, Activity, Building, Monitor } from 'lucide-react'

const INDUSTRY_META = {
  banca:      { icon: Landmark,  label: 'Banca',       gradient: 'from-blue-500 to-blue-600' },
  salud:      { icon: Activity,  label: 'Salud',       gradient: 'from-rose-500 to-rose-600' },
  gobierno:   { icon: Building,  label: 'Gobierno',    gradient: 'from-amber-500 to-orange-500' },
  tecnologia: { icon: Monitor,   label: 'Tecnología',  gradient: 'from-violet-500 to-violet-600' },
  otro:       { icon: Building2, label: 'Otro',        gradient: 'from-slate-500 to-slate-600' },
}

function CoverageBar({ pct, domain }) {
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-5 font-mono">{domain}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right font-semibold">{pct}%</span>
    </div>
  )
}

export default function Dashboard() {
  const [entities, setEntities] = useState([])
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.listEntities(), api.getGeminiUsage()])
      .then(([ents, use]) => { setEntities(ents); setUsage(use) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const usedPct = usage ? Math.round(usage.today_requests / usage.daily_limit * 100) : 0

  return (
    <div className="min-h-screen">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-6 py-4 shadow-lg shadow-blue-200/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center ring-1 ring-white/30">
              <Zap className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
            </div>
            <div>
              <span className="font-extrabold text-white text-base tracking-tight">AuditBot v2</span>
              <span className="text-blue-200 text-xs ml-2 hidden sm:inline">COBIT 4.1</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {usage && (
              <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
                <div className="w-16 bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${usedPct > 80 ? 'bg-red-300' : 'bg-white'}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <span className="text-xs text-blue-100 whitespace-nowrap font-medium">
                  {usage.today_requests}/{usage.daily_limit}
                </span>
              </div>
            )}
            <Link
              to="/entities/new"
              className="flex items-center gap-1.5 bg-white text-blue-600 font-bold px-4 py-2 rounded-xl text-sm hover:bg-blue-50 active:scale-[0.97] transition-all duration-150 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nueva entidad
            </Link>
            <button
              onClick={() => navigate('/setup')}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all duration-150"
              title="Configuración"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-slate-800">Auditorías activas</h2>
          {!loading && entities.length > 0 && (
            <span className="text-sm text-slate-400 font-medium">{entities.length} entidad{entities.length !== 1 ? 'es' : ''}</span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-100 rounded-lg w-3/4 mb-1.5" />
                    <div className="h-3 bg-slate-100 rounded-lg w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  {[1, 2].map(j => <div key={j} className="h-2.5 bg-slate-100 rounded-full" />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
            {entities.map(entity => {
              const meta = INDUSTRY_META[entity.industry] || INDUSTRY_META.otro
              const Icon = meta.icon
              return (
                <Link
                  key={entity.id}
                  to={`/entities/${entity.id}/coverage`}
                  className="card p-5 transition-all duration-200 hover:shadow-xl hover:-translate-y-1 block group"
                >
                  {/* Colored top accent */}
                  <div className={`h-1 bg-gradient-to-r ${meta.gradient} -mx-5 -mt-5 mb-5 rounded-t-2xl`} />

                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-blue-600 transition-colors">{entity.name}</h3>
                        <p className="text-xs text-slate-400 capitalize mt-0.5">{meta.label}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors mt-1 flex-shrink-0" />
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {Object.entries(entity.coverage_pct || {}).map(([domain, pct]) => (
                      <CoverageBar key={domain} domain={domain} pct={pct} />
                    ))}
                    {Object.keys(entity.coverage_pct || {}).length === 0 && (
                      <p className="text-xs text-slate-300 italic">Sin documentos aún</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                      <Building2 className="w-3.5 h-3.5" />
                      {entity.doc_count} doc{entity.doc_count !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {entity.finding_count} hallazgo{entity.finding_count !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {entity.validated_count} validado{entity.validated_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </Link>
              )
            })}

            <Link
              to="/entities/new"
              className="card p-5 border-dashed border-2 border-slate-200 flex flex-col items-center justify-center text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200 min-h-[200px] group"
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                <Plus className="w-6 h-6 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <span className="text-sm font-bold text-slate-400 group-hover:text-blue-600 transition-colors">Nueva entidad</span>
              <span className="text-xs text-slate-300 mt-1">Iniciar nueva auditoría</span>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
