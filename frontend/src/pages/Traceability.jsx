import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Link2, AlertTriangle, Loader, GitCompare, Bot } from 'lucide-react'

const SEV_COLORS = {
  critica: 'bg-red-50 border-red-200 text-red-800',
  alta: 'bg-orange-50 border-orange-200 text-orange-800',
  media: 'bg-amber-50 border-amber-200 text-amber-700',
  baja: 'bg-slate-50 border-slate-200 text-slate-600',
}

const STATUS_DOTS = {
  compliant: 'bg-emerald-400',
  partial: 'bg-amber-400',
  gap: 'bg-red-400',
  no_data: 'bg-slate-300',
  not_scoped: 'bg-slate-100',
}

export default function Traceability({ entityId, entity }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [prioritizing, setPrioritizing] = useState(false)
  const [prioritized, setPrioritized] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getTraceability(entityId).then(setData).finally(() => setLoading(false))
  }, [entityId])

  async function prioritize() {
    setPrioritizing(true)
    try {
      const r = await api.prioritizeGaps(entityId)
      setPrioritized(r.prioritized || [])
    } finally {
      setPrioritizing(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-400">Calculando cadenas de riesgo...</div>

  const { risk_chains = [], doc_process_matrix = {}, coverage_summary = {}, inconsistencies_summary } = data || {}

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Trazabilidad y Cadenas de Riesgo</h2>
        <p className="text-sm text-slate-500">{entity?.name}</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title mb-0">Cadenas de riesgo detectadas ({risk_chains.length})</h3>
          <button
            onClick={prioritize}
            disabled={prioritizing}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            {prioritizing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5 text-blue-500" />}
            Priorizar con Gemini
          </button>
        </div>

        {risk_chains.length === 0 ? (
          <div className="card p-6 text-center">
            <Link2 className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No se detectaron cadenas de riesgo activas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {risk_chains.map((chain, i) => (
              <div key={i} className={`card p-4 border ${SEV_COLORS[chain.severity] || SEV_COLORS.baja}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {chain.path.map((pid, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <span className="text-xs font-mono font-bold">{pid}</span>
                        <span className={`w-2 h-2 rounded-full inline-block ${STATUS_DOTS[chain.processes_coverage?.[pid]] || STATUS_DOTS.no_data}`} />
                        {j < chain.path.length - 1 && <span className="text-xs opacity-50">→</span>}
                      </span>
                    ))}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SEV_COLORS[chain.severity]}`}>
                    {chain.severity?.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{chain.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {prioritized && (
        <div className="card p-4">
          <h3 className="section-title">Priorización IA</h3>
          <div className="space-y-1.5">
            {prioritized.map(p => (
              <div key={p.process_id} className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-400 w-5">#{p.rank}</span>
                <span className="text-sm font-mono font-bold text-blue-600 w-10">{p.process_id}</span>
                <span className="text-sm text-slate-600">{p.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inconsistencies_summary && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title mb-0 flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-slate-400" />
              Inconsistencias documentales ({inconsistencies_summary.total})
            </h3>
            <button
              onClick={() => navigate(`/entities/${entityId}/inconsistencies`)}
              className="btn-secondary text-xs"
            >
              Ver detalle →
            </button>
          </div>
          {inconsistencies_summary.total === 0 ? (
            <p className="text-sm text-slate-400">No se han detectado inconsistencias entre documentos.</p>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {Object.entries(inconsistencies_summary.by_type).map(([type, count]) => (
                <span key={type} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                  {type}: {count}
                </span>
              ))}
              {inconsistencies_summary.promoted > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                  {inconsistencies_summary.promoted} promovida{inconsistencies_summary.promoted !== 1 ? 's' : ''} a hallazgo
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {Object.keys(doc_process_matrix).length > 0 && (
        <div className="card p-4">
          <h3 className="section-title">Matriz: Documento → Proceso COBIT</h3>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left text-slate-500 font-medium pb-2 pr-4">Documento</th>
                  <th className="text-left text-slate-500 font-medium pb-2">Procesos COBIT cubiertos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(doc_process_matrix).map(([docName, processes]) => (
                  <tr key={docName}>
                    <td className="py-2 pr-4 text-slate-600 max-w-48 truncate font-medium">{docName}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {processes.length > 0 ? processes.map(pid => (
                          <span key={pid} className={`font-mono px-1.5 py-0.5 rounded text-xs border ${
                            coverage_summary[pid] === 'gap' ? 'bg-red-50 border-red-200 text-red-700' :
                            coverage_summary[pid] === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            coverage_summary[pid] === 'compliant' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                            'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>{pid}</span>
                        )) : <span className="text-slate-300">Sin clasificar</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
