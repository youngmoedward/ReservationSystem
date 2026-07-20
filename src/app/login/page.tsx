'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { LogIn, Lock, User, ShieldCheck, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { language, setLanguage, t } = useLanguage()
  const { setCurrentUser } = useUserSim()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    const inputUser = username.trim().toLowerCase()
    const inputPass = password.trim()

    try {
      let loggedUser: any = null

      // 1. system_roles 테이블에서 5개 권한 계정 확인
      const { data: roleData, error: roleErr } = await supabase
        .from('system_roles')
        .select('*')
        .eq('username', inputUser)
        .maybeSingle()

      if (!roleErr && roleData) {
        if (roleData.password !== inputPass) {
          throw new Error(language === 'ko' ? '비밀번호가 일치하지 않습니다.' : 'Invalid password.')
        }

        loggedUser = {
          id: `role_${roleData.role_key}`,
          name: `${roleData.role_name}`,
          role: roleData.role_key
        }
      } else {
        // 2. 기본 하드코딩 5개 계정 Fallback
        const DEFAULT_CREDENTIALS: Record<string, { pass: string; role: string; name: string }> = {
          msg1: { pass: 'msg123', role: 'msg1', name: '건식 마사지사 (msg1)' },
          msg2: { pass: 'msg234', role: 'msg2', name: '습식 마사지사 (msg2)' },
          staff: { pass: 'staff123', role: 'staff', name: '직원 (staff)' },
          leader: { pass: 'leader123', role: 'leader', name: '스태프 리더 (leader)' },
          manager: { pass: '12345!', role: 'manager', name: '총괄 매니저 (manager)' },
        }

        if (DEFAULT_CREDENTIALS[inputUser]) {
          const target = DEFAULT_CREDENTIALS[inputUser]
          if (target.pass !== inputPass) {
            throw new Error(language === 'ko' ? '비밀번호가 일치하지 않습니다.' : 'Invalid password.')
          }

          loggedUser = {
            id: `role_${target.role}`,
            name: target.name,
            role: target.role
          }
        }
      }

      if (loggedUser) {
        setCurrentUser(loggedUser as any)
        window.location.href = '/'
        return
      }

      // 3. 기존 Supabase Auth Fallback (이메일 형태 입력 시)
      if (inputUser.includes('@')) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: inputUser,
          password: inputPass
        })
        if (authError) throw authError

        if (authData?.user) {
          const simUser = {
            id: authData.user.id,
            name: authData.user.email || 'User',
            role: 'manager' as const
          }
          setCurrentUser(simUser)
        }

        window.location.href = '/'
        return
      }

      throw new Error(language === 'ko' ? '존재하지 않는 계정이거나 아이디를 확인해주세요.' : 'Account not found.')
    } catch (err: any) {
      console.error('Login error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '로그인에 실패했습니다.' : 'Login failed.'))
    } finally {
      setLoading(false)
    }
  }

  // 빠른 로그인 클릭
  const quickLogin = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div
      className="min-h-screen text-stone-850 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'url("/spa_healing_bg.png")' }}
    >
      <div className="absolute inset-0 bg-[#faf7f0]/80 backdrop-blur-[1px] z-0" />

      {/* 언어 선택기 */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex bg-stone-200/50 border border-stone-200 rounded-xl p-0.5 shadow-inner">
          <button
            onClick={() => setLanguage('ko')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
              language === 'ko' ? 'bg-white text-stone-800 border border-stone-300 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            KO
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
              language === 'en' ? 'bg-white text-stone-800 border border-stone-300 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* 상단 Riviera 로고 & 브랜드 영역 */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-stone-950 p-1.5 rounded-2xl shadow-md mx-auto mb-2 border border-stone-800 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Riviera Health Spa Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">
            {t('app.title')}
          </h1>
          <p className="text-xs font-semibold text-stone-500 font-mono tracking-wider">
            {t('app.subtitle')}
          </p>
        </div>

        {/* 로그인 메인 카드 */}
        <div className="bg-white/90 backdrop-blur-md border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold text-center animate-in shake">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                {language === 'ko' ? '계정 ID (Username)' : 'Account ID'}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-stone-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="msg1, msg2, staff, leader, manager"
                  className="w-full bg-stone-50 border border-stone-200 text-stone-900 text-xs font-bold rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                {language === 'ko' ? '비밀번호 (Password)' : 'Password'}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-stone-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  className="w-full bg-stone-50 border border-stone-200 text-stone-900 text-xs font-bold rounded-2xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-stone-400 hover:text-stone-700 transition-colors p-0.5 rounded-lg"
                  title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-amber-900 hover:bg-amber-950 text-white rounded-2xl font-black text-xs transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {loading ? (language === 'ko' ? '로그인 처리 중...' : 'Logging in...') : (language === 'ko' ? '로그인' : 'Login')}
            </button>
          </form>

          {/* 5개 권한 계정 원클릭 간편 입력 안내 */}
          <div className="pt-2 border-t border-stone-200/80 space-y-2">
            <span className="text-[10px] font-bold text-stone-500 block text-center">
              💡 {language === 'ko' ? '빠른 로그인 계정 선택 (클릭 시 자동 입력)' : 'Quick Select Role Account'}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => quickLogin('msg1', 'msg123')}
                className="p-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-bold hover:bg-amber-100 text-center"
              >
                🧘‍♂️ msg1 (msg123)
              </button>
              <button
                type="button"
                onClick={() => quickLogin('msg2', 'msg234')}
                className="p-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 font-bold hover:bg-sky-100 text-center"
              >
                🧴 msg2 (msg234)
              </button>
              <button
                type="button"
                onClick={() => quickLogin('staff', 'staff123')}
                className="p-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 font-bold hover:bg-purple-100 text-center"
              >
                👤 staff (staff123)
              </button>
              <button
                type="button"
                onClick={() => quickLogin('leader', 'leader123')}
                className="p-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold hover:bg-emerald-100 text-center"
              >
                ⭐ leader (leader123)
              </button>
              <button
                type="button"
                onClick={() => quickLogin('manager', '12345!')}
                className="col-span-2 sm:col-span-1 p-1.5 rounded-xl bg-stone-900 text-amber-300 font-bold hover:bg-stone-800 text-center"
              >
                👑 manager (12345!)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
