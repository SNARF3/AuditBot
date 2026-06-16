import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { FileOutput, Download, CheckCircle, AlertTriangle, Loader } from 'lucide-react'

export default function Report({ entityId, entity }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)

  useEffect(() => {
    api.getReportPreview(entityId).then(setPreview).finally(() => setLoading(false))
  }, [entityId])

  async function generate(format) {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await api.generateReport(entityId, format)
      if (format === 'json') {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `auditoria_${entity?.name}.json`; a.click()
        URL.revokeObjectURL(url)
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `auditoria_${entity?.name}.pdf`; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-400">Cargando...</div>

  const { findings = [], gap_count = 0, partial_count = 0, compliant_count = 0 } = preview || {}
  const included = findings.filter(f => f.status === 'included')
  const needsObs = included.filter(f => !f.has_observation)

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-800">Generar Reporte</h2>
        <p className="text-sm text-slate-500">{entity?.name}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{gap_count}</div>
          <p className="text-xs text-slate-500">Brechas</p>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{partial_count}</div>
          <p className="text-xs text-slate-500">Parciales</p>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">{compliant_count}</div>
          <p className="text-xs text-slate-500">Cumple</p>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <h3 className="section-title">Hallazgos a incluir ({included.length})</h3>
        {findings.length === 0 ? (
          <p className="text-sm text-slate-400">No hay hallazgos validados aún.</p>
        ) : (
          <div className="space-y-2">
            {findings.map(f => (
              <div key={f.id} className={`flex items-center gap-3 p-3 rounded-lg border ${f.status === 'included' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                {f.status === 'included'
                  ? <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  : <div className="w-4 h-4 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono font-bold text-slate-500 mr-1">{f.process_id}</span>
                  <span className="text-xs text-slate-700">{f.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    f.severity === 'critica' ? 'bg-red-100 text-red-700' :
                    f.severity === 'alta' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{f.severity}</span>
                  {f.status === 'included' && !f.has_observation && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Sin observación formal" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {needsObs.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            {needsObs.length} hallazgo(s) incluidos no tienen observación formal.
            Ve a Hallazgos y usa "Redactar con Gemini" para completarlos.
          </p>
        </div>
      )}

      <div className="card p-4">
        <h3 className="section-title">Exportar</h3>
        <div className="flex gap-3">
          <button
            onClick={() => generate('pdf')}
            disabled={generating || included.length === 0}
            className="btn-primary"
          >
            {generating ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF ejecutivo
          </button>
          <button
            onClick={() => generate('json')}
            disabled={generating}
            className="btn-secondary"
          >
            <FileOutput className="w-4 h-4" /> JSON técnico
          </button>
        </div>
        {genError && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{genError}</p>
          </div>
        )}
        {included.length === 0 && (
          <p className="text-xs text-slate-400 mt-2">Marca hallazgos como "Incluir en reporte" desde la sección Hallazgos.</p>
        )}
      </div>
    </div>
  )
}
