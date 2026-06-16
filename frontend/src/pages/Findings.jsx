import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../api/client'
import {
  Plus, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Loader, Bot, Download, FileSpreadsheet, Trash2,
} from 'lucide-react'

// ── Risk helpers ────────────────────────────────────────────
function riskScore(p, i) { return p && i ? p * i : null }

function riskLevel(score) {
  if (!score) return null
  if (score <= 2)  return { text: 'Muy Bajo', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  if (score <= 4)  return { text: 'Bajo',     cls: 'bg-green-100 text-green-700 border-green-200' }
  if (score <= 9)  return { text: 'Medio',    cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
  if (score < 20)  return { text: 'Alto',     cls: 'bg-orange-100 text-orange-700 border-orange-200' }
  return                   { text: 'Extremo', cls: 'bg-red-100 text-red-700 border-red-200' }
}

const SEV_DOT = {
  critica: 'bg-red-500',
  alta:    'bg-orange-400',
  media:   'bg-blue-500',
  baja:    'bg-slate-400',
}

const STATUS_PILL = {
  preliminary: 'bg-amber-50 text-amber-700 border-amber-200',
  validated:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  discarded:   'bg-slate-100 text-slate-400 border-slate-200',
  included:    'bg-blue-50 text-blue-700 border-blue-200',
}

const STATUS_LABEL = {
  preliminary: 'Preliminar',
  validated:   'Validado',
  discarded:   'Descartado',
  included:    'En reporte',
}

// ── Excel export ─────────────────────────────────────────────
function exportToExcel(findings, entityName) {
  const rows = findings
    .filter(f => f.status !== 'discarded')
    .map((f, i) => {
      const obs   = f.formal_observation
      const p     = f.probability ?? ''
      const imp   = f.impact ?? ''
      const score = p !== '' && imp !== '' ? p * imp : ''
      const level = score !== '' ? (riskLevel(score)?.text ?? '') : ''
      return {
        'No.':            i + 1,
        'HALLAZGO':       obs?.condicion || f.description || f.title || '',
        'CRITERIO':       obs?.criterio  || '',
        'CAUSA / EFECTO': [
          obs?.causa  ? `Causa: ${obs.causa}` : '',
          obs?.efecto ? `Efecto: ${obs.efecto}` : '',
        ].filter(Boolean).join('\n'),
        'CONCLUSIÓN':     obs?.condicion || f.description || '',
        'P':              p,
        'I':              imp,
        'RIESGO':         score,
        'NIVEL RIESGO':   level,
        'RECOMENDACIÓN':  obs?.recomendacion || '',
        'RESPUESTA':      '',
        'OBSERVACIONES':  f.auditor_notes || '',
        'PLAN DE ACCION': '',
      }
    })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 5  }, { wch: 55 }, { wch: 45 }, { wch: 55 },
    { wch: 45 }, { wch: 5  }, { wch: 5  }, { wch: 8  },
    { wch: 12 }, { wch: 45 }, { wch: 20 }, { wch: 30 }, { wch: 30 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hallazgos')
  XLSX.writeFile(wb, `hallazgos_${entityName || 'auditoria'}_${new Date().toISOString().slice(0,10)}.xlsx`)
}

// ── P/I selector ─────────────────────────────────────────────
function PICell({ label, value, onChange }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-10 h-8 text-center text-sm font-bold border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 cursor-pointer appearance-none"
      >
        <option value="">—</option>
        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )
}

// ── Finding card ─────────────────────────────────────────────
function FindingCard({ finding, entityId, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes]       = useState(finding.auditor_notes || '')
  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [p, setP]               = useState(finding.probability ?? null)
  const [imp, setImp]           = useState(finding.impact      ?? null)

  const score = riskScore(p, imp)
  const level = riskLevel(score)
  const obs   = finding.formal_observation

  async function changeStatus(status) {
    await api.updateFinding(entityId, finding.id, { status })
    onUpdate()
  }

  async function savePI(newP, newI) {
    await api.updateFinding(entityId, finding.id, { probability: newP, impact: newI })
    onUpdate()
  }

  async function handleP(val) {
    setP(val)
    await savePI(val, imp)
  }

  async function handleI(val) {
    setImp(val)
    await savePI(p, val)
  }

  async function saveNotes() {
    await api.updateFinding(entityId, finding.id, { auditor_notes: notes })
    onUpdate()
  }

  async function draftObs() {
    setDrafting(true)
    setDraftErr(null)
    try {
      const r = await api.draftFinding(entityId, finding.id)
      if (r.error) setDraftErr(r.error)
      else onUpdate()
    } finally {
      setDrafting(false)
    }
  }

  async function deleteFinding() {
    if (!confirm('¿Eliminar este hallazgo permanentemente?')) return
    setDeleting(true)
    try {
      await api.deleteFinding(entityId, finding.id)
      onUpdate()
    } finally {
      setDeleting(false)
    }
  }

  if (finding.status === 'discarded') return null

  return (
    <div className="card transition-all duration-200 hover:shadow-md overflow-hidden">
      {/* ── Header row ── */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* severity dot */}
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${SEV_DOT[finding.severity] || SEV_DOT.baja}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg">
                  {finding.process_id}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-lg border font-semibold ${STATUS_PILL[finding.status] || ''}`}>
                  {STATUS_LABEL[finding.status] || finding.status}
                </span>
                <span className="text-xs text-slate-400 capitalize">{finding.origin}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={deleteFinding}
                  disabled={deleting}
                  className="p-1 text-slate-300 hover:text-red-400 transition-colors rounded"
                  title="Eliminar"
                >
                  {deleting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="p-1 text-slate-300 hover:text-slate-600 transition-colors rounded"
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-sm font-bold text-slate-800 leading-snug">{finding.title}</p>
            {finding.description && !obs && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{finding.description}</p>
            )}
            {obs?.condicion && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{obs.condicion}</p>
            )}

            {/* ── Risk matrix row ── */}
            <div className="flex items-center gap-3 mt-3">
              <PICell label="P" value={p} onChange={handleP} />
              <span className="text-slate-300 text-lg font-light">×</span>
              <PICell label="I" value={imp} onChange={handleI} />
              {score !== null && (
                <>
                  <span className="text-slate-300 text-lg font-light">=</span>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Riesgo</span>
                    <span className="w-10 h-8 flex items-center justify-center text-sm font-extrabold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
                      {score}
                    </span>
                  </div>
                  <div className={`px-2.5 py-1 rounded-xl border text-xs font-bold ${level?.cls}`}>
                    {level?.text}
                  </div>
                </>
              )}

              {/* action buttons */}
              <div className="flex gap-1.5 ml-auto flex-wrap justify-end">
                {finding.status === 'preliminary' && (
                  <>
                    <button onClick={() => changeStatus('validated')} className="btn-success text-xs py-1 px-2">
                      <CheckCircle className="w-3 h-3" /> Validar
                    </button>
                    <button onClick={() => changeStatus('discarded')} className="btn-danger text-xs py-1 px-2">
                      <XCircle className="w-3 h-3" /> Descartar
                    </button>
                  </>
                )}
                {finding.status === 'validated' && (
                  <button onClick={() => changeStatus('included')} className="btn-primary text-xs py-1 px-2.5">
                    Incluir en reporte
                  </button>
                )}
                {finding.status !== 'discarded' && !obs && (
                  <button onClick={draftObs} disabled={drafting} className="btn-secondary text-xs py-1 px-2">
                    {drafting ? <Loader className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-blue-500" />}
                    Redactar con Gemini
                  </button>
                )}
              </div>
            </div>

            {draftErr && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-fade-in">
                {draftErr}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Expanded: formal observation + notes ── */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4 animate-fade-in">
          {obs ? (
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-4 space-y-2.5">
              <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> Observación formal (Gemini)
              </p>
              {obs.titulo && (
                <p className="text-sm font-bold text-slate-800">{obs.titulo}</p>
              )}
              {[
                ['Condición',    'condicion'],
                ['Criterio',     'criterio'],
                ['Causa',        'causa'],
                ['Efecto',       'efecto'],
                ['Recomendación','recomendacion'],
              ].map(([label, key]) =>
                obs[key] ? (
                  <div key={key} className="flex gap-2">
                    <span className="text-xs font-bold text-blue-500 w-24 flex-shrink-0">{label}:</span>
                    <span className="text-xs text-slate-700 leading-relaxed">{obs[key]}</span>
                  </div>
                ) : null
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center">
              <Bot className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Sin observación formal generada.</p>
              <button onClick={draftObs} disabled={drafting} className="btn-secondary text-xs py-1.5 px-3 mt-2">
                {drafting ? <Loader className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-blue-500" />}
                Redactar con Gemini
              </button>
            </div>
          )}

          <div>
            <label className="label text-xs">Notas del auditor</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="input text-xs resize-none"
              placeholder="Observaciones, contexto adicional..."
            />
            <button onClick={saveNotes} className="btn-secondary text-xs py-1.5 px-3 mt-1.5">
              Guardar notas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── New finding modal ─────────────────────────────────────────
function NewFindingModal({ entityId, onClose, onSuccess }) {
  const [form, setForm] = useState({
    process_id: 'DS5', title: '', description: '', severity: 'media',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const PROCESSES = [
    'PO1','PO2','PO3','PO4','PO5','PO6','PO7','PO8','PO9','PO10',
    'AI1','AI2','AI3','AI4','AI5','AI6','AI7',
    'DS1','DS2','DS3','DS4','DS5','DS6','DS7','DS8','DS9','DS10','DS11','DS12','DS13',
    'ME1','ME2','ME3','ME4',
  ]

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createFinding(entityId, form)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message || 'Error al crear el hallazgo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 animate-fade-up shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-extrabold text-slate-800 text-lg">Nuevo hallazgo manual</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proceso COBIT</label>
              <select
                value={form.process_id}
                onChange={e => setForm(f => ({ ...f, process_id: e.target.value }))}
                className="input"
              >
                {PROCESSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Severidad</label>
              <select
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="input"
              >
                <option value="critica">Crítica</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Título *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input"
              placeholder="Descripción breve del hallazgo"
              required
            />
          </div>
          <div>
            <label className="label">Descripción / Evidencia</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="input resize-none"
              placeholder="Detalle lo encontrado, evidencia documental..."
            />
          </div>

          {error && (
            <p className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-fade-in">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary">
              {saving ? <><Loader className="w-4 h-4 animate-spin" /> Creando...</> : 'Crear hallazgo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function Findings({ entityId, entity }) {
  const [findings, setFindings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState({ status: 'all', severity: 'all' })
  const [showNew, setShowNew]   = useState(false)

  function load() {
    api.listFindings(entityId).then(setFindings).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [entityId])

  const active = findings.filter(f => f.status !== 'discarded')

  const filtered = active.filter(f => {
    if (filter.status   !== 'all' && f.status   !== filter.status)   return false
    if (filter.severity !== 'all' && f.severity !== filter.severity) return false
    return true
  })

  const stats = {
    total:       active.length,
    preliminary: active.filter(f => f.status === 'preliminary').length,
    validated:   active.filter(f => f.status === 'validated').length,
    included:    active.filter(f => f.status === 'included').length,
  }

  return (
    <div className="animate-fade-up">
      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-200/80 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800">Hallazgos</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              {stats.total} activos · {stats.preliminary} preliminares · {stats.validated} validados · {stats.included} en reporte
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(filtered, entity?.name)}
              disabled={filtered.length === 0}
              className="btn-secondary text-xs py-2 px-3"
              title="Exportar a Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Exportar Excel
            </button>
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Nuevo hallazgo
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <select
            value={filter.status}
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className="input w-auto text-xs py-1.5"
          >
            <option value="all">Todos los estados</option>
            <option value="preliminary">Preliminar</option>
            <option value="validated">Validado</option>
            <option value="included">En reporte</option>
          </select>
          <select
            value={filter.severity}
            onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}
            className="input w-auto text-xs py-1.5"
          >
            <option value="all">Cualquier severidad</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
          {filtered.length !== active.length && (
            <span className="text-xs text-slate-400 self-center">
              {filtered.length} de {active.length} hallazgos
            </span>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse h-24" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-14 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">
              {active.length === 0 ? 'No hay hallazgos todavía' : 'Sin hallazgos con este filtro'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {active.length === 0 && 'Analiza la cobertura COBIT o crea uno manualmente.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(f => (
              <FindingCard key={f.id} finding={f} entityId={entityId} onUpdate={load} />
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewFindingModal
          entityId={entityId}
          onClose={() => setShowNew(false)}
          onSuccess={load}
        />
      )}
    </div>
  )
}
