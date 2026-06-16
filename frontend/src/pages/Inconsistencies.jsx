import { useEffect, useState, useRef } from 'react'
import { api, createWebSocket } from '../api/client'
import {
  ScanSearch, AlertTriangle, Calendar, Clock, User, DollarSign,
  HelpCircle, CheckCircle, XCircle, ArrowUpRight, Loader, Hash, FileText,
  Settings, Sparkles, AlertCircle, Trash2, Cpu,
} from 'lucide-react'

const TYPE_META = {
  date:                  { label: 'Fecha',        icon: Calendar,   color: 'text-red-600 bg-red-50 border-red-200' },
  deadline:              { label: 'Plazo',         icon: Clock,      color: 'text-orange-600 bg-orange-50 border-orange-200' },
  responsible:           { label: 'Responsable',   icon: User,       color: 'text-purple-600 bg-purple-50 border-purple-200' },
  figure:                { label: 'Cifra',         icon: DollarSign, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  reference:             { label: 'Referencia',    icon: Hash,       color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  count:                 { label: 'Conteo',        icon: Hash,       color: 'text-teal-600 bg-teal-50 border-teal-200' },
  procedure:             { label: 'Procedimiento', icon: Settings,   color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  ambiguous:             { label: 'Ambigua',       icon: HelpCircle, color: 'text-slate-600 bg-slate-50 border-slate-200' },
}

const SCOPE_META = {
  intra: { label: 'Intra-doc', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  inter: { label: 'Inter-doc', color: 'text-blue-700 bg-blue-50 border-blue-200' },
}

const SEV_COLORS = {
  alta:  'bg-red-100 text-red-700 border-red-200',
  media: 'bg-amber-100 text-amber-700 border-amber-200',
  baja:  'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_META = {
  detected:  { label: 'Detectada',  color: 'text-slate-500' },
  analyzed:  { label: 'Analizada',  color: 'text-blue-600' },
  promoted:  { label: 'Promovida',  color: 'text-emerald-600' },
  dismissed: { label: 'Descartada', color: 'text-slate-300' },
}

function ScopeBadge({ scope }) {
  const meta = SCOPE_META[scope] || SCOPE_META.inter
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}>
      <FileText className="w-3 h-3" /> {meta.label}
    </span>
  )
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || TYPE_META.ambiguous
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  )
}

function SeverityBadge({ severity }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${SEV_COLORS[severity] || SEV_COLORS.baja}`}>
      {severity?.toUpperCase()}
    </span>
  )
}

function InconsistencyCard({ inc, entityId, onRefresh }) {
  const [promoting, setPromoting] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (inc.status === 'dismissed') return null

  async function promote() {
    setPromoting(true)
    try {
      await api.promoteInconsistency(entityId, inc.id)
      onRefresh()
    } finally { setPromoting(false) }
  }

  async function dismiss() {
    setDismissing(true)
    try {
      await api.dismissInconsistency(entityId, inc.id)
      onRefresh()
    } finally { setDismissing(false) }
  }

  async function deleteInc() {
    if (!confirm('¿Eliminar esta inconsistencia permanentemente?')) return
    setDeleting(true)
    try {
      await api.deleteInconsistency(entityId, inc.id)
      onRefresh()
    } finally { setDeleting(false) }
  }

  const statusMeta = STATUS_META[inc.status] || STATUS_META.detected

  return (
    <div className="card p-4 transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ScopeBadge scope={inc.scope} />
          <TypeBadge type={inc.inc_type} />
          <SeverityBadge severity={inc.severity} />
          <span className={`text-xs font-medium ${statusMeta.color}`}>{statusMeta.label}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={dismiss} disabled={dismissing}
            className="text-slate-300 hover:text-amber-400 transition-colors" title="Descartar">
            <XCircle className="w-4 h-4" />
          </button>
          <button onClick={deleteInc} disabled={deleting}
            className="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar permanentemente">
            {deleting ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Gemini description */}
      {inc.gemini_description && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-blue-700">
            <Sparkles className="w-3.5 h-3.5" /> Gemini:
          </div>
          <p className="text-xs text-blue-900 leading-relaxed">{inc.gemini_description}</p>
        </div>
      )}

      {/* Ollama description */}
      {inc.formal_description && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-slate-600">
            <Cpu className="w-3.5 h-3.5" /> Ollama:
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{inc.formal_description}</p>
        </div>
      )}

      {/* Fallback: plain description when no gemini_description */}
      {!inc.gemini_description && (
        <p className="text-sm font-medium text-slate-800 mb-3">{inc.description}</p>
      )}

      {/* Ollama error notice */}
      {inc.gemini_description && !inc.formal_description && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
          Modelo local no disponible — verificar Ollama en localhost:11434
        </div>
      )}

      {/* Fragment panels */}
      {inc.fragment_a_text === inc.fragment_b_text ? (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-3">
          <p className="text-xs font-semibold text-slate-500 mb-1">Fragmento</p>
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{inc.fragment_a_text}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-1 truncate">
              {inc.scope === 'intra' ? 'Fragmento A' : inc.doc_a_name}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{inc.fragment_a_text}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-1 truncate">
              {inc.scope === 'intra' ? 'Fragmento B' : inc.doc_b_name}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{inc.fragment_b_text}</p>
          </div>
        </div>
      )}

      {/* Legacy gemini_analysis (from old "Verificar con Gemini" flow) */}
      {inc.gemini_analysis && !inc.gemini_description && (
        <div className={`rounded-lg p-3 mb-3 text-xs border ${
          inc.gemini_analysis.contradiction
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-1.5 mb-1 font-semibold">
            {inc.gemini_analysis.contradiction
              ? <AlertTriangle className="w-3.5 h-3.5" />
              : <CheckCircle className="w-3.5 h-3.5" />}
            Gemini: {inc.gemini_analysis.contradiction ? 'Contradicción confirmada' : 'Sin contradicción real'}
          </div>
          <p className="leading-relaxed">{inc.gemini_analysis.explanation}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {inc.status !== 'promoted' && (
          <button onClick={promote} disabled={promoting}
            className="btn-secondary text-xs flex items-center gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50">
            {promoting ? <Loader className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
            Promover a hallazgo
          </button>
        )}
        {inc.status === 'promoted' && inc.finding_id && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Hallazgo #{inc.finding_id} creado
          </span>
        )}
      </div>
    </div>
  )
}

function DocStatusIcon({ status }) {
  if (status === 'ready') return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
  if (status === 'processing') return <Clock className="w-3.5 h-3.5 text-amber-500 animate-spin" />
  if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
  return <Clock className="w-3.5 h-3.5 text-slate-400" />
}

export default function Inconsistencies({ entityId, entity }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [filter, setFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [docs, setDocs] = useState([])
  // { [docId]: { step, message } | null }
  const [docProgress, setDocProgress] = useState({})
  // { [docId]: { found } }
  const [docResults, setDocResults] = useState({})
  const wsRef = useRef(null)

  function load() {
    api.listInconsistencies(entityId).then(setItems).finally(() => setLoading(false))
  }

  function loadDocs() {
    api.listDocuments(entityId).then(setDocs)
  }

  useEffect(() => {
    load()
    loadDocs()

    const ws = createWebSocket(entityId)
    wsRef.current = ws
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'inc_step') {
        setDocProgress(p => ({ ...p, [msg.doc_id]: { step: msg.step, message: msg.message } }))
      }
    }
    return () => ws.close()
  }, [entityId])

  async function handleDocAnalyze(docId) {
    setDocProgress(p => ({ ...p, [docId]: { step: 1, message: 'Iniciando...' } }))
    try {
      const r = await api.analyzeDocumentInconsistencies(entityId, docId)
      setDocResults(prev => ({ ...prev, [docId]: { found: r.found } }))
      load()
    } finally {
      setDocProgress(p => ({ ...p, [docId]: null }))
    }
  }

  async function handleScan(method) {
    setScanning(method)
    setScanResult(null)
    try {
      const r = await api.scanInconsistencies(entityId, method)
      setScanResult(r)
      load()
    } finally {
      setScanning(null) }
  }

  const active = items.filter(i => i.status !== 'dismissed')
  const scopeFiltered = scopeFilter === 'all' ? active : active.filter(i => i.scope === scopeFilter)
  const filtered = filter === 'all' ? scopeFiltered : scopeFiltered.filter(i => i.inc_type === filter)

  const intraCount = active.filter(i => i.scope === 'intra').length
  const interCount = active.filter(i => i.scope === 'inter').length

  const counts = scopeFiltered.reduce((acc, i) => {
    acc[i.inc_type] = (acc[i.inc_type] || 0) + 1
    return acc
  }, {})

  return (
    <div className="animate-fade-up">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200/80 bg-white/60 backdrop-blur-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800">Inconsistencias</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">{entity?.name}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleScan('engine')} disabled={!!scanning}
              title="Motor determinístico — sin IA, sin quota"
              className="btn-secondary">
              {scanning === 'engine' ? <Loader className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
              {scanning === 'engine' ? 'Escaneando...' : 'Motor inter-doc'}
            </button>
            <button onClick={() => handleScan('gemini')} disabled={!!scanning}
              title="Análisis profundo con Gemini — usa quota diaria"
              className="btn-primary">
              {scanning === 'gemini' ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {scanning === 'gemini' ? 'Analizando...' : 'Gemini inter-doc'}
            </button>
          </div>
        </div>
      </div>
      <div className="p-6">

      {scanResult && (
        <div className="card p-4 mb-5 bg-blue-50 border-blue-200">
          <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
            {scanResult.method === 'gemini' ? <Sparkles className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
            {scanResult.method === 'gemini' ? 'Gemini' : 'Motor'} — {scanResult.found} inconsistencia{scanResult.found !== 1 ? 's' : ''} inter-doc detectada{scanResult.found !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(scanResult.by_type).filter(([, v]) => v > 0).map(([type, count]) => (
              <span key={type} className="text-xs text-blue-700">
                {TYPE_META[type]?.label || type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="flex gap-2 mb-2 flex-wrap">
            {[
              { key: 'all', label: `Todos (${active.length})` },
              { key: 'intra', label: `Intra-doc (${intraCount})` },
              { key: 'inter', label: `Inter-doc (${interCount})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => { setScopeFilter(key); setFilter('all') }}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  scopeFilter === key ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {Object.keys(counts).length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  filter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}>
                Todos tipos
              </button>
              {Object.entries(counts).map(([type, count]) => (
                <button key={type} onClick={() => setFilter(type)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    filter === type ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  {TYPE_META[type]?.label || type} ({count})
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="card p-4 animate-pulse h-32" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <ScanSearch className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {active.length === 0
              ? 'Analiza un documento para detectar inconsistencias.'
              : 'No hay inconsistencias de este tipo.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => (
            <InconsistencyCard key={inc.id} inc={inc} entityId={entityId} onRefresh={load} />
          ))}
        </div>
      )}

      {/* Per-document analysis */}
      {docs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Análisis intra-documento</h3>
          <div className="space-y-2">
            {docs.map(doc => {
              const progress = docProgress[doc.id]
              const result = docResults[doc.id]
              const isAnalyzing = !!progress

              return (
                <div key={doc.id} className="card p-3">
                  <div className="flex items-center gap-3">
                    <DocStatusIcon status={doc.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{doc.original_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded capitalize">{doc.doc_type}</span>
                        {result !== undefined && !isAnalyzing && (
                          <span className={`text-xs ${result.found > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                            {result.found === 0
                              ? 'Sin inconsistencias internas'
                              : `${result.found} inconsistencia${result.found !== 1 ? 's' : ''} detectada${result.found !== 1 ? 's' : ''}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.status === 'ready' && (
                      <button
                        onClick={() => handleDocAnalyze(doc.id)}
                        disabled={isAnalyzing}
                        className="flex items-center gap-1.5 text-xs border border-purple-200 rounded px-2.5 py-1.5 text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-60 flex-shrink-0"
                      >
                        {isAnalyzing
                          ? <Loader className="w-3 h-3 animate-spin" />
                          : <ScanSearch className="w-3 h-3" />}
                        Analizar inconsistencias
                      </button>
                    )}
                  </div>

                  {/* WebSocket progress bar */}
                  {isAnalyzing && progress && (
                    <div className="mt-2 pl-6">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader className="w-3 h-3 animate-spin text-purple-500" />
                        <span>
                          [{progress.step}/3] {progress.message}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.round((progress.step / 3) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-1">
        <p className="text-xs text-amber-700">
          <strong>Intra-doc:</strong> Gemini analiza cada documento en busca de plazos contradictorios,
          conteos inconsistentes, referencias inexistentes y procedimientos contradictorios.
          Ollama personaliza los textos con el nombre de la entidad.
        </p>
        <p className="text-xs text-amber-700">
          <strong>Inter-doc:</strong> compara fragmentos entre documentos distintos usando el motor determinístico o Gemini.
        </p>
      </div>
      </div>
    </div>
  )
}
