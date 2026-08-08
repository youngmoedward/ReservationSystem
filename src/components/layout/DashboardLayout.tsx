'use client'

import React, { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { Calendar, List, Settings, Users, LogIn, LogOut, BarChart3, ShieldAlert, Layers, ShieldCheck, Clock } from 'lucide-react'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentUser, setCurrentUser, users, logout } = useUserSim()
  const { language, setLanguage, t } = useLanguage()

  // 1. [권한 가드]: 권한별 페이지 접근 제한 (Manager 권한 페이지: therapist, employee, history, stats, priority, role)
  // Leader는 staff와 동일한 메뉴 접근 권한 적용
  useEffect(() => {
    const isManagerPage = ['/therapist', '/employee', '/history', '/stats', '/priority', '/role'].includes(pathname)
    if ((currentUser.role === 'staff' || currentUser.role === 'leader') && isManagerPage) {
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
    if (role === 'manager') return t('user.role.manager') || '관리자'
    if (role === 'leader') return t('user.role.leader') || '스태프 리더'
    if (role === 'staff') return t('user.role.staff') || '직원'
    if (role === 'msg1') return '건식 마사지사'
    if (role === 'msg2') return '습식 마사지사'
    return t('user.role.therapist') || '마사지사'
  }

  return (
    <div className="min-h-screen text-stone-800 flex flex-col relative bg-[#faf7f0]">
      {/* 1. 배경 이미지 전용 fixed 레이어 (z-[-2]) - bg-fixed 뷰포트 버그 방지 */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat z-[-2] pointer-events-none"
        style={{ backgroundImage: 'url("/dashboard_massage_bg.png")' }}
      />
      {/* 2. 은은하게 덮어주는 크림색 투명 마스크 레이어 (z-[-1]) */}
      <div className="fixed inset-0 bg-[#faf7f0]/80 backdrop-blur-[1px] pointer-events-none z-[-1]" />

      {/* 상단 권한 시뮬레이터 및 헤더 */}
      <header className="border-b border-stone-300 bg-[#f3edd7]/90 backdrop-blur-md sticky top-0 z-40 p-4 shadow-sm relative">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-stone-950 p-1 rounded-xl shadow-md border border-stone-800 flex items-center justify-center">
              <img src="/logo.png" alt="Riviera Health Spa Logo" className="w-full h-full object-contain" />
            </div>
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
              <span className={`w-2.5 h-2.5 rounded-full ${currentUser.role === 'manager'
                ? 'bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.5)]'
                : currentUser.role === 'leader'
                  ? 'bg-emerald-600 shadow-[0_0_8px_rgba(5,150,105,0.5)]'
                  : currentUser.role === 'staff'
                    ? 'bg-sky-600 shadow-[0_0_8px_rgba(2,132,199,0.5)]'
                    : 'bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.5)]'
                }`} />
              <span className="text-xs font-black text-stone-800">
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
              onClick={() => navigateTo('/today-schedule')}
              className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/today-schedule'
                ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                }`}
            >
              <Layers className="w-4 h-4" /> {t('nav.today_schedule')}
            </button>
            <button
              onClick={() => navigateTo('/')}
              className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/'
                ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                }`}
            >
              <Calendar className="w-4 h-4" /> {t('nav.calendar')}
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

            <button
              onClick={() => navigateTo('/dashboard/operating-hours')}
              className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/dashboard/operating-hours'
                ? 'bg-white border-stone-300 text-emerald-800 shadow-sm'
                : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                }`}
            >
              <Clock className="w-4 h-4" /> {t('nav.operating_hours')}
            </button>

            {/* [권한별 분기] Manager인 경우 요금관리 좌측에 권한 관리 메뉴 배치 */}
            {currentUser.role === 'manager' && (
              <button
                onClick={() => navigateTo('/role')}
                className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/role'
                  ? 'bg-white border-stone-300 text-purple-900 shadow-sm ring-1 ring-purple-400/40'
                  : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                  }`}
              >
                <ShieldCheck className="w-4 h-4 text-purple-700" /> {t('nav.role')}
              </button>
            )}

            {/* 요금 관리 (Manager 전용 메뉴로 수정) */}
            {currentUser.role === 'manager' && (
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

            {/* [권한별 분기] Manager인 경우 요금관리 우측에 우선순위 관리 메뉴 배치 */}
            {currentUser.role === 'manager' && (
              <button
                onClick={() => navigateTo('/priority')}
                className={`inline-flex items-center gap-1.5 flex-shrink-0 px-4 py-2 text-xs font-bold rounded-xl border transition-all ${pathname === '/priority'
                  ? 'bg-white border-stone-300 text-purple-900 shadow-sm ring-1 ring-purple-400/40'
                  : 'bg-transparent border-transparent text-stone-700 hover:text-stone-900 hover:bg-stone-50/40'
                  }`}
              >
                <Layers className="w-4 h-4 text-purple-700" /> {t('nav.priority')}
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
