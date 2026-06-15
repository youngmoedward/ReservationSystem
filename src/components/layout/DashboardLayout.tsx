'use client'

import React, { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { Calendar, List, Settings, Users, LogIn, LogOut, Sparkles, BarChart3, ShieldAlert } from 'lucide-react'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentUser, setCurrentUser, users, logout } = useUserSim()
  const { language, setLanguage, t } = useLanguage()

  // 1. [권한 가드]: 권한별 페이지 접근 제한
  useEffect(() => {
    const isManagerPage = ['/therapist', '/employee', '/history', '/stats'].includes(pathname)
    if (currentUser.role === 'staff' && isManagerPage) {
      router.push('/')
      return
    }

    const isTherapistRestricted = ['/therapist', '/employee', '/history', '/stats', '/blacklist'].includes(pathname)
    if (currentUser.role === 'therapist' && isTherapistRestricted) {
      router.push('/')
    }
  }, [currentUser, pathname, router])

  const navigateTo = (path: string) => {
    router.push(path)
  }

  const getRoleText = (role: string) => {
    if (role === 'manager') return t('user.role.manager')
    if (role === 'staff') return t('user.role.staff')
    return t('user.role.therapist')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 상단 권한 시뮬레이터 및 헤더 */}
      <header className="border-b border-slate-900 bg-slate-900/20 backdrop-blur-md sticky top-0 z-40 p-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-amber-500 flex items-center justify-center shadow-lg shadow-indigo-950/40">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-100">{t('app.title')}</h1>
              <span className="text-[10px] text-slate-500 font-medium font-mono">{t('app.subtitle')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* 언어 선택기 */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-inner mr-1">
              <button
                onClick={() => setLanguage('ko')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                  language === 'ko'
                    ? 'bg-slate-900 text-slate-100 border border-slate-850 shadow'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                KO
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                  language === 'en'
                    ? 'bg-slate-900 text-slate-100 border border-slate-850 shadow'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                EN
              </button>
            </div>

            {/* 로그인한 사용자 정보 표시 */}
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className={`w-2 h-2 rounded-full ${
                currentUser.role === 'manager' 
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' 
                  : currentUser.role === 'staff' 
                    ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' 
                    : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              }`} />
              <span className="text-xs font-bold text-slate-300">
                {currentUser.name} ({getRoleText(currentUser.role)})
              </span>
            </div>

            {/* 로그아웃 버튼 */}
            <button
              onClick={logout}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-rose-500/10 text-rose-450 border border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-450 transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* 본문 콘텐츠 레이아웃 */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* 네비게이션 탭 메뉴 (주소창 기반 렌더링) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => navigateTo('/')}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                pathname === '/'
                  ? 'bg-slate-900 border-slate-850 text-indigo-400'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-4 h-4" /> {t('nav.calendar')}
            </button>
            <button
              onClick={() => navigateTo('/list')}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                pathname === '/list'
                  ? 'bg-slate-900 border-slate-850 text-indigo-400'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-4 h-4" /> {t('nav.list')}
            </button>
            {currentUser.role !== 'therapist' && (
              <button
                onClick={() => navigateTo('/blacklist')}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                  pathname === '/blacklist'
                    ? 'bg-slate-900 border-slate-850 text-indigo-400'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldAlert className="w-4 h-4" /> {t('nav.blacklist')}
              </button>
            )}

            <button
              onClick={() => navigateTo('/schedule')}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                pathname === '/schedule'
                  ? 'bg-slate-900 border-slate-850 text-indigo-400'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-4 h-4" /> {t('nav.schedule')}
            </button>

            {/* [권한별 분기] Manager인 경우에만 마사지사 관리, 직원 등록 및 이력 탭 노출 */}
            {currentUser.role === 'manager' && (
              <>
                <button
                  onClick={() => navigateTo('/therapist')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                    pathname === '/therapist'
                      ? 'bg-slate-900 border-slate-850 text-amber-400'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Settings className="w-4 h-4" /> {t('nav.therapist')}
                </button>
                <button
                  onClick={() => navigateTo('/employee')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                    pathname === '/employee'
                      ? 'bg-slate-900 border-slate-850 text-amber-400'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4" /> {t('nav.employee')}
                </button>
                <button
                  onClick={() => navigateTo('/history')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                    pathname === '/history'
                      ? 'bg-slate-900 border-slate-850 text-amber-400'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <List className="w-4 h-4" /> {t('nav.history')}
                </button>
                <button
                  onClick={() => navigateTo('/stats')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                    pathname === '/stats'
                      ? 'bg-slate-900 border-slate-850 text-amber-400'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" /> {t('nav.stats')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 각 페이지의 콘텐츠 주입 */}
        <div className="space-y-6">
          {children}
        </div>
      </div>

      {/* 푸터 */}
      <footer className="border-t border-slate-900 p-6 text-center text-[11px] text-slate-600 bg-slate-950 mt-auto">
        <p>© 2026 {t('app.title')} - Next.js & Supabase & TailwindCSS</p>
      </footer>
    </div>
  )
}
