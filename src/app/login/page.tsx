'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useLanguage } from '@/app/LanguageContext'
import { Sparkles, LogIn, Lock, Mail, Loader2 } from 'lucide-react'

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* 우측 상단 언어 선택기 */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5 shadow-inner">
          <button
            onClick={() => setLanguage('ko')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
              language === 'ko'
                ? 'bg-slate-950 text-slate-100 border border-slate-850 shadow'
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            KO
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
              language === 'en'
                ? 'bg-slate-950 text-slate-100 border border-slate-850 shadow'
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* 백그라운드 빛나는 글래디언트 원들 */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* 상단 로고/브랜드 영역 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-amber-500 shadow-lg shadow-indigo-950/40 mb-3 animate-pulse">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            {t('app.title')}
          </h1>
          <p className="text-xs text-slate-500 font-medium font-mono uppercase tracking-wider mt-1">
            {t('app.subtitle')}
          </p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-slate-900/40 border border-slate-850 backdrop-blur-xl rounded-2xl p-8 shadow-2xl shadow-slate-950/50">
          <h2 className="text-base font-semibold text-slate-350 mb-6 flex items-center gap-2">
            <LogIn className="w-4 h-4 text-indigo-400" /> {t('login.title')}
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* 이메일 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 block pl-1">{t('login.email')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@spa.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/80 transition-all font-medium"
                />
              </div>
            </div>

            {/* 비밀번호 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 block pl-1">{t('login.password')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/80 transition-all font-medium"
                />
              </div>
            </div>

            {/* 에러 메시지 */}
            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs px-3.5 py-2.5 rounded-xl font-medium leading-relaxed">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-550 hover:to-indigo-450 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md shadow-indigo-950/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
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
        <div className="text-center mt-6 text-[10px] text-slate-600 leading-relaxed font-medium">
          <p>{t('login.info')}</p>
          <p className="mt-1">© 2026 {t('app.title')}</p>
        </div>
      </div>
    </div>
  )
}
