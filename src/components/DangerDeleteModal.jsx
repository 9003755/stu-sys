import { useState, useEffect } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

export default function DangerDeleteModal({ isOpen, onClose, onConfirm, title, message, itemDescription }) {
  const [confirmInput, setConfirmInput] = useState('')
  const [isShaking, setIsShaking] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setConfirmInput('')
      // Trigger shake animation on open
      setIsShaking(true)
      const timer = setTimeout(() => setIsShaking(false), 500)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!isOpen) return null

  const isConfirmed = confirmInput === '确认删除'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isConfirmed) {
      onConfirm()
    } else {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop with red tint */}
      <div 
        className="absolute inset-0 bg-red-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div 
        className={`relative bg-gray-900 border-2 border-red-600 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden transform transition-all ${isShaking ? 'animate-shake' : ''}`}
      >
        {/* Header */}
        <div className="bg-red-600/20 px-6 py-4 border-b border-red-600/30 flex items-center justify-between">
          <div className="flex items-center text-red-500">
            <AlertTriangle className="w-8 h-8 mr-3 animate-pulse" />
            <h3 className="text-xl font-bold tracking-wider uppercase">严重警告</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
          <h4 className="text-xl text-white font-bold mb-4">{title}</h4>
          
          <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 mb-6">
            <p className="text-red-200 leading-relaxed font-medium">
              {message}
            </p>
            {itemDescription && (
              <div className="mt-3 text-red-300 text-sm font-mono bg-black/30 p-2 rounded">
                目标对象: {itemDescription}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-gray-400 text-sm mb-2">
              为确认您的操作，请在下方输入 <span className="text-white font-bold mx-1 select-none">确认删除</span>
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="确认删除"
              className="w-full bg-black/50 border-2 border-red-900/50 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all text-center tracking-widest font-bold"
              autoFocus
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 font-medium transition-colors border border-gray-700"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isConfirmed}
              className={`flex-1 px-4 py-3 rounded-lg font-bold flex items-center justify-center transition-all duration-200
                ${isConfirmed 
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] scale-105' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-800'
                }`}
            >
              <Trash2 size={18} className="mr-2" />
              永久删除
            </button>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
    </div>
  )
}
