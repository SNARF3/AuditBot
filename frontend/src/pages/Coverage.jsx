import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { RefreshCw, Zap, CheckCircle, AlertTriangle, XCircle, Minus, ChevronRight, X, FileText, Eye, Bot, Loader } from 'lucide-react'

const STATUS_CONFIG = {
  compliant: { label: 'Cumple', icon: CheckCircle, cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  partial: { label: 'Parcial', icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  gap: { label: 'Brecha', icon: XCircle, cls: 'text-red-600 bg-red-50 border-red-200' },
  no_data: { label: 'Sin datos', icon: Minus, cls: 'text-slate-400 bg-slate-50 border-slate-200' },
  not_scoped: { label: 'N/A', icon: Minus, cls: 'text-slate-300 bg-white border-slate-100' },
}

const DOMAIN_COLORS = { PO: 'blue', AI: 'violet', DS: 'emerald', ME: 'orange' }

function ProcessCell({ proc, onClick, selected }) {
  const cfg = STATUS_CONFIG[proc.status] || STATUS_CONFIG.no_data
  const Icon = cfg.icon
  return (
    <button
      onClick={() => onClick(proc)}
      className={`flex items-center gap-1.5 p-2 rounded-lg border text-left w-full transition-all ${cfg.cls} ${
        selected ? 'ring-2 ring-blue-400 ring-offset-1' : 'hover:shadow-sm'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono font-semibold leading-tight">{proc.process_id}</div>
        <div className="text-xs leading-tight truncate opacity-70">{proc.name.split(' ').slice(0,3).join(' ')}</div>
      </div>
      {proc.evidence_count > 0 && (
        <span className="text-xs opacity-60">{proc.evidence_count}</span>
      )}
    </button>
  )
}

function ProcessDetail({ proc, entityId, onClose }) {
  const [fragments, setFragments] = useState([])
  const [findings, setFindings] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState(proc.ai_analysis || null)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [drafting, setDrafting] = useState(null)
  const [draftNotice, setDraftNotice] = useState(null) // { id, type: 'ok'|'error', message }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAnalyzeResult(proc.ai_analysis || null)
    setAnalyzeError(null)
    Promise.all([
      api.getProcessFragments(entityId, proc.process_id),
      api.getProcessFindings(entityId, proc.process_id),
    ]).then(([f, fi]) => {
      setFragments(f.fragments || [])
      setFindings((fi || []).filter(f => f.process_id === proc.process_id))
    }).finally(() => setLoading(false))
  }, [proc.process_id, entityId])

  async function analyze() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const r = await api.analyzeProcess(entityId, proc.process_id)
      if (r.error) {
        setAnalyzeError(r.error)
      } else {
        setAnalyzeResult(r)
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function draftFinding(findingId) {
    setDrafting(findingId)
    setDraftNotice(null)
    try {
      const r = await api.draftFinding(entityId, findingId)
      if (r.error) {
        setDraftNotice({ id: findingId, type: 'error', message: r.error })
      } else {
        setDraftNotice({ id: findingId, type: 'ok', message: 'Observación redactada. Ve a Hallazgos para verla.' })
        setTimeout(() => setDraftNotice(null), 4000)
      }
    } finally {
      setDrafting(null)
    }
  }

  async function validateFinding(findingId, status) {
    await api.updateFinding(entityId, findingId, { status })
    const updated = await api.getProcessFindings(entityId, proc.process_id)
    setFindings((updated || []).filter(f => f.process_id === proc.process_id))
  }

  const cfg = STATUS_CONFIG[proc.status] || STATUS_CONFIG.no_data

  return (
    <div className="h-full overflow-auto p-5 border-l border-slate-200/80 bg-white/90 backdrop-blur-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-slate-400">{proc.process_id}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${cfg.cls}`}>
              {cfg.label}
            </span>
          </div>
          <h3 className="font-bold text-slate-800 text-sm leading-snug">{proc.name}</h3>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* AI Analysis result */}
      {analyzeResult && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 animate-fade-in">
          <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Análisis Gemini
          </p>
          {analyzeResult.gaps?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-blue-600 mb-1">Brechas:</p>
              <ul className="space-y-0.5">
                {analyzeResult.gaps.map((g, i) => (
                  <li key={i} className="text-xs text-blue-700 flex gap-1.5"><span className="text-blue-400 flex-shrink-0">•</span>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {analyzeResult.recommendations?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-1">Recomendaciones:</p>
              <ul className="space-y-0.5">
                {analyzeResult.recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-blue-600 flex gap-1.5"><span className="text-blue-300 flex-shrink-0">→</span>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {analyzeResult.key_evidence && (
            <p className="mt-2 text-xs text-blue-500 italic border-t border-blue-100 pt-2">{analyzeResult.key_evidence}</p>
          )}
        </div>
      )}

      {analyzeError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 animate-fade-in">
          <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Error en análisis
          </p>
          <p className="text-xs text-red-500 mt-1">{analyzeError}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      ) : (
        <>
          {/* Fragments */}
          {fragments.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">Fragmentos ({fragments.length})</p>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {fragments.map(f => (
                  <div key={f.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-400">{f.page_ref}</span>
                      {f.cobit_hint && <span className="text-xs font-mono text-blue-500">{f.cobit_hint}</span>}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{f.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          {findings.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">Hallazgos ({findings.length})</p>
              <div className="space-y-2">
                {findings.map(f => (
                  <div key={f.id} className="p-3 bg-white rounded-xl border border-slate-200">
                    <p className="text-xs font-semibold text-slate-700 leading-snug">{f.title}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-lg font-medium ${
                      f.status === 'validated' ? 'bg-emerald-50 text-emerald-700' :
                      f.status === 'discarded' ? 'bg-slate-100 text-slate-400 line-through' :
                      'bg-amber-50 text-amber-700'
                    }`}>{f.status}</span>

                    {draftNotice?.id === f.id && (
                      <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg animate-fade-in ${
                        draftNotice.type === 'ok'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-600 border border-red-200'
                      }`}>
                        {draftNotice.message}
                      </div>
                    )}

                    {f.status === 'preliminary' && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <button onClick={() => validateFinding(f.id, 'validated')} className="btn-success text-xs py-1 px-2">
                          <CheckCircle className="w-3 h-3" /> Validar
                        </button>
                        <button onClick={() => validateFinding(f.id, 'discarded')} className="btn-danger text-xs py-1 px-2">
                          <XCircle className="w-3 h-3" /> Descartar
                        </button>
                        <button onClick={() => draftFinding(f.id)} disabled={!!drafting} className="btn-secondary text-xs py-1 px-2">
                          {drafting === f.id ? <Loader className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-blue-500" />}
                          Redactar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Analyze button */}
      <div className="pt-3 border-t border-slate-100 mt-auto">
        <button
          onClick={analyze}
          disabled={analyzing}
          className="btn-secondary w-full text-xs py-2"
        >
          <Zap className="w-3.5 h-3.5 text-blue-500" />
          {analyzing ? 'Analizando con Gemini...' : 'Analizar con Gemini'}
        </button>
        <p className="text-xs text-slate-300 text-center mt-1.5">consume 1 request de cuota diaria</p>
      </div>
    </div>
  )
}

export default function Coverage({ entityId, entity }) {
  const [coverage, setCoverage] = useState([])
  const [loading, setLoading] = useState(true)
  const [recalcing, setRecalcing] = useState(false)
  const [selected, setSelected] = useState(null)

  function load() {
    api.getCoverage(entityId).then(r => setCoverage(r.coverage || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [entityId])

  async function recalc() {
    setRecalcing(true)
    await api.recalcCoverage(entityId)
    await load()
    setRecalcing(false)
  }

  const domains = ['PO', 'AI', 'DS', 'ME']
  const byDomain = domains.reduce((acc, d) => {
    acc[d] = coverage.filter(p => p.domain === d)
    return acc
  }, {})

  const stats = {
    compliant: coverage.filter(p => p.status === 'compliant').length,
    partial: coverage.filter(p => p.status === 'partial').length,
    gap: coverage.filter(p => p.status === 'gap').length,
    no_data: coverage.filter(p => p.status === 'no_data').length,
  }

  return (
    <div className="flex flex-1 h-full animate-fade-up overflow-hidden">
      <div className="flex-1 overflow-auto flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200/80 bg-white/60 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800">Cobertura COBIT 4.1</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">{entity?.name}</p>
          </div>
          <button onClick={recalc} disabled={recalcing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${recalcing ? 'animate-spin' : ''}`} />
            Recalcular
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">

        {!loading && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Cumple', count: stats.compliant, cls: 'badge-compliant' },
              { label: 'Parcial', count: stats.partial, cls: 'badge-partial' },
              { label: 'Brecha', count: stats.gap, cls: 'badge-gap' },
              { label: 'Sin datos', count: stats.no_data, cls: 'badge-nodata' },
            ].map(s => (
              <div key={s.label} className="card p-3 text-center">
                <div className="text-xl font-bold text-slate-800">{s.count}</div>
                <span className={s.cls}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-400">Cargando cobertura...</div>
        ) : (
          <div className="space-y-4">
            {domains.map(domain => {
              const procs = byDomain[domain] || []
              const scoped = procs.filter(p => p.status !== 'not_scoped')
              if (scoped.length === 0) return null
              return (
                <div key={domain} className="card p-4">
                  <h3 className={`text-sm font-semibold mb-3 text-${DOMAIN_COLORS[domain]}-600`}>
                    {domain} — {
                      { PO: 'Planear y Organizar', AI: 'Adquirir e Implementar', DS: 'Entregar y Dar Soporte', ME: 'Monitorear y Evaluar' }[domain]
                    }
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                    {scoped.map(proc => (
                      <ProcessCell
                        key={proc.process_id}
                        proc={proc}
                        onClick={setSelected}
                        selected={selected?.process_id === proc.process_id}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-4 mt-4 flex-wrap">
          {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'not_scoped').map(([k, v]) => {
            const Icon = v.icon
            return (
              <div key={k} className="flex items-center gap-1.5 text-xs">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-slate-500">{v.label}</span>
              </div>
            )
          })}
        </div>
        </div>
      </div>

      {selected && (
        <div className="w-96 flex-shrink-0 animate-slide-right overflow-auto">
          <ProcessDetail
            proc={selected}
            entityId={entityId}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  )
}
