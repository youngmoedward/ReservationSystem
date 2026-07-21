'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLanguage } from '@/app/LanguageContext'
import { Lock, AlertCircle, X, Check } from 'lucide-react'

export interface PinAuthResult {
  pin: string
  userName: string
  userRole: string
}

interface PinAuthModalProps {
  isOpen: boolean
  actionTitle: string // 예: "예약 신규 접수", "요금제 수정" 등
  onSuccess: (result: PinAuthResult) => void
  onCancel: () => void
}

export default function PinAuthModal({
  isOpen,
  actionTitle,
  onSuccess,
  onCancel
}: PinAuthModalProps) {
  const supabase = createClient()
  const { language } = useLanguage()
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const hiddenInputRef = useRef<HTMLInputElement>(null)

  // 1. 모달 열릴 때 포커스 및 초기화
  useEffect(() => {
    if (isOpen) {
      setPin('')
      setErrorMsg(null)
      setTimeout(() => {
        hiddenInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  // 2. Escape / Enter 등 단축키 처리 (중복 입력 방지를 위해 숫자키 입력은 hidden input에만 위임)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (pin.length === 4 && !loading) {
          handlePinSubmit()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pin, loading])

  if (!isOpen) return null

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pin || pin.length < 4) {
      setErrorMsg(language === 'ko' ? '4자리 PIN 번호를 입력해주세요.' : 'Please enter a 4-digit PIN.')
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      // 1. Manager 전용 PIN (7717) 체크
      if (pin === '7717') {
        onSuccess({
          pin: '7717',
          userName: 'Manager (7717)',
          userRole: 'manager'
        })
        setPin('')
        return
      }

      // 2. employees (직원 명단) 테이블에서 PIN 확인
      const { data: empData } = await supabase
        .from('employee')
        .select('name, role')
        .eq('pin_code', pin)
        .maybeSingle()

      if (empData) {
        onSuccess({
          pin,
          userName: `${empData.name} (${pin})`,
          userRole: empData.role || 'staff'
        })
        setPin('')
        return
      }

      // 3. therapists (마사지사 명단) 테이블에서 PIN 확인
      const { data: thData } = await supabase
        .from('therapists')
        .select('name, massage_type')
        .eq('pin_code', pin)
        .maybeSingle()

      if (thData) {
        onSuccess({
          pin,
          userName: `${thData.name} (${pin})`,
          userRole: 'therapist'
        })
        setPin('')
        return
      }

      // 일치하는 PIN이 없을 때
      setErrorMsg(language === 'ko' ? '등록되지 않거나 일치하지 않는 PIN 번호입니다.' : 'Invalid PIN Number.')
    } catch (err: any) {
      console.error('PIN verification error:', err)
      setErrorMsg(language === 'ko' ? 'PIN 번호 확인 중 오류가 발생했습니다.' : 'Error verifying PIN.')
    } finally {
      setLoading(false)
    }
  }

  // 화면 키패드 버튼 클릭
  const handleKeyClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num)
      setErrorMsg(null)
    }
    hiddenInputRef.current?.focus()
  }

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1))
    setErrorMsg(null)
    hiddenInputRef.current?.focus()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => hiddenInputRef.current?.focus()}
    >
      {/* 숨겨진 키보드 입력용 Input (중복 입력 없이 단일 소스로 키보드 입력 수신) */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={pin}
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
          setPin(val)
          setErrorMsg(null)
        }}
        className="opacity-0 absolute pointer-events-none w-0 h-0"
        autoFocus
      />

      <div
        className="w-full max-w-sm bg-white border border-stone-200 rounded-3xl shadow-2xl p-6 text-center space-y-5 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 닫기 버튼 */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 아이콘 및 타이틀 */}
        <div className="space-y-1 pt-2">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 mx-auto flex items-center justify-center shadow-xs">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-stone-900 tracking-tight pt-1">
            {actionTitle}
          </h3>
          <p className="text-xs font-semibold text-purple-900 bg-purple-50 px-3 py-1 rounded-full inline-block border border-purple-200/60">
            🔒 {language === 'ko' ? '키보드로 입력하거나 화면 숫자를 누르세요' : 'Type on Keyboard or Tap Numbers'}
          </p>
        </div>

        {/* PIN 4자리 표시 박스 */}
        <div
          onClick={() => hiddenInputRef.current?.focus()}
          className="flex justify-center gap-3 py-2 cursor-pointer"
        >
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-12 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                pin[idx]
                  ? 'border-purple-600 bg-purple-50/50 text-purple-950 shadow-xs scale-105'
                  : 'border-stone-200 bg-stone-50 text-stone-400'
              }`}
            >
              {pin[idx] ? '●' : ''}
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 animate-in shake">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 화면 숫자 키패드 3x4 */}
        <div className="grid grid-cols-3 gap-2 pt-1 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyClick(num)}
              className="h-12 rounded-2xl bg-stone-100 hover:bg-purple-100/70 text-stone-800 hover:text-purple-950 font-black text-lg transition-all active:scale-95 shadow-2xs border border-stone-200/60"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-2xl bg-stone-200/80 hover:bg-stone-300 text-stone-700 font-extrabold text-xs transition-all active:scale-95 border border-stone-300/80"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => handleKeyClick('0')}
            className="h-12 rounded-2xl bg-stone-100 hover:bg-purple-100/70 text-stone-800 hover:text-purple-950 font-black text-lg transition-all active:scale-95 shadow-2xs border border-stone-200/60"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handlePinSubmit()}
            disabled={pin.length < 4 || loading}
            className="h-12 rounded-2xl bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white font-extrabold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {language === 'ko' ? '확인' : 'OK'}
          </button>
        </div>

        {/* 취소 버튼 */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors"
          >
            {language === 'ko' ? '취소하고 돌아가기' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
