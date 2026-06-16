import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  Eye, EyeOff, CheckCircle, XCircle, ShieldCheck, Loader, ArrowRight,
  Key, Cpu, Zap, Building2, FileText, Map, GitCompare, FileOutput, ChevronLeft,
} from 'lucide-react'

const WORKFLOW = [
  {
    step: '01',
    icon: Building2,
    title: 'Crea la entidad',
    desc: 'Registra la organización a auditar: banco, empresa o entidad pública.',
    bg: 'bg-blue-50', ring: 'ring-blue-200', color: 'text-blue-600',
  },
  {
    step: '02',
    icon: FileText,
    title: 'Sube documentos',
    desc: 'Políticas, manuales, contratos, registros operativos. Formatos PDF, DOCX, XLSX.',
    bg: 'bg-violet-50', ring: 'ring-violet-200', color: 'text-violet-600',
  },
  {
    step: '03',
    icon: Map,
    title: 'Analiza cobertura COBIT',
    desc: 'Gemini clasifica los fragmentos en los 34 procesos COBIT 4.1 y detecta brechas.',
    bg: 'bg-emerald-50', ring: 'ring-emerald-200', color: 'text-emerald-600',
  },
  {
    step: '04',
    icon: GitCompare,
    title: 'Detecta inconsistencias',
    desc: 'IA busca contradicciones internas y entre documentos. Ollama personaliza los hallazgos.',
    bg: 'bg-amber-50', ring: 'ring-amber-200', color: 'text-amber-600',
  },
  {
    step: '05',
    icon: FileOutput,
    title: 'Genera el reporte',
    desc: 'Exporta el informe de auditoría con hallazgos, evidencias y recomendaciones.',
    bg: 'bg-rose-50', ring: 'ring-rose-200', color: 'text-rose-600',
  },
]

export default function Setup({ onComplete }) {
  const navigate = useNavigate()
  const [wizardStep, setWizardStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function testKey() {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.testGemini(apiKey)
      setTestResult(r.valid ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.saveConfig({ gemini_api_key: apiKey, ollama_available: true })
      onComplete()
      navigate('/')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 35%, #faf5ff 70%, #fff 100%)',
      }}
    >
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[0, 1, 2].map(i => (
            <button
              key={i}
              onClick={() => i < wizardStep && setWizardStep(i)}
              className={`rounded-full transition-all duration-300 ${
                i === wizardStep
                  ? 'w-8 h-2 bg-blue-600'
                  : i < wizardStep
                    ? 'w-2 h-2 bg-blue-300 cursor-pointer hover:bg-blue-400'
                    : 'w-2 h-2 bg-slate-200 cursor-default'
              }`}
            />
          ))}
        </div>

        {/* ── STEP 0: Bienvenida ─────────────────────────── */}
        {wizardStep === 0 && (
          <div className="animate-fade-up text-center">
            <div className="relative inline-block mb-6">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-200 animate-float mx-auto">
                <ShieldCheck className="w-12 h-12 text-white" />
              </div>
              <span className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-400 rounded-full border-2 border-white flex items-center justify-center">
                <Zap className="w-3 h-3 text-white" />
              </span>
            </div>

            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              Audit<span className="text-blue-600">Bot</span> v2
            </h1>
            <p className="text-slate-500 text-base mb-8 leading-relaxed">
              Auditoría de TI asistida por inteligencia artificial<br />
              basada en el marco <span className="font-bold text-blue-600">COBIT 4.1</span>
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: Zap,         label: 'Análisis IA',       desc: 'Gemini detecta brechas',         bg: 'from-blue-500 to-blue-600' },
                { icon: GitCompare,  label: 'Inconsistencias',   desc: 'Contradiciones automáticas',     bg: 'from-violet-500 to-violet-600' },
                { icon: FileOutput,  label: 'Reportes',          desc: 'Informes exportables',           bg: 'from-emerald-500 to-emerald-600' },
              ].map(({ icon: Icon, label, desc, bg }) => (
                <div key={label} className="card p-4 text-left hover:shadow-md transition-all duration-200">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${bg} flex items-center justify-center mb-3 shadow-sm`}>
                    <Icon className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
                  </div>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-tight">{desc}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setWizardStep(1)}
              className="btn-primary w-full py-3.5 text-base rounded-2xl shadow-lg shadow-blue-200"
            >
              Ver cómo funciona <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-xs text-slate-400 mt-3">3 pasos de configuración · menos de 1 minuto</p>
          </div>
        )}

        {/* ── STEP 1: Flujo de trabajo ────────────────────── */}
        {wizardStep === 1 && (
          <div className="animate-fade-up">
            <div className="text-center mb-7">
              <h2 className="text-2xl font-extrabold text-slate-900">Flujo de auditoría</h2>
              <p className="text-slate-500 text-sm mt-1.5">De la entidad al reporte, todo en un lugar</p>
            </div>

            <div className="space-y-2.5 mb-8">
              {WORKFLOW.map((w, i) => {
                const Icon = w.icon
                return (
                  <div
                    key={i}
                    className="card p-4 flex items-center gap-4 hover:shadow-md transition-all duration-200"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className={`w-11 h-11 rounded-2xl ${w.bg} ring-2 ${w.ring} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${w.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{w.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{w.desc}</p>
                    </div>
                    <span className="text-lg font-extrabold text-slate-100 flex-shrink-0 select-none">{w.step}</span>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setWizardStep(0)} className="btn-secondary px-4 py-3 rounded-2xl">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={() => setWizardStep(2)}
                className="btn-primary flex-1 py-3 rounded-2xl shadow-lg shadow-blue-200"
              >
                Configurar acceso <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Configuración ───────────────────────── */}
        {wizardStep === 2 && (
          <div className="animate-fade-up">
            <div className="text-center mb-7">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                <Key className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900">Configurar acceso</h2>
              <p className="text-slate-500 text-sm mt-1.5">Conecta los modelos de IA</p>
            </div>

            <div className="card p-6 mb-4">
              <div className="space-y-5">
                <div>
                  <label className="label">Google Gemini API Key</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
                        placeholder="AIza..."
                        className="input pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={testKey}
                      disabled={testing || !apiKey.trim()}
                      className="btn-secondary px-3 py-2.5"
                    >
                      {testing ? <Loader className="w-4 h-4 animate-spin" /> : 'Verificar'}
                    </button>
                  </div>

                  {testResult === 'ok' && (
                    <p className="flex items-center gap-1.5 text-emerald-600 text-xs mt-2 animate-fade-in font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Conexión exitosa
                    </p>
                  )}
                  {testResult === 'fail' && (
                    <p className="flex items-center gap-1.5 text-red-500 text-xs mt-2 animate-fade-in font-medium">
                      <XCircle className="w-3.5 h-3.5" /> API key inválida o sin conexión
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1.5">
                    Gratis en{' '}
                    <a href="https://aistudio.google.com" target="_blank" rel="noopener" className="text-blue-500 hover:underline font-medium">
                      aistudio.google.com
                    </a>
                  </p>
                </div>

                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Cpu className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-700">Ollama requerido</span>
                  </div>
                  <p className="text-xs text-blue-600/80 leading-relaxed">
                    Necesitas Ollama corriendo en{' '}
                    <code className="font-mono bg-blue-100 px-1.5 py-0.5 rounded-lg text-blue-700">localhost:11434</code>{' '}
                    con{' '}
                    <code className="font-mono bg-blue-100 px-1.5 py-0.5 rounded-lg text-blue-700">llama3.2:1b</code>{' '}
                    instalado. Personaliza textos de hallazgos con el nombre real de la entidad.
                  </p>
                </div>

                {saveError && (
                  <p className="flex items-center gap-1.5 text-red-600 text-xs p-3 bg-red-50 border border-red-200 rounded-2xl animate-fade-in">
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> {saveError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setWizardStep(1)} className="btn-secondary px-4 py-3 rounded-2xl">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={save}
                disabled={saving || !apiKey.trim()}
                className="btn-primary flex-1 py-3 text-base rounded-2xl shadow-lg shadow-blue-200"
              >
                {saving ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Guardando...</>
                ) : (
                  <><Zap className="w-5 h-5" /> Comenzar auditoría</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
