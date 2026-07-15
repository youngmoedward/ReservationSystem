'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useLanguage } from '@/app/LanguageContext'
import { LogIn, Lock, Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { language, setLanguage, t } = useLanguage()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      })

      if (error) throw error

      // Redirect to dashboard
      router.push('/')
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen text-stone-850 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'url("/spa_healing_bg.png")' }}
    >
      {/* 은은한 찜질방 스파 힐링 분위기를 위한 크림 오버레이 마스크 */}
      <div className="absolute inset-0 bg-[#faf7f0]/80 backdrop-blur-[1px] z-0" />

      {/* 우측 상단 언어 선택기 */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex bg-stone-200/50 border border-stone-200 rounded-xl p-0.5 shadow-inner">
          <button
            onClick={() => setLanguage('ko')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${language === 'ko'
              ? 'bg-white text-stone-800 border border-stone-300 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
              }`}
          >
            KO
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${language === 'en'
              ? 'bg-white text-stone-800 border border-stone-300 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
              }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* 백그라운드 빛나는 글래디언트 원들 */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-md relative z-10">
        {/* 상단 로고/브랜드 영역 */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Spa Logo" className="w-16 h-16 object-contain mx-auto mb-3 shadow-sm rounded-2xl animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-stone-800 to-stone-900 bg-clip-text text-transparent">
            {t('app.title')}
          </h1>
          <p className="text-xs text-stone-400 font-medium font-mono uppercase tracking-wider mt-1">
            {t('app.subtitle')}
          </p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white/80 border border-stone-200 backdrop-blur-xl rounded-2xl p-8 shadow-sm">
          <h2 className="text-base font-bold text-stone-800 mb-6 flex items-center gap-2">
            <LogIn className="w-4 h-4 text-emerald-700" /> {t('login.title')}
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* 이메일 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-600 block pl-1">{t('login.email')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@spa.com"
                  className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-all font-semibold"
                />
              </div>
            </div>

            {/* 비밀번호 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-600 block pl-1">{t('login.password')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-all font-semibold"
                />
              </div>
            </div>

            {/* 에러 메시지 */}
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3.5 py-2.5 rounded-xl font-medium leading-relaxed">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-650 hover:to-emerald-550 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('login.submitting')}
                </>
              ) : (
                <>{t('login.submit')}</>
              )}
            </button>
          </form>
        </div>

        {/* 로그인 도움 안내 문구 */}
        <div className="text-center mt-6 text-[10px] text-stone-500 leading-relaxed font-semibold">
          {/* <p>{t('login.info')}</p> */}
          <p className="mt-1">© 2026 {t('app.title')}</p>
        </div>
      </div>
    </div>
  )
}
