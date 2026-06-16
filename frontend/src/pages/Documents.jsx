import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, createWebSocket } from '../api/client'
import { Upload, Trash2, FileText, CheckCircle, Clock, AlertCircle, X, Tag, Loader, Settings, Sparkles, RefreshCw } from 'lucide-react'

const DOC_TYPES = [
  { value: 'normativo', label: 'Normativo', desc: 'Política, manual, norma' },
  { value: 'operativo', label: 'Operativo', desc: 'Log, registro, acta' },
  { value: 'estrategico', label: 'Estratégico', desc: 'PETI, plan, presupuesto' },
  { value: 'contractual', label: 'Contractual', desc: 'Contrato, SLA' },
]

function StatusIcon({ status }) {
  if (status === 'ready') return <CheckCircle className="w-4 h-4 text-emerald-500" />
  if (status === 'processing') return <Clock className="w-4 h-4 text-amber-500 animate-spin" />
  if (status === 'error') return <AlertCircle className="w-4 h-4 text-red-500" />
  return <Clock className="w-4 h-4 text-slate-400" />
}

function UploadModal({ entityId, onClose, onSuccess }) {
  const [files, setFiles] = useState([])
  const [docType, setDocType] = useState('normativo')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const fileRef = useRef()

  function handleFileChange(e) {
    setFiles(Array.from(e.target.files))
  }

  function handleDrop(e) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      /\.(pdf|docx?|txt|md|xlsx)$/i.test(f.name)
    )
    if (dropped.length) setFiles(prev => [...prev, ...dropped])
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    let done = 0
    for (const file of files) {
      setUploadProgress(`${file.name} (${done + 1}/${files.length})`)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('doc_type', docType)
        await api.uploadDocument(entityId, fd)
      } catch (err) {
        console.error('Error subiendo', file.name, err.message)
      }
      done++
    }
    setUploading(false)
    onSuccess()
    onClose()
  }

  const totalMB = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Subir documentos</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors mb-4 ${
            files.length ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.doc,.txt,.md,.xlsx"
            multiple
            onChange={handleFileChange}
          />
          {files.length === 0 ? (
            <div>
              <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Arrastra aquí o haz clic para seleccionar</p>
              <p className="text-xs text-slate-400 mt-1">PDF, DOCX, XLSX, TXT · Múltiples archivos · Máx 50MB c/u</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-blue-700 mb-1">
                {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
                <span className="text-xs text-slate-400 ml-1">({totalMB.toFixed(2)} MB total)</span>
              </p>
              <p className="text-xs text-blue-500">Haz clic para agregar más</p>
            </div>
          )}
        </div>

        {files.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1 mb-4">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded border border-slate-100">
                <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-slate-700 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-slate-400 flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="label">Tipo de documento</label>
          <div className="space-y-1.5">
            {DOC_TYPES.map(t => (
              <label key={t.value} className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="doctype" value={t.value} checked={docType === t.value} onChange={() => setDocType(t.value)} />
                <div>
                  <span className="text-sm font-medium text-slate-700">{t.label}</span>
                  <span className="text-xs text-slate-400"> — {t.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {uploading && uploadProgress && (
          <p className="text-xs text-blue-600 mb-3 flex items-center gap-1.5">
            <span className="animate-pulse">●</span> Subiendo: {uploadProgress}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={uploading} className="btn-secondary">Cancelar</button>
          <button onClick={handleUpload} disabled={!files.length || uploading} className="btn-primary">
            {uploading ? 'Subiendo...' : `Subir ${files.length > 1 ? files.length + ' archivos' : 'y procesar'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Documents({ entityId, entity }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [progress, setProgress] = useState({})
  const [scanningDoc, setScanningDoc] = useState(null)  // null | { id, method }
  const [scanResults, setScanResults] = useState({})
  const [reprocessing, setReprocessing] = useState({})
  const wsRef = useRef(null)
  const navigate = useNavigate()

  function load() {
    api.listDocuments(entityId).then(setDocs).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const ws = createWebSocket(entityId)
    wsRef.current = ws
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.event === 'doc_step') {
        setProgress(p => ({ ...p, [msg.doc_id]: { step: msg.step, progress: msg.progress } }))
      } else if (msg.event === 'doc_complete' || msg.event === 'doc_error') {
        setProgress(p => { const n = { ...p }; delete n[msg.doc_id]; return n })
        setReprocessing(prev => { const n = { ...prev }; delete n[msg.doc_id]; return n })
        load()
      }
    }
    return () => ws.close()
  }, [entityId])

  async function deleteDoc(docId) {
    if (!confirm('¿Eliminar documento?')) return
    await api.deleteDocument(entityId, docId)
    load()
  }

  async function reprocessDoc(docId) {
    setReprocessing(prev => ({ ...prev, [docId]: true }))
    try {
      await api.reprocessDocument(entityId, docId)
      // progress comes via WebSocket — load() is called on doc_complete
    } catch (err) {
      console.error('Error reprocesando', err.message)
      setReprocessing(prev => ({ ...prev, [docId]: false }))
    }
  }

  async function scanDoc(docId, method) {
    setScanningDoc({ id: docId, method })
    try {
      const r = await api.scanDocument(entityId, docId, method)
      setScanResults(prev => ({ ...prev, [docId]: { found: r.found, method: r.method } }))
    } finally {
      setScanningDoc(null)
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200/80 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800">Bóveda documental</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">{entity?.name}</p>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary">
            <Upload className="w-4 h-4" /> Subir documento
          </button>
        </div>
      </div>
      <div className="p-6">

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="card p-4 animate-pulse h-16" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No hay documentos subidos aún</p>
          <p className="text-xs text-slate-400 mt-1">Sube documentos para comenzar el análisis COBIT</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const prog = progress[doc.id]
            const entities = doc.extracted_entities || {}
            return (
              <div key={doc.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <StatusIcon status={doc.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800 truncate">{doc.original_name}</p>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{doc.doc_type}</span>
                        {doc.page_count && (
                          <span className="text-xs text-slate-400">{doc.page_count} fragmentos</span>
                        )}
                      </div>
                      {prog ? (
                        <div className="mt-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${prog.progress}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 whitespace-nowrap">{prog.step}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3 mt-1 flex-wrap">
                          {entities.responsables?.length > 0 && (
                            <span className="text-xs text-slate-400">
                              <Tag className="w-3 h-3 inline mr-0.5" />
                              {entities.responsables.slice(0,2).join(', ')}
                            </span>
                          )}
                          {entities.controles?.length > 0 && (
                            <span className="text-xs text-blue-500 font-mono">{entities.controles.slice(0,4).join(' ')}</span>
                          )}
                          {scanResults[doc.id] !== undefined && (() => {
                            const sr = scanResults[doc.id]
                            const ScanIcon = sr.method === 'gemini' ? Sparkles : Settings
                            return (
                              <button
                                onClick={() => navigate(`/entities/${entityId}/inconsistencies`)}
                                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors"
                              >
                                <ScanIcon className="w-3 h-3" />
                                {sr.found === 0
                                  ? 'Sin inconsistencias internas'
                                  : `${sr.found} inconsistencia${sr.found !== 1 ? 's' : ''} interna${sr.found !== 1 ? 's' : ''} →`
                                }
                              </button>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(doc.status === 'error' || (doc.status === 'ready' && doc.page_count <= 1 && !Object.values(doc.extracted_entities || {}).some(v => v?.length > 0))) && (
                      <button
                        onClick={() => reprocessDoc(doc.id)}
                        disabled={reprocessing[doc.id] || !!prog}
                        title="Reprocesar documento"
                        className="text-amber-400 hover:text-amber-600 transition-colors"
                      >
                        {reprocessing[doc.id]
                          ? <Loader className="w-3.5 h-3.5 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5" />
                        }
                      </button>
                    )}
                    {doc.status === 'ready' && (
                      <>
                        <button
                          onClick={() => scanDoc(doc.id, 'engine')}
                          disabled={!!scanningDoc}
                          title="Inconsistencias — Motor (sin IA)"
                          className="text-slate-300 hover:text-slate-600 transition-colors"
                        >
                          {scanningDoc?.id === doc.id && scanningDoc?.method === 'engine'
                            ? <Loader className="w-3.5 h-3.5 animate-spin text-slate-500" />
                            : <Settings className="w-3.5 h-3.5" />
                          }
                        </button>
                        <button
                          onClick={() => scanDoc(doc.id, 'gemini')}
                          disabled={!!scanningDoc}
                          title="Inconsistencias — Gemini (análisis profundo)"
                          className="text-slate-300 hover:text-purple-500 transition-colors"
                        >
                          {scanningDoc?.id === doc.id && scanningDoc?.method === 'gemini'
                            ? <Loader className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            : <Sparkles className="w-3.5 h-3.5" />
                          }
                        </button>
                      </>
                    )}
                    <button onClick={() => deleteDoc(doc.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <p className="text-xs text-blue-600">
          El tipo de documento importa: COBIT distingue entre que exista una política (<span className="font-medium">normativo</span>) y que haya evidencia de ejecución (<span className="font-medium">operativo</span>).
        </p>
      </div>

      {showUpload && (
        <UploadModal
          entityId={entityId}
          onClose={() => setShowUpload(false)}
          onSuccess={load}
        />
      )}
      </div>
    </div>
  )
}
