'use client'

import React, { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { Calendar, List, Settings, Users, LogIn, LogOut, BarChart3, ShieldAlert } from 'lucide-react'

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

    const isTherapistRestricted = ['/therapist', '/employee', '/history', '/stats', '/blacklist', '/pricing'].includes(pathname)
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
    <div
      className="min-h-screen text-stone-800 flex flex-col relative bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: 'url("/dashboard_massage_bg.png")' }}
    >
      {/* 은은하게 마사지/스파 힐링 분위기를 백그라운드로 스며들게 하는 크림 마스크 overlay */}
      <div className="absolute inset-0 bg-[#faf7f0]/80 backdrop-blur-[1px] pointer-events-none z-0" />

      {/* 상단 권한 시뮬레이터 및 헤더 */}
      <header className="border-b border-stone-300 bg-[#f3edd7]/90 backdrop-blur-md sticky top-0 z-40 p-4 shadow-sm relative">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Spa Logo" className="w-10 h-10 object-contain shadow-lg rounded-xl" />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-stone-800">{t('app.title')}</h1>
              <span className="text-[10px] text-stone-500 font-medium font-mono">{t('app.subtitle')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap self-stretch lg:self-auto justify-between lg:justify-end w-full lg:w-auto">
            {/* 언어 선택기 */}
            <div className="flex bg-[#e3d7bd] border border-stone-300 rounded-xl p-0.5 shadow-inner mr-1">
              <button
                onClick={() => setLanguage('ko')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${language === 'ko'
                  ? 'bg-white text-stone-800 border border-stone-300 shadow-sm'
                  : 'text-stone-600 hover:text-stone-800'
                  }`}
              >
                KO
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${language === 'en'
                  ? 'bg-white text-stone-800 border border-stone-300 shadow-sm'
                  : 'text-stone-600 hover:text-stone-800'
                  }`}
              >
                EN
              </button>
            </div>

            {/* 로그인한 사용자 정보 표시 */}
            <div className="flex items-center gap-2 bg-[#e3d7bd]/60 border border-stone-300 rounded-xl px-3.5 py-2">
              <span className={`w-2 h-2 rounded-full ${currentUser.role === 'manager'
                ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                : currentUser.role === 'staff'
                  ? 'bg-emerald-600 shadow-[0_0_8px_rgba(5,150,105,0.5)]'
                  : 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]'
                }`} />
              <span className="text-xs font-bold text-stone-700">
                {currentUser.name} ({getRoleText(currentUser.role)})
              </span>
            </div>

            {/* 로그아웃 버튼 */}
            <button
              onClick={logout}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-rose-500/10 text-rose-700 border border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-700 transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* 본문 콘텐츠 레이아웃 */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 relative z-10">

        {/* 네비게이션 탭 메뉴 (주소창 기반 렌더링) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden bg-[#e8dec7] border border-stone-300 p-1.5 rounded-2xl shadow-sm">
          <div className="flex overflow-x-auto lg:flex-wrap gap-1.5 w-full scrollbar-none">
            <button
              onClick={() => navigateTo('/')}
              className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/'
                ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                }`}
            >
              <Calendar className="w-4 h-4" /> {t('nav.calendar')}
            </button>
            <button
              onClick={() => navigateTo('/list')}
              className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/list'
                ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                }`}
            >
              <List className="w-4 h-4" /> {t('nav.list')}
            </button>
            {currentUser.role !== 'therapist' && (
              <button
                onClick={() => navigateTo('/blacklist')}
                className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/blacklist'
                  ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                  : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                  }`}
              >
                <ShieldAlert className="w-4 h-4" /> {t('nav.blacklist')}
              </button>
            )}

            <button
              onClick={() => navigateTo('/schedule')}
              className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/schedule'
                ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                }`}
            >
              <Calendar className="w-4 h-4" /> {t('nav.schedule')}
            </button>

            {currentUser.role !== 'therapist' && (
              <button
                onClick={() => navigateTo('/pricing')}
                className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/pricing'
                  ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                  : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                  }`}
              >
                <Settings className="w-4 h-4" /> {t('nav.pricing')}
              </button>
            )}

            {/* [권한별 분기] Manager인 경우에만 마사지사 관리, 직원 등록 및 이력 탭 노출 */}
            {currentUser.role === 'manager' && (
              <>
                <button
                  onClick={() => navigateTo('/therapist')}
                  className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/therapist'
                    ? 'bg-white border-stone-300 text-amber-800 shadow-sm'
                    : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                    }`}
                >
                  <Settings className="w-4 h-4" /> {t('nav.therapist')}
                </button>
                <button
                  onClick={() => navigateTo('/employee')}
                  className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/employee'
                    ? 'bg-white border-stone-300 text-amber-800 shadow-sm'
                    : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                    }`}
                >
                  <Users className="w-4 h-4" /> {t('nav.employee')}
                </button>
                <button
                  onClick={() => navigateTo('/history')}
                  className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/history'
                    ? 'bg-white border-stone-300 text-amber-800 shadow-sm'
                    : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                    }`}
                >
                  <List className="w-4 h-4" /> {t('nav.history')}
                </button>
                <button
                  onClick={() => navigateTo('/stats')}
                  className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/stats'
                    ? 'bg-white border-stone-300 text-amber-800 shadow-sm'
                    : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
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
      <footer className="border-t border-stone-300 p-6 text-center text-[11px] text-stone-500 bg-[#e3d7bd]/30 backdrop-blur-md mt-auto relative z-10">
        <p>© 2026 {t('app.title')} </p>
        {/* <p>© 2026 {t('app.title')} - Next.js & Supabase & TailwindCSS</p> */}
      </footer>
    </div>
  )
}
