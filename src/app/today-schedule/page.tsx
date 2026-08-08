'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { createClient } from '@/utils/supabase/client'
import { useUserSim, UserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { toLocalDateString, toUIDateString } from '@/utils/booking/dateUtils'
import { Layers, User, Award, Clock, ChevronLeft, ChevronRight, Plus, Key, List } from 'lucide-react'
import BookingModal from '@/components/dashboard/BookingModal'
import TodayReservationListModal from '@/components/dashboard/TodayReservationListModal'
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
  const [employees, setEmployees] = useState<UserSim[]>([])
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([])
  const [dailyPoints, setDailyPoints] = useState<Record<number, number>>({})
  const [prioritiesState, setPrioritiesState] = useState<Record<number, Record<string, string>>>({})
  const [schedulesState, setSchedulesState] = useState<Record<number, string>>({})
  const [currentTherapistType, setCurrentTherapistType] = useState<'wet' | 'dry' | 'both' | null>(null)
  const [loading, setLoading] = useState(true)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isReservationListModalOpen, setIsReservationListModalOpen] = useState(false)
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<any>(null)
  const [initialTime, setInitialTime] = useState<Date | null>(null)
  const [initialTherapistId, setInitialTherapistId] = useState<number | null>(null)
  const [activeFloorTab, setActiveFloorTab] = useState<'wet' | 'dry'>('wet')
  const dateInputRef = useRef<HTMLInputElement>(null)

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

  const fetchData = useCallback(async () => {
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
        .select('*')
        .in('status', ['confirmed', 'assigned'])
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)

      setReservations((resData || []) as any[])

      // 4. 요금제 정보 조회
      const { data: planData } = await supabase
        .from('pricing_plans')
        .select('*')
      setPricingPlans(planData || [])

      // 4.5. 직원 목록 조회
      const { data: empData } = await supabase
        .from('employee')
        .select('id, name, role')
      if (empData) setEmployees(empData as UserSim[])

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
  }, [supabase, currentUser, selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
      label = `(Priority : ${pVal})`
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
      priceStr: `${priceVal}`,
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
        const isRequested = res.therapist_id === therapistId 
          ? !!res.is_requested 
          : !!res.is_requested_secondary

        // 파트별 배정 상태 판별
        const isPrimary = res.therapist_id === therapistId
        const isPartAssigned = isPrimary
          ? !!(res.is_primary_assigned || res.status === 'assigned')
          : !!res.is_secondary_assigned
        
        return {
          id: res.id,
          customerName: res.customer_name,
          point: pt,
          isRequested,
          isPartAssigned,
          rawReservation: res,
          ...info
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.timeStr.localeCompare(b.timeStr))
  }

  // 배정 확정 시간 범위 상태 (기본값: 현재 시간 ~ 30분 뒤)
  const getInitialTimes = () => {
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const from = `${p(now.getHours())}:${p(now.getMinutes())}`
    const toDate = new Date(now.getTime() + 30 * 60000)
    const to = `${p(toDate.getHours())}:${p(toDate.getMinutes())}`
    return { from, to }
  }

  const [assignFromTime, setAssignFromTime] = useState<string>(() => getInitialTimes().from)
  const [assignToTime, setAssignToTime] = useState<string>(() => getInitialTimes().to)

  const canModify = currentUser.role === 'manager' || currentUser.role === 'staff' || currentUser.role === 'leader'

  const handleRowClick = (rawRes: any, therapistId?: number) => {
    if (!canModify) return

    // 파트별 수정 차단 (콤보 예약은 파트 단위로 독립 관리)
    if (rawRes.status === 'assigned') {
      alert(language === 'ko' ? '배정 확정된 예약은 수정할 수 없습니다.' : 'Assigned bookings cannot be modified.')
      return
    }
    if (therapistId && rawRes.secondary_therapist_id) {
      // 콤보 예약 파트별 체크
      if (therapistId === rawRes.secondary_therapist_id && rawRes.is_secondary_assigned) {
        alert(language === 'ko' ? '배정 확정된 습식 파트는 수정할 수 없습니다.' : 'Assigned wet part cannot be modified.')
        return
      }
      if (therapistId === rawRes.therapist_id && rawRes.is_primary_assigned) {
        alert(language === 'ko' ? '배정 확정된 건식 파트는 수정할 수 없습니다.' : 'Assigned dry part cannot be modified.')
        return
      }
    } else if (rawRes.is_primary_assigned) {
      // 단일 요금제
      alert(language === 'ko' ? '배정 확정된 예약은 수정할 수 없습니다.' : 'Assigned bookings cannot be modified.')
      return
    }

    setSelectedReservation(rawRes)
    setInitialTime(null)
    setInitialTherapistId(null)
    setIsWalkIn(false)
    setIsBookingModalOpen(true)
  }

  // 배정 확정 시간 일괄 로킹 처리 (체크인 건만, 콤보 파트별 독립)
  const handleBatchAssign = async () => {
    if (!canModify) return
    if (!assignFromTime || !assignToTime) {
      alert(language === 'ko' ? '배정 확정 시간을 선택해 주세요.' : 'Please select assignment time range.')
      return
    }

    const tzo = -new Date().getTimezoneOffset()
    const dif = tzo >= 0 ? '+' : '-'
    const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
    const offset = `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`

    const fromISO = `${selectedDate}T${assignFromTime}:00${offset}`
    const toISO = `${selectedDate}T${assignToTime}:59${offset}`

    const fromMs = new Date(fromISO).getTime()
    const toMs = new Date(toISO).getTime()

    // 체크인 상태인 confirmed 건만 대상
    const checkedInReservations = reservations.filter(r =>
      r.status === 'confirmed' && r.is_checked_in === true
    )

    // 각 예약별로 파트 단위 업데이트 payload 결정
    type AssignUpdate = { id: number; payload: Record<string, any>; partLabel: string }
    const updates: AssignUpdate[] = []

    checkedInReservations.forEach(r => {
      const plan = pricingPlans.find(p => p.id === r.pricing_plan_id)
      const isCombo = plan?.category === 'combo'
      const startMs = new Date(r.start_time).getTime()

      if (isCombo && plan) {
        const bathDur = plan.bath_duration_minutes || 60
        const delayMin = (r as any).delay_minutes ?? 30
        const dryStartMs = startMs + (bathDur + delayMin) * 60000

        let assignPrimary = false
        let assignSecondary = false

        // 습식(secondary) 시작시간 체크
        if (startMs >= fromMs && startMs <= toMs && !r.is_secondary_assigned) {
          assignSecondary = true
        }
        // 건식(primary) 시작시간 체크
        if (dryStartMs >= fromMs && dryStartMs <= toMs && !r.is_primary_assigned) {
          assignPrimary = true
        }

        if (assignPrimary || assignSecondary) {
          const payload: Record<string, any> = {}
          const parts: string[] = []
          if (assignSecondary) { payload.is_secondary_assigned = true; parts.push('습식') }
          if (assignPrimary) { payload.is_primary_assigned = true; parts.push('건식') }

          // 양쪽 모두 배정 완료 시 status도 변경
          const willBothAssigned =
            (assignPrimary || !!r.is_primary_assigned) &&
            (assignSecondary || !!r.is_secondary_assigned)
          if (willBothAssigned) payload.status = 'assigned'

          updates.push({ id: r.id, payload, partLabel: parts.join('+') })
        }
      } else {
        // 단일 요금제
        if (startMs >= fromMs && startMs <= toMs && !r.is_primary_assigned) {
          updates.push({
            id: r.id,
            payload: { is_primary_assigned: true, status: 'assigned' },
            partLabel: '전체'
          })
        }
      }
    })

    if (updates.length === 0) {
      alert(language === 'ko' ? '해당 시간 범위 내에 배정할 체크인 예약이 없습니다.' : 'No checked-in bookings found in selected time range.')
      return
    }

    const confirmMsg = language === 'ko'
      ? `${updates.length}건의 예약 파트를 '배정' 상태로 확정하시겠습니까?\n(배정 후에는 해당 파트의 수정이 불가합니다.)`
      : `Lock ${updates.length} booking part(s) into 'Assigned' status?\n(Once assigned, edits will be disabled.)`

    if (!confirm(confirmMsg)) return

    try {
      setLoading(true)

      // 각 예약별로 개별 업데이트 (payload가 다르므로)
      for (const upd of updates) {
        const { error } = await supabase
          .from('reservations')
          .update(upd.payload)
          .eq('id', upd.id)
        if (error) throw error
      }

      await supabase.from('reservation_logs').insert(
        updates.map(upd => ({
          reservation_id: upd.id,
          performed_by: null,
          action: 'update',
          log_type: 'reservation',
          details: `[수행자: ${currentUser.name}] 배정 확정 처리 [${upd.partLabel}] (${assignFromTime} ~ ${assignToTime})`
        }))
      )

      alert(language === 'ko' ? `${updates.length}건의 예약 파트가 '배정' 상태로 확정되었습니다.` : `${updates.length} booking part(s) assigned.`)

      // 로컬 상태 업데이트
      const updateMap = new Map(updates.map(u => [u.id, u.payload]))
      setReservations(prev => prev.map(r => {
        const p = updateMap.get(r.id)
        return p ? { ...r, ...p } as any : r
      }))
    } catch (err: any) {
      console.error('Failed to batch assign:', err)
      alert(err.message || 'Failed to update assignment status.')
    } finally {
      setLoading(false)
    }
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

            <div className="relative">
              <div
                onClick={() => dateInputRef.current?.showPicker()}
                className="bg-white border border-stone-300 px-4 py-1.5 rounded-xl shadow-inner font-mono text-xs font-black text-stone-850 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-all"
                title={language === 'ko' ? '클릭하여 날짜 선택' : 'Click to pick a date'}
              >
                {getDisplayDateWithDay(selectedDate)}
              </div>
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value) }}
                className="absolute inset-0 opacity-0 w-full h-full pointer-events-none"
                tabIndex={-1}
              />
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
                <button
                  onClick={() => setIsReservationListModalOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 active:scale-95 text-white shadow-sm shadow-amber-900/10 px-4 py-2 text-xs font-bold transition-all cursor-pointer"
                >
                  <List className="w-4 h-4" /> {language === 'ko' ? '예약 목록' : 'Reservation List'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 콘텐츠 영역: 탭으로 구분된 습식 / 건식 마사지사 판널 */}
        {(show1F || show2F) && (
          <div className="bg-[#faf7f0]/95 border border-stone-300 rounded-3xl shadow-sm overflow-hidden">

            {/* 탭 네비게이션 */}
            <div className="flex items-center gap-2.5 p-3.5 bg-stone-100/90 border-b border-stone-200">
              {show1F && (
                <button
                  onClick={() => setActiveFloorTab('wet')}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-black transition-all cursor-pointer ${
                    activeFloorTab === 'wet'
                      ? 'bg-gradient-to-r from-sky-600 to-sky-700 text-white shadow-md border border-sky-700 scale-[1.02]'
                      : 'bg-white text-stone-600 hover:text-sky-800 hover:bg-sky-50/50 border border-stone-250 shadow-xs opacity-85 hover:opacity-100'
                  }`}
                >
                  <span className={`text-xs px-2 py-0.5 rounded-md font-black transition-all ${
                    activeFloorTab === 'wet'
                      ? 'bg-white/25 text-white border border-white/30'
                      : 'bg-sky-50 text-sky-700 border border-sky-200/60'
                  }`}>1F</span>
                  <span>{language === 'ko' ? '🧴 습식 마사지 (Wet)' : '🧴 Wet Massage'}</span>
                </button>
              )}
              {show2F && (
                <button
                  onClick={() => setActiveFloorTab('dry')}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-black transition-all cursor-pointer ${
                    activeFloorTab === 'dry'
                      ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-md border border-amber-700 scale-[1.02]'
                      : 'bg-white text-stone-600 hover:text-amber-800 hover:bg-amber-50/50 border border-stone-250 shadow-xs opacity-85 hover:opacity-100'
                  }`}
                >
                  <span className={`text-xs px-2 py-0.5 rounded-md font-black transition-all ${
                    activeFloorTab === 'dry'
                      ? 'bg-white/25 text-white border border-white/30'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                  }`}>2F</span>
                  <span>{language === 'ko' ? '🧘‍♂️ 건식 마사지 (Dry)' : '🧘‍♂️ Dry Massage'}</span>
                </button>
              )}

              {/* 배정 확정 시간 & 배정 버튼 컨트롤러 */}
              {canModify && (
                <div className="ml-auto flex items-center gap-2 bg-white/90 border border-stone-300 px-3 py-1.5 rounded-xl shadow-xs text-xs">
                  <span className="font-extrabold text-stone-700 text-xs flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-stone-500" />
                    {language === 'ko' ? '배정 확정 시간:' : 'Lock Time:'}
                  </span>
                  <input
                    type="time"
                    value={assignFromTime}
                    onChange={(e) => setAssignFromTime(e.target.value)}
                    className="bg-stone-50 border border-stone-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                  <span className="text-stone-400 font-bold">~</span>
                  <input
                    type="time"
                    value={assignToTime}
                    onChange={(e) => setAssignToTime(e.target.value)}
                    className="bg-stone-50 border border-stone-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                  <button
                    onClick={handleBatchAssign}
                    className="px-3.5 py-1 bg-stone-900 hover:bg-black active:scale-95 text-white rounded-lg text-xs font-extrabold shadow-sm transition-all cursor-pointer border border-stone-950"
                  >
                    {language === 'ko' ? '배정' : 'Assign'}
                  </button>
                </div>
              )}
            </div>

            {/* 1F 습식 마사지 판널 */}
            {show1F && activeFloorTab === 'wet' && (
              <div className="p-5 space-y-4">
                {wetTherapists.length === 0 ? (
                  <p className="text-xs text-stone-400 py-4 text-center">
                    {language === 'ko' ? '등록된 습식 마사지사가 없습니다.' : 'No registered wet therapists.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-1.5">
                    {wetTherapists.map((th) => {
                      const items = getTherapistReservations(th.id)
                      const totalPt = items.reduce((sum, item) => sum + (item?.point || 0), 0)
                      const { isOff, label: statusLabel } = getTherapistStatus(th.id, 'wet')
                      return (
                        <div
                          key={th.id}
                          className={`w-full rounded-xl p-2 shadow-sm space-y-2 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                            isOff
                              ? 'bg-stone-100/60 border border-stone-250 opacity-40 grayscale-[25%]'
                              : 'bg-white border border-stone-200 hover:border-sky-300 hover:shadow-md'
                          }`}
                        >
                          <div className={`border rounded-lg p-1.5 space-y-1 ${
                            isOff ? 'bg-stone-100/80 border-stone-200/80' : 'bg-sky-50/50 border-sky-100'
                          }`}>
                            {/* 第一 Line: 이름만 */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className={`w-4 h-4 text-white rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm flex-shrink-0 ${
                                isOff ? 'bg-stone-400' : 'bg-sky-600'
                              }`}>
                                <User className="w-3 h-3" />
                              </div>
                              <span className={`text-xs truncate ${isOff ? 'text-stone-500 font-bold' : 'text-stone-850 font-black'}`} title={th.name}>
                                {th.name}
                              </span>
                            </div>
                            {/* 第二 Line: Priority & 포인트 (+ 버튼 제거) */}
                            <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-sky-100/60">
                              <div className="font-bold truncate">
                                {statusLabel ? (
                                  <span className={isOff ? 'text-rose-600 font-extrabold' : 'text-stone-500'}>
                                    {statusLabel}
                                  </span>
                                ) : (
                                  <span className="text-stone-400 font-medium">{language === 'ko' ? '기본' : 'Standard'}</span>
                                )}
                              </div>
                              <div className="bg-sky-100/80 border border-sky-200/50 rounded px-1.5 py-0.2 font-mono font-black text-[10px] text-sky-800 flex-shrink-0">
                                {totalPt} Pt
                              </div>
                            </div>
                          </div>

                          <div className="overflow-hidden border border-stone-150 rounded-xl">
                            <table className="w-full text-left border-collapse table-fixed">
                              <thead>
                                <tr className="bg-stone-50 text-[10px] font-black text-stone-400 uppercase border-b border-stone-150">
                                  <th className="p-1 w-[14%] text-center border-r border-stone-150" title={language === 'ko' ? '지정 배정' : 'Requested'}>ⓒ</th>
                                  <th className="p-1 w-[18%] text-center border-r border-stone-150">🔑</th>
                                  <th className="p-1 w-[26%] text-center border-r border-stone-150">Time</th>
                                  <th className="p-1 w-[26%] border-r border-stone-150 text-center">Price</th>
                                  <th className="p-1 w-[16%] text-center">Pt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100">
                                {items.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="p-3 text-center text-[10.5px] text-stone-400 font-bold bg-stone-50/30">
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
                                        onClick={() => handleRowClick(item.rawReservation, th.id)}
                                        className={`transition-all ${
                                          item.isPartAssigned
                                            ? 'bg-stone-100/80 text-stone-500 opacity-70'
                                            : isCheckedIn
                                            ? 'bg-emerald-50 text-emerald-950 border-y border-emerald-250/30 hover:bg-emerald-100/85 font-medium'
                                            : canModify
                                            ? 'cursor-pointer hover:bg-sky-50/40'
                                            : ''
                                        }`}
                                        title={language === 'ko' ? `예약자: ${item.customerName}` : `Client: ${item.customerName}`}
                                      >
                                        <td className="p-1 text-center border-r border-stone-100 text-[10.5px] font-bold text-stone-700">
                                          {item.isRequested ? (
                                            <span
                                              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black cursor-pointer"
                                              title={language === 'ko' ? `예약자: ${item.customerName}` : `Client: ${item.customerName}`}
                                            >
                                              ⓒ
                                            </span>
                                          ) : (
                                            <span className="text-stone-300">-</span>
                                          )}
                                        </td>
                                        <td className="p-1.5 text-center border-r border-stone-100 text-[10.5px] font-bold text-stone-750">
                                          {isCheckedIn && lockerNo ? (
                                            <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-50 text-emerald-855 border border-emerald-100/50 text-[9px] font-black leading-none">
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

            {/* 2F 건식 마사지 판널 */}
            {show2F && activeFloorTab === 'dry' && (
              <div className="p-5 space-y-4">
                {dryTherapists.length === 0 ? (
                  <p className="text-xs text-stone-400 py-4 text-center">
                    {language === 'ko' ? '등록된 건식 마사지사가 없습니다.' : 'No registered dry therapists.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-1.5">
                    {dryTherapists.map((th) => {
                      const items = getTherapistReservations(th.id)
                      const totalPt = items.reduce((sum, item) => sum + (item?.point || 0), 0)
                      const { isOff, label: statusLabel } = getTherapistStatus(th.id, 'dry')
                      return (
                        <div
                          key={th.id}
                          className={`w-full rounded-xl p-2 shadow-sm space-y-2 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                            isOff
                              ? 'bg-stone-100/60 border border-stone-250 opacity-40 grayscale-[25%]'
                              : 'bg-white border border-stone-200 hover:border-amber-300 hover:shadow-md'
                          }`}
                        >
                          <div className={`border rounded-lg p-1.5 space-y-1 ${
                            isOff ? 'bg-stone-100/80 border-stone-200/80' : 'bg-amber-50/50 border-amber-100'
                          }`}>
                            {/* 第一 Line: 이름만 */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className={`w-4 h-4 text-white rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm flex-shrink-0 ${
                                isOff ? 'bg-stone-400' : 'bg-amber-600'
                              }`}>
                                <User className="w-3 h-3" />
                              </div>
                              <span className={`text-xs truncate ${isOff ? 'text-stone-500 font-bold' : 'text-stone-850 font-black'}`} title={th.name}>
                                {th.name}
                              </span>
                            </div>
                            {/* 第二 Line: Priority & 포인트 (+ 버튼 제거) */}
                            <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-amber-100/60">
                              <div className="font-bold truncate">
                                {statusLabel ? (
                                  <span className={isOff ? 'text-rose-600 font-extrabold' : 'text-stone-500'}>
                                    {statusLabel}
                                  </span>
                                ) : (
                                  <span className="text-stone-400 font-medium">{language === 'ko' ? '기본' : 'Standard'}</span>
                                )}
                              </div>
                              <div className="bg-amber-100/80 border border-amber-200/50 rounded px-1.5 py-0.2 font-mono font-black text-[10px] text-amber-855 flex-shrink-0">
                                {totalPt} Pt
                              </div>
                            </div>
                          </div>

                          <div className="overflow-hidden border border-stone-150 rounded-xl">
                            <table className="w-full text-left border-collapse table-fixed">
                              <thead>
                                <tr className="bg-stone-50 text-[10px] font-black text-stone-400 uppercase border-b border-stone-150">
                                  <th className="p-1 w-[14%] text-center border-r border-stone-150" title={language === 'ko' ? '지정 배정' : 'Requested'}>ⓒ</th>
                                  <th className="p-1 w-[18%] text-center border-r border-stone-150">🔑</th>
                                  <th className="p-1 w-[26%] text-center border-r border-stone-150">Time</th>
                                  <th className="p-1 w-[26%] border-r border-stone-150 text-center">Price</th>
                                  <th className="p-1 w-[16%] text-center">Pt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100">
                                {items.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="p-3 text-center text-[10.5px] text-stone-400 font-bold bg-stone-50/30">
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
                                        title={language === 'ko' ? `예약자: ${item.customerName}` : `Client: ${item.customerName}`}
                                      >
                                        <td className="p-1 text-center border-r border-stone-100 text-[10.5px] font-bold text-stone-700">
                                          {item.isRequested ? (
                                            <span
                                              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black cursor-pointer"
                                              title={language === 'ko' ? `예약자: ${item.customerName}` : `Client: ${item.customerName}`}
                                            >
                                              ⓒ
                                            </span>
                                          ) : (
                                            <span className="text-stone-300">-</span>
                                          )}
                                        </td>
                                        <td className="p-1.5 text-center border-r border-stone-100 text-[10.5px] font-bold text-stone-750">
                                          {isCheckedIn && lockerNo ? (
                                            <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-50 text-emerald-855 border border-emerald-100/50 text-[9px] font-black leading-none">
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
        )}

      </div>
      {isBookingModalOpen && (
        <BookingModal
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          onSuccess={() => {
            setIsBookingModalOpen(false)
            fetchData()
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
      {isReservationListModalOpen && (
        <TodayReservationListModal
          isOpen={isReservationListModalOpen}
          onClose={() => setIsReservationListModalOpen(false)}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          reservations={reservations}
          therapists={therapists}
          employees={employees || []}
          pricingPlans={pricingPlans}
          language={language}
          onRefresh={fetchData}
          onRowClick={handleRowClick}
        />
      )}
    </DashboardLayout>
  )
}
