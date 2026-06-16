import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { ArrowLeft } from 'lucide-react'

const INDUSTRIES = ['banca', 'salud', 'gobierno', 'tecnologia', 'otro']
const DOMAINS = [
  { id: 'PO', name: 'Planear y Organizar', count: 10 },
  { id: 'AI', name: 'Adquirir e Implementar', count: 7 },
  { id: 'DS', name: 'Entregar y Dar Soporte', count: 13 },
  { id: 'ME', name: 'Monitorear y Evaluar', count: 4 },
]

export default function NewEntity({ edit }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [form, setForm] = useState({ name: '', industry: 'banca', description: '', cobit_scope: ['PO','AI','DS','ME'] })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (edit && id) {
      api.getEntity(id).then(e => {
        setForm({
          name: e.name,
          industry: e.industry || 'banca',
          description: e.description || '',
          cobit_scope: e.cobit_scope || ['PO','AI','DS','ME'],
        })
      })
    }
  }, [edit, id])

  function toggleDomain(domain) {
    setForm(f => ({
      ...f,
      cobit_scope: f.cobit_scope.includes(domain)
        ? f.cobit_scope.filter(d => d !== domain)
        : [...f.cobit_scope, domain],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      if (edit && id) {
        await api.updateEntity(id, form)
        navigate(`/entities/${id}/coverage`)
      } else {
        const res = await api.createEntity(form)
        navigate(`/entities/${res.id}/coverage`)
      }
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link to="/" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold text-slate-800">{edit ? 'Editar entidad' : 'Nueva entidad auditada'}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="section-title">Información general</h2>
            <div>
              <label className="label">Nombre de la organización *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Banco Ficticio S.A."
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Sector / Industria</label>
              <select
                value={form.industry}
                onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                className="input"
              >
                {INDUSTRIES.map(i => (
                  <option key={i} value={i} className="capitalize">{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Descripción breve (opcional)</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Contexto de la organización..."
                className="input resize-none"
              />
            </div>
          </div>

          <div className="card p-6">
            <h2 className="section-title">Alcance COBIT 4.1</h2>
            <p className="text-sm text-slate-500 mb-4">Selecciona los dominios a auditar:</p>
            <div className="space-y-2">
              {DOMAINS.map(d => (
                <label key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.cobit_scope.includes(d.id)}
                    onChange={() => toggleDomain(d.id)}
                    className="text-blue-600 rounded"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-700">{d.id}</span>
                    <span className="text-sm text-slate-500"> — {d.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{d.count} procesos</span>
                </label>
              ))}
            </div>
            {form.cobit_scope.length === 0 && (
              <p className="text-xs text-red-500 mt-2">Selecciona al menos un dominio</p>
            )}
          </div>

          {saveError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              <span className="font-semibold flex-shrink-0">Error:</span> {saveError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Link to="/" className="btn-secondary">Cancelar</Link>
            <button
              type="submit"
              disabled={saving || !form.name || form.cobit_scope.length === 0}
              className="btn-primary"
            >
              {saving ? 'Guardando...' : edit ? 'Guardar cambios' : 'Crear entidad'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
