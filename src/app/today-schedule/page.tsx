'use client'

import React, { useEffect, useState } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { toLocalDateString, toUIDateString } from '@/utils/booking/dateUtils'
import { Layers, User, Award, Clock, ChevronLeft, ChevronRight, Plus, Key } from 'lucide-react'
import BookingModal from '@/components/dashboard/BookingModal'
import { Therapist, Reservation } from '@/components/dashboard/CalendarView'

// 요금제 인터페이스
interface PricingPlan {
  id: number
  name_ko: string
  name_en: string
  category: 'wet' | 'dry' | 'combo'
  duration_minutes: number
  weight: number
  massage_price?: number
  massage_duration_minutes?: number
  massage_weight?: number
  bath_price?: number
  bath_duration_minutes?: number
  bath_weight?: number
}

export default function TodaySchedulePage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { language, t } = useLanguage()

  // 데이터 상태
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([])
  const [dailyPoints, setDailyPoints] = useState<Record<number, number>>({})
  const [prioritiesState, setPrioritiesState] = useState<Record<number, Record<string, string>>>({})
  const [schedulesState, setSchedulesState] = useState<Record<number, string>>({})
  const [currentTherapistType, setCurrentTherapistType] = useState<'wet' | 'dry' | 'both' | null>(null)
  const [loading, setLoading] = useState(true)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<any>(null)
  const [initialTime, setInitialTime] = useState<Date | null>(null)
  const [initialTherapistId, setInitialTherapistId] = useState<number | null>(null)

  // 조회 대상 날짜 상태 (기본값: 오늘)
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateString(new Date()))

  // 날짜 이동 헬퍼 함수
  const changeDate = (days: number) => {
    const parts = selectedDate.split('-').map(Number)
    if (parts.length !== 3) return
    const [y, m, d] = parts
    const current = new Date(y, m - 1, d)
    current.setDate(current.getDate() + days)
    setSelectedDate(toLocalDateString(current))
  }

  const setToday = () => {
    setSelectedDate(toLocalDateString(new Date()))
  }

  // 요일 결합 날짜 표시 문자열 변환
  const getDisplayDateWithDay = (dateStr: string) => {
    const parts = dateStr.split('-').map(Number)
    if (parts.length !== 3) return dateStr
    const [y, m, d] = parts
    const dateObj = new Date(y, m - 1, d)
    
    const uiDate = toUIDateString(dateStr)
    const daysKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
    const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    const dayLabel = language === 'ko' ? daysKo[dateObj.getDay()] : daysEn[dateObj.getDay()]
    return `${uiDate} (${dayLabel})`
  }

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // 1. 마사지사 목록 조회
        const { data: thData } = await supabase
          .from('therapists')
          .select('id, name, massage_type, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true })

        const activeTherapists = thData || []
        setTherapists(activeTherapists as any[])

        // 2. 만약 현재 사용자가 therapist 권한인 경우 본인의 massage_type 확인
        if (currentUser.role === 'msg1') {
          setCurrentTherapistType('dry')
        } else if (currentUser.role === 'msg2') {
          setCurrentTherapistType('wet')
        } else if (currentUser.role === 'therapist' && currentUser.therapistId) {
          const myProfile = activeTherapists.find(t => t.id === currentUser.therapistId)
          if (myProfile) {
            setCurrentTherapistType(myProfile.massage_type)
          } else {
            const { data: myDbProfile } = await supabase
              .from('therapists')
              .select('massage_type')
              .eq('id', currentUser.therapistId)
              .single()
            if (myDbProfile) {
              setCurrentTherapistType(myDbProfile.massage_type)
            }
          }
        }

        // 브라우저 로컬 오프셋 계산
        const tzo = -new Date().getTimezoneOffset()
        const dif = tzo >= 0 ? '+' : '-'
        const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
        const offset = `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`

        const startOfDay = `${selectedDate}T00:00:00${offset}`
        const endOfDay = `${selectedDate}T23:59:59${offset}`
        
        const { data: resData } = await supabase
          .from('reservations')
          .select('id, customer_name, customer_phone, therapist_id, secondary_therapist_id, pricing_plan_id, start_time, end_time, price, status, is_checked_in, locker_number')
          .eq('status', 'confirmed')
          .gte('start_time', startOfDay)
          .lte('start_time', endOfDay)

        setReservations((resData || []) as any[])

        // 4. 요금제 정보 조회
        const { data: planData } = await supabase
          .from('pricing_plans')
          .select('*')
        setPricingPlans(planData || [])

        // 5. 누적 포인트 조회 (선택된 날짜 기준)
        const { data: pointsData } = await supabase
          .from('therapist_daily_points')
          .select('therapist_id, points')
          .eq('date', selectedDate)

        const ptsMap: Record<number, number> = {}
        if (pointsData) {
          pointsData.forEach(p => {
            ptsMap[p.therapist_id] = Number(p.points)
          })
        }
        setDailyPoints(ptsMap)

        // 6. 요일 우선순위 및 휴무 일정 동시 로드
        const parts = selectedDate.split('-').map(Number)
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2])
        const jsDay = dateObj.getDay()
        const dbDayOfWeek = jsDay === 0 ? 6 : jsDay - 1

        const { data: priData } = await supabase
          .from('therapist_priorities')
          .select('therapist_id, service_type, priority_val')
          .eq('day_of_week', dbDayOfWeek)

        const { data: schedData } = await supabase
          .from('therapist_schedule')
          .select('therapist_id, availability_type')
          .eq('date', selectedDate)

        const priMap: Record<number, Record<string, string>> = {}
        if (priData) {
          priData.forEach(p => {
            if (!priMap[p.therapist_id]) priMap[p.therapist_id] = {}
            priMap[p.therapist_id][p.service_type] = p.priority_val
          })
        }
        setPrioritiesState(priMap)

        const schedMap: Record<number, string> = {}
        if (schedData) {
          schedData.forEach(s => {
            schedMap[s.therapist_id] = s.availability_type
          })
        }
        setSchedulesState(schedMap)

      } catch (err) {
        console.error('Failed to load today work schedule data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase, currentUser, selectedDate])

  // 특정 마사지사의 특정 요일 우선순위 및 휴무 여부 텍스트 반환
  const getTherapistStatus = (therapistId: number, serviceType: 'wet' | 'dry') => {
    const schedType = schedulesState[therapistId]
    const pVal = prioritiesState[therapistId]?.[serviceType]

    // 휴무 판정 (availability_type가 off이거나, priorities_val이 'x'인 경우)
    const isOff = schedType === 'off' || pVal === 'x'

    let label = ''
    if (isOff) {
      label = language === 'ko' ? '(휴무)' : '(Off)'
    } else if (schedType === 'am_half') {
      label = language === 'ko' ? '(오전반차)' : '(AM Off)'
    } else if (schedType === 'pm_half') {
      label = language === 'ko' ? '(오후반차)' : '(PM Off)'
    } else if (pVal) {
      label = `(P: ${pVal})`
    }

    return {
      isOff,
      label
    }
  }

  // 콤보 및 단일 요금제 포인트 상세 계산 도우미
  const getReservationPoint = (res: Reservation, plan: PricingPlan, therapistId: number) => {
    if (plan.category === 'combo') {
      if (res.therapist_id === therapistId) {
        return plan.massage_weight || 1.0
      } else if (res.secondary_therapist_id === therapistId) {
        return plan.bath_weight || 1.0
      }
    } else {
      if (res.therapist_id === therapistId) {
        return plan.weight || 1.0
      }
    }
    return 0
  }

  // 콤보 및 단일 요금제 시간대 계산 도우미
  const getFormattedTimeAndPlan = (res: Reservation, plan: PricingPlan, therapistId: number) => {
    let start = new Date(res.start_time)
    let end = new Date(res.end_time)
    let priceVal = res.price
    let duration = plan.duration_minutes

    if (plan.category === 'combo') {
      const bathDur = plan.bath_duration_minutes || 60
      const massageDur = plan.massage_duration_minutes || 60

      if (res.secondary_therapist_id === therapistId) {
        end = new Date(start.getTime() + bathDur * 60000)
        priceVal = plan.bath_price || 0
        duration = bathDur
      } else if (res.therapist_id === therapistId) {
        start = new Date(start.getTime() + (bathDur + 30) * 60000)
        end = new Date(start.getTime() + massageDur * 60000)
        priceVal = plan.massage_price || 0
        duration = massageDur
      }
    }

    const pad = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`
    
    return {
      timeStr,
      priceStr: `${priceVal}(${duration}m)`,
      durationStr: `${duration}분`,
      planName: language === 'ko' ? plan.name_ko : plan.name_en
    }
  }

  // 특정 마사지사의 오늘 일정 목록 계산
  const getTherapistReservations = (therapistId: number) => {
    return reservations
      .filter(res => res.therapist_id === therapistId || res.secondary_therapist_id === therapistId)
      .map(res => {
        const plan = pricingPlans.find(p => p.id === res.pricing_plan_id)
        if (!plan) return null
        
        const pt = getReservationPoint(res, plan, therapistId)
        const info = getFormattedTimeAndPlan(res, plan, therapistId)
        
        return {
          id: res.id,
          customerName: res.customer_name,
          point: pt,
          rawReservation: res,
          ...info
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.timeStr.localeCompare(b.timeStr))
  }

  const canModify = currentUser.role === 'manager' || currentUser.role === 'staff' || currentUser.role === 'leader'

  const handleRowClick = (rawRes: any) => {
    if (!canModify) return
    setSelectedReservation(rawRes)
    setInitialTime(null)
    setInitialTherapistId(null)
    setIsWalkIn(false)
    setIsBookingModalOpen(true)
  }

  const handleNewBookingClick = (thId: number, isOff: boolean) => {
    if (!canModify || isOff) return
    
    const parts = selectedDate.split('-').map(Number)
    const targetTime = new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0)
    
    setSelectedReservation(null)
    setInitialTime(targetTime)
    setInitialTherapistId(thId)
    setIsWalkIn(false)
    setIsBookingModalOpen(true)
  }

  const handleTopNewBookingClick = () => {
    if (!canModify) return
    
    const parts = selectedDate.split('-').map(Number)
    const targetTime = new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0)
    
    setSelectedReservation(null)
    setInitialTime(targetTime)
    setInitialTherapistId(null)
    setIsWalkIn(false)
    setIsBookingModalOpen(true)
  }

  const handleTopWalkInClick = () => {
    if (!canModify) return
    
    const parts = selectedDate.split('-').map(Number)
    const targetTime = new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0)
    
    setSelectedReservation(null)
    setInitialTime(targetTime)
    setInitialTherapistId(null)
    setIsWalkIn(true)
    setIsBookingModalOpen(true)
  }

  // 권한별 노출 스키마 분기
  const isTherapistUser = currentUser.role === 'therapist' || currentUser.role === 'msg1' || currentUser.role === 'msg2'
  const show1F = !isTherapistUser || currentTherapistType === 'wet' || currentTherapistType === 'both'
  const show2F = !isTherapistUser || currentTherapistType === 'dry' || currentTherapistType === 'both'

  // 마사지사 목록 필터링 및 우선순위 정렬
  const sortTherapistsByPriority = (therapistsList: Therapist[], serviceType: 'wet' | 'dry') => {
    return [...therapistsList].sort((a, b) => {
      const schedTypeA = schedulesState[a.id]
      const pValA = prioritiesState[a.id]?.[serviceType]
      const isOffA = schedTypeA === 'off' || pValA === 'x'

      const schedTypeB = schedulesState[b.id]
      const pValB = prioritiesState[b.id]?.[serviceType]
      const isOffB = schedTypeB === 'off' || pValB === 'x'

      // 1. 휴무 여부 비교 (휴무면 뒤로)
      if (isOffA && !isOffB) return 1
      if (!isOffA && isOffB) return -1

      // 2. 우선순위 값 비교 (P: 1이 제일 높은 우선순위이므로 오름차순)
      const aNum = pValA && pValA !== 'x' ? parseInt(pValA, 10) : 9999
      const bNum = pValB && pValB !== 'x' ? parseInt(pValB, 10) : 9999

      if (aNum !== bNum) {
        return aNum - bNum
      }

      // 3. 이름순 정렬
      return a.name.localeCompare(b.name)
    })
  }

  const rawWetTherapists = therapists.filter(t => t.massage_type === 'wet' || t.massage_type === 'both')
  const rawDryTherapists = therapists.filter(t => t.massage_type === 'dry' || t.massage_type === 'both')

  const wetTherapists = sortTherapistsByPriority(rawWetTherapists, 'wet')
  const dryTherapists = sortTherapistsByPriority(rawDryTherapists, 'dry')

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-stone-500">{t('user.syncing')}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 타이틀 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#f3edd7]/90 border border-stone-300 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-800 text-white rounded-xl shadow-md border border-emerald-950 flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-stone-800">
                {language === 'ko' ? '오늘의 근무 현황' : "Today's Work schedule"}
              </h2>
              <p className="text-xs text-stone-500 font-mono font-medium">
                {language === 'ko' ? '기준일별 확정 일정만 반영됨' : 'Confirmed schedules only'}
              </p>
            </div>
          </div>

          {/* 날짜 이동 컨트롤러 */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center bg-[#e8dec7] border border-stone-300 rounded-xl p-0.5 shadow-sm">
              <button
                onClick={() => changeDate(-1)}
                className="p-1.5 rounded-lg hover:bg-white text-stone-700 hover:text-stone-900 transition-all cursor-pointer"
                title={language === 'ko' ? '이전일' : 'Previous Day'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => changeDate(1)}
                className="p-1.5 rounded-lg hover:bg-white text-stone-700 hover:text-stone-900 transition-all cursor-pointer"
                title={language === 'ko' ? '다음일' : 'Next Day'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={setToday}
              className="px-3.5 py-1.5 rounded-xl bg-[#e8dec7] hover:bg-white text-xs font-bold text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
            >
              {language === 'ko' ? '오늘' : 'Today'}
            </button>

            <div className="bg-white border border-stone-300 px-4 py-1.5 rounded-xl shadow-inner font-mono text-xs font-black text-stone-850">
              {getDisplayDateWithDay(selectedDate)}
            </div>

            {canModify && (
              <div className="flex gap-2 ml-auto sm:ml-0">
                <button
                  onClick={handleTopNewBookingClick}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white shadow-sm shadow-emerald-900/10 px-4 py-2 text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> {language === 'ko' ? '신규 예약 접수' : 'New Booking'}
                </button>
                <button
                  onClick={handleTopWalkInClick}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-600 active:scale-95 text-white shadow-sm shadow-sky-900/10 px-4 py-2 text-xs font-bold transition-all cursor-pointer"
                >
                  <Key className="w-4 h-4" /> {language === 'ko' ? 'Walk-in 접수' : 'Walk-In'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 1F 습식 마사지 섹션 */}
        {show1F && (
          <div className="bg-[#faf7f0]/95 border border-stone-300 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
              <span className="bg-sky-600 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider">
                1F
              </span>
              <h3 className="text-sm font-extrabold text-sky-850">
                {language === 'ko' ? '🧴 1층 습식 마사지 (Wet Massage)' : '🧴 1F Wet Massage Services'}
              </h3>
            </div>

            {wetTherapists.length === 0 ? (
              <p className="text-xs text-stone-400 py-4 text-center">
                {language === 'ko' ? '등록된 습식 마사지사가 없습니다.' : 'No registered wet therapists.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-1.5">
                {wetTherapists.map((th, index) => {
                  const items = getTherapistReservations(th.id)
                  const totalPt = items.reduce((sum, item) => sum + (item?.point || 0), 0)
                  const { isOff, label: statusLabel } = getTherapistStatus(th.id, 'wet')
                  return (
                    <div
                      key={th.id}
                      className={`w-full min-w-0 bg-white border border-stone-200 rounded-xl p-2 shadow-sm space-y-2 hover:border-sky-300 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${isOff ? 'opacity-65' : ''}`}
                    >
                      <div className="flex items-center justify-between bg-sky-50/50 border border-sky-100 rounded-lg p-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-5 h-5 bg-sky-600 text-white rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm flex-shrink-0">
                            <User className="w-3 h-3" />
                          </div>
                          <span className="text-[11px] font-black text-stone-850 truncate">{th.name}</span>
                          {statusLabel && (
                            <span className={`text-[9px] font-bold flex-shrink-0 ${isOff ? 'text-rose-600' : 'text-stone-500'}`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canModify && !isOff && (
                            <button
                              onClick={() => handleNewBookingClick(th.id, isOff)}
                              className="w-4.5 h-4.5 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-md flex items-center justify-center shadow transition-all cursor-pointer"
                              title={language === 'ko' ? '신규 예약 접수' : 'New Booking'}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                          <div className="bg-sky-100/80 border border-sky-200/50 rounded px-1.5 py-0.5 font-mono font-black text-[10px] text-sky-800">
                            {totalPt}
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden border border-stone-150 rounded-xl">
                        <table className="w-full text-left border-collapse table-fixed">
                          <thead>
                            <tr className="bg-stone-50 text-[10px] font-black text-stone-400 uppercase border-b border-stone-150">
                              <th className="p-1.5 w-[20%] text-center border-r border-stone-150">🔑</th>
                              <th className="p-1.5 w-[25%] text-center border-r border-stone-150">Time</th>
                              <th className="p-1.5 w-[37%] border-r border-stone-150 text-center">Price</th>
                              <th className="p-1.5 w-[18%] text-center">Pt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {items.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-[10.5px] text-stone-400 font-bold bg-stone-50/30">
                                  {isOff ? (language === 'ko' ? '휴무' : 'Off') : (language === 'ko' ? '비어있음' : 'Empty')}
                                </td>
                              </tr>
                            ) : (
                              items.map(item => {
                                const isCheckedIn = !!item.rawReservation.is_checked_in
                                const lockerNo = item.rawReservation.locker_number
                                return (
                                  <tr
                                    key={item.id}
                                    onClick={() => handleRowClick(item.rawReservation)}
                                    className={`transition-all ${
                                      isCheckedIn
                                        ? 'bg-emerald-50 text-emerald-950 border-y border-emerald-250/30 hover:bg-emerald-100/85 font-medium'
                                        : canModify
                                        ? 'cursor-pointer hover:bg-sky-50/40'
                                        : ''
                                    }`}
                                    title={
                                      language === 'ko'
                                        ? `예약자: ${item.customerName}`
                                        : `Client: ${item.customerName}`
                                    }
                                  >
                                    <td className="p-1.5 text-center border-r border-stone-100 text-[10.5px] font-bold text-stone-700">
                                      {isCheckedIn && lockerNo ? (
                                        <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-50 text-emerald-850 border border-emerald-100/50 text-[10px] font-black leading-none">
                                          {lockerNo}
                                        </span>
                                      ) : (
                                        <span className="text-stone-300">-</span>
                                      )}
                                    </td>
                                    <td className="p-1.5 text-center font-mono text-[11px] font-black text-sky-850 border-r border-stone-100">
                                      {item.timeStr}
                                    </td>
                                    <td className="p-1.5 text-center font-mono text-[10.5px] font-bold text-stone-700 border-r border-stone-100">
                                      {item.priceStr}
                                    </td>
                                    <td className="py-1.5 px-0 text-center font-mono text-[11px] font-black text-sky-600 bg-sky-50/10">
                                      {item.point}
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 2F 건식 마사지 섹션 */}
        {show2F && (
          <div className="bg-[#faf7f0]/95 border border-stone-300 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
              <span className="bg-amber-600 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider">
                2F
              </span>
              <h3 className="text-sm font-extrabold text-amber-850">
                {language === 'ko' ? '🧘‍♂️ 2층 건식 마사지 (Dry Massage)' : '🧘‍♂️ 2F Dry Massage Services'}
              </h3>
            </div>

            {dryTherapists.length === 0 ? (
              <p className="text-xs text-stone-400 py-4 text-center">
                {language === 'ko' ? '등록된 건식 마사지사가 없습니다.' : 'No registered dry therapists.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-1.5">
                {dryTherapists.map((th, index) => {
                  const items = getTherapistReservations(th.id)
                  const totalPt = items.reduce((sum, item) => sum + (item?.point || 0), 0)
                  const { isOff, label: statusLabel } = getTherapistStatus(th.id, 'dry')
                  return (
                    <div
                      key={th.id}
                      className={`w-full min-w-0 bg-white border border-stone-200 rounded-xl p-2 shadow-sm space-y-2 hover:border-amber-300 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${isOff ? 'opacity-65' : ''}`}
                    >
                      <div className="flex items-center justify-between bg-amber-50/50 border border-amber-100 rounded-lg p-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-5 h-5 bg-amber-600 text-white rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm flex-shrink-0">
                            <User className="w-3 h-3" />
                          </div>
                          <span className="text-[11px] font-black text-stone-850 truncate">{th.name}</span>
                          {statusLabel && (
                            <span className={`text-[9px] font-bold flex-shrink-0 ${isOff ? 'text-rose-600' : 'text-stone-500'}`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canModify && !isOff && (
                            <button
                              onClick={() => handleNewBookingClick(th.id, isOff)}
                              className="w-4.5 h-4.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-md flex items-center justify-center shadow transition-all cursor-pointer"
                              title={language === 'ko' ? '신규 예약 접수' : 'New Booking'}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                          <div className="bg-amber-100/80 border border-amber-200/50 rounded px-1.5 py-0.5 font-mono font-black text-[10px] text-amber-855">
                            {totalPt}
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden border border-stone-150 rounded-xl">
                        <table className="w-full text-left border-collapse table-fixed">
                          <thead>
                            <tr className="bg-stone-50 text-[10px] font-black text-stone-400 uppercase border-b border-stone-150">
                              <th className="p-1.5 w-[20%] text-center border-r border-stone-150">🔑</th>
                              <th className="p-1.5 w-[25%] text-center border-r border-stone-150">Time</th>
                              <th className="p-1.5 w-[37%] border-r border-stone-150 text-center">Price</th>
                              <th className="p-1.5 w-[18%] text-center">Pt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {items.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-[10.5px] text-stone-400 font-bold bg-stone-50/30">
                                  {isOff ? (language === 'ko' ? '휴무' : 'Off') : (language === 'ko' ? '비어있음' : 'Empty')}
                                </td>
                              </tr>
                            ) : (
                              items.map(item => {
                                const isCheckedIn = !!item.rawReservation.is_checked_in
                                const lockerNo = item.rawReservation.locker_number
                                return (
                                  <tr
                                    key={item.id}
                                    onClick={() => handleRowClick(item.rawReservation)}
                                    className={`transition-all ${
                                      isCheckedIn
                                        ? 'bg-emerald-50 text-emerald-950 border-y border-emerald-250/30 hover:bg-emerald-100/85 font-medium'
                                        : canModify
                                        ? 'cursor-pointer hover:bg-amber-50/30'
                                        : ''
                                    }`}
                                    title={
                                      language === 'ko'
                                        ? `예약자: ${item.customerName}`
                                        : `Client: ${item.customerName}`
                                    }
                                  >
                                    <td className="p-1.5 text-center border-r border-stone-100 text-[10.5px] font-bold text-stone-700">
                                      {isCheckedIn && lockerNo ? (
                                        <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-50 text-emerald-850 border border-emerald-100/50 text-[10px] font-black leading-none">
                                          {lockerNo}
                                        </span>
                                      ) : (
                                        <span className="text-stone-300">-</span>
                                      )}
                                    </td>
                                    <td className="p-1.5 text-center font-mono text-[11px] font-black text-amber-850 border-r border-stone-100">
                                      {item.timeStr}
                                    </td>
                                    <td className="p-1.5 text-center font-mono text-[10.5px] font-bold text-stone-700 border-r border-stone-100">
                                      {item.priceStr}
                                    </td>
                                    <td className="py-1.5 px-0 text-center font-mono text-[11px] font-black text-amber-600 bg-amber-50/10">
                                      {item.point}
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {isBookingModalOpen && (
        <BookingModal
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          onSuccess={() => {
            window.location.reload()
          }}
          selectedReservation={selectedReservation}
          initialTime={initialTime}
          initialTherapistId={initialTherapistId}
          defaultDate={selectedDate}
          supabase={supabase}
          therapists={therapists}
          reservations={reservations}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          isWalkIn={isWalkIn}
        />
      )}
    </DashboardLayout>
  )
}
