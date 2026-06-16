import { useState, useRef, useEffect } from 'react'
import { api } from '../api/client'
import { Send, Bot, User, Loader, Zap } from 'lucide-react'

const QUICK_QUESTIONS = [
  '¿Qué es DS11?',
  '¿Qué revisar primero?',
  'Explica PO9',
  '¿Qué evidencia pedir para DS5?',
]

export default function Copilot({ entityId, entity }) {
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [quota, setQuota] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    api.getGeminiUsage().then(setQuota).catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  async function sendMessage(msg) {
    if (!msg.trim() || loading) return
    const userMsg = { role: 'user', content: msg }
    setHistory(h => [...h, userMsg])
    setInput('')
    setLoading(true)

    try {
      const r = await api.chat(entityId, msg, history.slice(-6))
      if (r.error) {
        setHistory(h => [...h, { role: 'assistant', content: `Error: ${r.error}` }])
      } else {
        setHistory(h => [...h, { role: 'assistant', content: r.response }])
        api.getGeminiUsage().then(setQuota).catch(() => {})
      }
    } catch (err) {
      setHistory(h => [...h, { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Copiloto IA</h2>
            <p className="text-sm text-slate-500">{entity?.name} · Gemini Flash-Lite</p>
          </div>
          {quota && (
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              {quota.today_requests}/{quota.daily_limit} hoy
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {history.length === 0 && (
          <div>
            <div className="card p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>Puedo ayudarte con:</p>
                  <ul className="text-slate-500 space-y-0.5">
                    <li>• Explicar cualquier proceso COBIT 4.1</li>
                    <li>• Sugerir qué evidencia solicitar al cliente</li>
                    <li>• Redactar preguntas para entrevistas</li>
                    <li>• Interpretar un hallazgo específico</li>
                  </ul>
                  <p className="text-xs text-slate-400 mt-2">Cada mensaje usa 1 request de Gemini.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map(q => (
                <button key={q} onClick={() => sendMessage(q)} className="btn-secondary text-xs py-1.5 px-3">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-100'
            }`}>
              {msg.role === 'user'
                ? <User className="w-4 h-4 text-white" />
                : <Bot className="w-4 h-4 text-slate-500" />
              }
            </div>
            <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-slate-400" />
            </div>
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5">
              <Loader className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="Escribe tu pregunta..."
          className="input flex-1"
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="btn-primary px-3"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
