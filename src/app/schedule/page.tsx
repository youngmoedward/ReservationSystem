'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '@/app/providers'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { ChevronLeft, ChevronRight, Calendar, User, Search, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { toLocalDateString } from '@/utils/booking/dateUtils'
import { Therapist } from '@/components/dashboard/CalendarView'

interface ScheduleRecord {
  therapist_id: number
  date: string
  availability_type: 'full' | 'off' | 'am_half' | 'pm_half' | null
}

export default function SchedulePage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()

  // 1. 달력 및 검색 상태 관리
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // 2. 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalFromDate, setModalFromDate] = useState('')
  const [modalToDate, setModalToDate] = useState('')
  const [modalTherapistId, setModalTherapistId] = useState<number>(0)
  const [modalAvailType, setModalAvailType] = useState<'full' | 'off' | 'am_half' | 'pm_half' | 'undecided'>('full')
  const [modalError, setModalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 마사지사인지 여부
  const isTherapistRole = currentUser.role === 'therapist'

  // 3. 데이터 로딩
  const fetchData = async () => {
    setLoading(true)
    try {
      // A. 활성 마사지사 로드
      const { data: tData, error: tErr } = await supabase
        .from('therapists')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true })

      if (tErr) throw tErr
      const activeTherapists = (tData as Therapist[]) || []
      setTherapists(activeTherapists)

      // 역할이 마사지사일 경우 본인 ID로 자동 고정
      if (isTherapistRole && currentUser.therapistId) {
        setSelectedTherapistId(currentUser.therapistId.toString())
      }

      // B. 전체 일정 로드 (현재 달력의 뷰 범위 날짜 구하기)
      // 월간 뷰의 날짜 범위를 여유롭게 -7일 ~ +14일 범위로 페치하여 이전/다음달 잔여 날짜 커버
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      
      const startRange = new Date(year, month, -7)
      const endRange = new Date(year, month + 1, 14)
      
      const startRangeStr = toLocalDateString(startRange)
      const endRangeStr = toLocalDateString(endRange)

      const { data: sData, error: sErr } = await supabase
        .from('therapist_schedule')
        .select('therapist_id, date, availability_type')
        .gte('date', startRangeStr)
        .lte('date', endRangeStr)

      if (sErr) throw sErr
      setSchedules((sData as ScheduleRecord[]) || [])
    } catch (err) {
      console.error('Schedule fetching error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate])

  // 권한별 초기 마사지사 선택 상태 고정
  useEffect(() => {
    if (isTherapistRole && currentUser.therapistId) {
      setSelectedTherapistId(currentUser.therapistId.toString())
    }
  }, [currentUser, isTherapistRole])

  // 4. 달력 이동 네비게이션
  const handlePrev = () => {
    const nextDate = new Date(currentDate)
    if (viewMode === 'week') nextDate.setDate(currentDate.getDate() - 7)
    else nextDate.setMonth(currentDate.getMonth() - 1)
    setCurrentDate(nextDate)
  }

  const handleNext = () => {
    const nextDate = new Date(currentDate)
    if (viewMode === 'week') nextDate.setDate(currentDate.getDate() + 7)
    else nextDate.setMonth(currentDate.getMonth() + 1)
    setCurrentDate(nextDate)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // 6. 요일 & 날짜 헬퍼
  const getStartOfWeek = (d: Date) => {
    const temp = new Date(d)
    const day = temp.getDay()
    const diff = temp.getDate() - day
    return new Date(temp.setDate(diff))
  }

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getHeaderTitle = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    if (viewMode === 'week') {
      const start = getStartOfWeek(currentDate)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`
    } else {
      return `${year}년 ${month}월`
    }
  }

  // 7. 일정 설정 모달 오픈 핸들러
  const handleCellClick = (dateStr: string, therapistId?: number) => {
    // 과거 날짜는 수정 불가 조건 검사
    const todayStr = toLocalDateString(new Date())
    if (dateStr < todayStr) {
      alert('지난 날짜의 근무 일정은 수정할 수 없습니다.')
      return
    }

    setModalFromDate(dateStr)
    setModalToDate(dateStr) // 기본적으로 From과 To는 동일 날짜

    if (isTherapistRole && currentUser.therapistId) {
      // 마사지사 역할인 경우 본인 일정만 편집 가능하도록 고정
      setModalTherapistId(currentUser.therapistId)
      const existing = schedules.find(s => s.date === dateStr && s.therapist_id === currentUser.therapistId)
      setModalAvailType(existing?.availability_type || 'full')
    } else if (therapistId !== undefined) {
      // 명시적으로 특정 마사지사 칩을 클릭한 경우
      setModalTherapistId(therapistId)
      const existing = schedules.find(s => s.date === dateStr && s.therapist_id === therapistId)
      setModalAvailType(existing?.availability_type || 'full')
    } else {
      // 빈 공간(날짜 칸)을 클릭한 경우
      // 현재 필터링된 마사지사가 전체(all)가 아니라면 해당 마사지사를, 전체라면 첫 번째 마사지사를 기본값으로
      const defaultTId = selectedTherapistId !== 'all' ? Number(selectedTherapistId) : (therapists[0]?.id || 0)
      setModalTherapistId(defaultTId)
      
      const existing = schedules.find(s => s.date === dateStr && s.therapist_id === defaultTId)
      setModalAvailType(existing?.availability_type || 'full')
    }

    setModalError(null)
    setIsModalOpen(true)
  }

  // From 날짜 변경 시 범위 제한 (오늘 기준 3주 = 21일)
  const handleFromDateChange = (val: string) => {
    const todayStr = toLocalDateString(new Date())
    const maxLimit = new Date()
    maxLimit.setDate(maxLimit.getDate() + 21)
    const maxLimitStr = toLocalDateString(maxLimit)

    if (val < todayStr) {
      setModalError('시작 날짜는 오늘 이전일 수 없습니다.')
      setModalFromDate(todayStr)
      return
    }

    if (val > maxLimitStr) {
      setModalError('설정 가능한 최대 범위는 오늘 기준 3주(21일)까지입니다.')
      setModalFromDate(maxLimitStr)
      return
    }

    setModalError(null)
    setModalFromDate(val)

    if (modalToDate < val) {
      setModalToDate(val)
    }
  }

  // To 날짜 변경 시 범위 제한 (오늘 기준 3주 = 21일)
  const handleToDateChange = (val: string) => {
    const maxLimit = new Date()
    maxLimit.setDate(maxLimit.getDate() + 21)
    const maxLimitStr = toLocalDateString(maxLimit)

    if (val < modalFromDate) {
      setModalError('종료 날짜는 시작 날짜보다 빠를 수 없습니다.')
      setModalToDate(modalFromDate)
      return
    }

    if (val > maxLimitStr) {
      setModalError('설정 가능한 최대 범위는 오늘 기준 3주(21일)까지입니다.')
      setModalToDate(maxLimitStr)
      return
    }

    setModalError(null)
    setModalToDate(val)
  }

  // 마사지사 변경 시 해당 날짜의 기존 상태 가져오기
  const handleModalTherapistChange = (id: number) => {
    setModalTherapistId(id)
    const existing = schedules.find(s => s.date === modalFromDate && s.therapist_id === id)
    setModalAvailType(existing?.availability_type || 'full')
  }

  // 8. 일정 설정 저장 프로세스
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalTherapistId) {
      setModalError('마사지사를 선택해 주세요.')
      return
    }

    const todayStr = toLocalDateString(new Date())
    if (modalFromDate < todayStr) {
      setModalError('과거 날짜를 포함한 근무 일정은 저장할 수 없습니다.')
      return
    }

    setSaving(true)
    setModalError(null)

    try {
      // From ~ To 범위의 모든 일자 구하기 (타임존 밀림 버그 방지를 위해 연/월/일 파싱해 로컬 Date로 생성)
      const daysArray: string[] = []
      const [fy, fm, fd] = modalFromDate.split('-').map(Number)
      const [ty, tm, td] = modalToDate.split('-').map(Number)

      let curr = new Date(fy, fm - 1, fd)
      const end = new Date(ty, tm - 1, td)

      while (curr <= end) {
        daysArray.push(toLocalDateString(curr))
        curr.setDate(curr.getDate() + 1)
      }

      // 'undecided'(미정)인 경우에는 해당 레코드를 삭제하거나 availability_type = null로 설정합니다.
      const dbPayload = daysArray.map(date => ({
        therapist_id: modalTherapistId,
        date,
        availability_type: modalAvailType === 'undecided' ? null : modalAvailType,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('therapist_schedule')
        .upsert(dbPayload, { onConflict: 'therapist_id,date' })

      if (error) throw error

      setIsModalOpen(false)
      fetchData()
    } catch (err: any) {
      console.error(err)
      setModalError(err.message || '일정 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 9. 캘린더 데이터 조회 헬퍼
  const getDaySchedules = (dateStr: string) => {
    let dayData = schedules.filter(s => s.date === dateStr)
    
    if (selectedTherapistId !== 'all') {
      const selectedId = Number(selectedTherapistId)
      dayData = dayData.filter(s => s.therapist_id === selectedId)
    }

    return dayData
  }

  // 한글 표기 변환
  const getAvailTypeLabel = (type: string | null) => {
    switch (type) {
      case 'full':
        return { text: '근무', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
      case 'off':
        return { text: '휴무', class: 'bg-rose-500/10 text-rose-450 border-rose-500/20' }
      case 'am_half':
        return { text: '오전반차', class: 'bg-amber-500/10 text-amber-400 border-amber-500/25' }
      case 'pm_half':
        return { text: '오후반차', class: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25' }
      default:
        return { text: '-', class: 'bg-slate-800/20 text-slate-500 border-slate-800' }
    }
  }

  // ==========================================
  // [A] 주간 뷰 렌더러
  // ==========================================
  const renderWeekView = () => {
    const startOfWeek = getStartOfWeek(currentDate)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      return d
    })

    const todayStr = toLocalDateString(new Date())

    return (
      <div className="grid grid-cols-7 gap-4">
        {days.map((day, idx) => {
          const dayStr = toLocalDateString(day)
          const daySchedules = getDaySchedules(dayStr)
          
          const isToday = todayStr === dayStr
          const isPast = dayStr < todayStr
          
          const dayNames = ['일', '월', '화', '수', '목', '금', '토']

          return (
            <div
              key={idx}
              onClick={() => handleCellClick(dayStr)}
              className={`rounded-xl border p-4 min-h-[350px] flex flex-col cursor-pointer transition-all ${
                isToday 
                  ? 'border-indigo-500 bg-slate-900/80 shadow-md shadow-indigo-950/20' 
                  : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/60'
              }`}
            >
              {/* 날짜 헤더 */}
              <div className="border-b border-slate-800 pb-2 mb-3 flex justify-between items-baseline">
                <div className="flex flex-col">
                  <span className={`text-[10px] font-bold uppercase ${
                    day.getDay() === 0 ? 'text-rose-500' : day.getDay() === 6 ? 'text-blue-500' : 'text-slate-500'
                  }`}>
                    {dayNames[day.getDay()]}요일
                  </span>
                  <span className={`text-2xl font-bold tracking-tight mt-0.5 ${
                    isToday ? 'text-indigo-200' : 'text-slate-200'
                  }`}>
                    {day.getDate()}
                  </span>
                </div>
                {isPast && (
                  <span className="text-[9px] text-slate-600 font-semibold uppercase">조회전용</span>
                )}
              </div>

              {/* 일정 목록 */}
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[260px] scrollbar-thin">
                {selectedTherapistId === 'all' ? (
                  therapists
                    .map(t => {
                      const sch = daySchedules.find(s => s.therapist_id === t.id)
                      return { t, sch }
                    })
                    // 근무나 휴무 등 명시적 일정을 정한 사람만 필터링 (미정 제외)
                    .filter(item => item.sch && item.sch.availability_type !== null)
                    .map(({ t, sch }) => {
                      const badge = getAvailTypeLabel(sch!.availability_type)
                      return (
                        <div
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCellClick(dayStr, t.id)
                          }}
                          className="flex items-center justify-between text-[11px] bg-slate-950/40 border border-slate-900 rounded-lg p-2 hover:bg-slate-800 transition-colors"
                        >
                          <span className="text-slate-300 font-medium">{t.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.class}`}>
                            {badge.text}
                          </span>
                        </div>
                      )
                    })
                ) : (
                  (() => {
                    const activeT = therapists.find(t => t.id === Number(selectedTherapistId))
                    if (!activeT) return null
                    const sch = daySchedules.find(s => s.therapist_id === activeT.id)
                    const badge = getAvailTypeLabel(sch?.availability_type || null)
                    return (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCellClick(dayStr, activeT.id)
                        }}
                        className="flex flex-col items-center justify-center h-full space-y-2 py-8"
                      >
                        <span className="text-xs text-slate-400 font-bold">{activeT.name}</span>
                        <span className={`px-4 py-2 rounded-xl text-xs font-bold border shadow hover:bg-slate-800 transition-colors ${badge.class}`}>
                          {badge.text}
                        </span>
                      </div>
                    )
                  })()
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ==========================================
  // [B] 월간 뷰 렌더러 (기본값)
  // ==========================================
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const startDay = new Date(year, month, 1).getDay()
    const totalDays = getDaysInMonth(year, month)

    const prevMonthDays = getDaysInMonth(year, month - 1)
    const prevDaysArray = Array.from({ length: startDay }, (_, i) => prevMonthDays - startDay + 1 + i)
    const currentDaysArray = Array.from({ length: totalDays }, (_, i) => i + 1)
    
    const remainingSlots = 42 - (prevDaysArray.length + currentDaysArray.length)
    const nextDaysArray = Array.from({ length: remainingSlots }, (_, i) => i + 1)

    const todayStr = toLocalDateString(new Date())

    return (
      <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40 shadow-xl">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/50 p-3.5 text-center text-xs font-bold text-slate-400">
          <div className="text-rose-500">일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div className="text-blue-500">토</div>
        </div>

        {/* 일자 그리드 */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-850">
          {/* 이전 달 일자 */}
          {prevDaysArray.map(day => {
            const prevMonth = month === 0 ? 11 : month - 1
            const prevYear = month === 0 ? year - 1 : year
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

            return (
              <div
                key={`prev-${day}`}
                onClick={() => handleCellClick(dateStr)}
                className="p-3.5 min-h-[120px] bg-slate-950/20 text-slate-700 text-xs text-left cursor-pointer hover:bg-slate-800/10 flex flex-col justify-between"
              >
                <span className="font-semibold">{day}</span>
                <span className="text-[9px] text-slate-700/50 font-bold self-end">이전달</span>
              </div>
            )
          })}

          {/* 현재 달 일자 */}
          {currentDaysArray.map(day => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const daySchedules = getDaySchedules(dateStr)
            
            const isToday = todayStr === dateStr
            const isPast = dateStr < todayStr
            const dow = new Date(year, month, day).getDay()

            return (
              <div
                key={`curr-${day}`}
                onClick={() => handleCellClick(dateStr)}
                className={`p-3 min-h-[120px] text-xs text-left flex flex-col hover:bg-slate-850/30 transition-all cursor-pointer ${
                  isToday 
                    ? 'bg-indigo-950/10 border-2 border-indigo-500 shadow-inner' 
                    : ''
                }`}
              >
                <div className="flex justify-between items-baseline mb-2">
                  <span className={`font-bold ${
                    isToday 
                      ? 'text-indigo-400' 
                      : dow === 0 
                        ? 'text-rose-500' 
                        : dow === 6 
                          ? 'text-blue-500' 
                          : 'text-slate-400'
                  }`}>
                    {day}
                  </span>
                  {isPast && (
                    <span className="text-[8px] text-slate-700 font-bold tracking-tight">조회전용</span>
                  )}
                </div>

                {/* 근무 정보 리스트 */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[84px] scrollbar-thin">
                  {selectedTherapistId === 'all' ? (
                    therapists
                      .map(t => {
                        const sch = daySchedules.find(s => s.therapist_id === t.id)
                        return { t, sch }
                      })
                      // 근무나 휴무 등 명시적 일정을 정한 사람만 필터링 (미정 제외)
                      .filter(item => item.sch && item.sch.availability_type !== null)
                      .map(({ t, sch }) => {
                        const badge = getAvailTypeLabel(sch!.availability_type)
                        return (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCellClick(dateStr, t.id)
                            }}
                            className="flex items-center justify-between text-[10px] leading-tight bg-slate-950/20 border border-slate-900/40 rounded px-1.5 py-0.5 mt-0.5 hover:bg-slate-800 transition-colors"
                          >
                            <span className="text-slate-300 font-medium truncate max-w-[54px]">{t.name}</span>
                            <span className={`px-1 rounded-[4px] text-[8px] font-bold border ${badge.class}`}>
                              {badge.text}
                            </span>
                          </div>
                        )
                      })
                  ) : (
                    (() => {
                      const activeT = therapists.find(t => t.id === Number(selectedTherapistId))
                      if (!activeT) return null
                      const sch = daySchedules.find(s => s.therapist_id === activeT.id)
                      const badge = getAvailTypeLabel(sch?.availability_type || null)
                      return (
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCellClick(dateStr, activeT.id)
                          }}
                          className="h-full flex items-center justify-center py-3"
                        >
                          <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border shadow hover:bg-slate-800 transition-colors ${badge.class}`}>
                            {badge.text}
                          </span>
                        </div>
                      )
                    })()
                  )}
                </div>
              </div>
            )
          })}

          {/* 다음 달 일자 */}
          {nextDaysArray.map(day => {
            const nextMonth = month === 11 ? 0 : month + 1
            const nextYear = month === 11 ? year + 1 : year
            const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

            return (
              <div
                key={`next-${day}`}
                onClick={() => handleCellClick(dateStr)}
                className="p-3.5 min-h-[120px] bg-slate-950/20 text-slate-700 text-xs text-left cursor-pointer hover:bg-slate-800/10 flex flex-col justify-between"
              >
                <span className="font-semibold">{day}</span>
                <span className="text-[9px] text-slate-700/50 font-bold self-end">다음달</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        
        {/* 제어 바 (필터 및 검색) */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/40 p-5 rounded-2xl border border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-slate-200">🗓️ 마사지사 근무일 현황</span>
            
            {/* 주간/월간 전환 탭 */}
            <div className="flex bg-slate-950 border border-slate-850 rounded-xl p-0.5 shadow-inner">
              {(['week', 'month'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`text-[10px] font-bold uppercase px-3.5 py-1.5 rounded-lg transition-all ${
                    viewMode === mode
                      ? 'bg-slate-900 text-slate-100 border border-slate-800 shadow'
                      : 'text-slate-500 hover:text-slate-350'
                  }`}
                >
                  {mode === 'week' ? '주간' : '월간'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-end xl:self-auto">
            {/* 마사지사 필터 */}
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-600">
                <User className="w-3.5 h-3.5" />
              </span>
              <select
                disabled={isTherapistRole}
                value={selectedTherapistId}
                onChange={(e) => setSelectedTherapistId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-60 font-semibold"
              >
                {!isTherapistRole && <option value="all">전체 마사지사 보기</option>}
                {therapists.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} (마사지사)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchData}
              className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-350 transition-all text-xs"
              title="새로고침"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 달력 서브 제어 (이동 및 헤더) */}
        <div className="flex items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 hover:text-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 hover:text-slate-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-slate-100 transition-colors ml-1"
            >
              오늘
            </button>
            <h2 className="text-base font-bold text-slate-200 ml-3">{getHeaderTitle()}</h2>
          </div>
          <span className="text-[10px] text-slate-500 self-end font-medium">
            * 날짜 칸을 클릭해 From ~ To 일정을 일괄 편집할 수 있습니다. (3주 범위 내 제한)
          </span>
        </div>

        {/* 달력 내용부 */}
        {loading && schedules.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center border border-slate-800 bg-slate-900/10 rounded-2xl">
            <span className="text-xs text-slate-400 animate-pulse font-medium">근무 일정을 동기화하는 중...</span>
          </div>
        ) : (
          <div>
            {viewMode === 'week' ? renderWeekView() : renderMonthView()}
          </div>
        )}
      </div>

      {/* 일정 일괄 입력/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-slate-200 mb-5 flex items-center gap-1.5 uppercase">
              <Calendar className="w-4 h-4 text-indigo-400" /> 마사지사 근무 일정 설정
            </h3>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              {modalError && (
                <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/25 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 마사지사 선택 (마사지사는 비활성 고정) */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">대상 마사지사</label>
                <select
                  disabled={isTherapistRole}
                  value={modalTherapistId}
                  onChange={(e) => handleModalTherapistChange(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {therapists.map(t => (
                    <option key={t.id} value={t.id}>{t.name} (마사지사)</option>
                  ))}
                </select>
              </div>

              {/* 기간 설정 (From ~ To) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">시작 날짜 (From)</label>
                  <input
                    type="date"
                    value={modalFromDate}
                    onChange={(e) => handleFromDateChange(e.target.value)}
                    min={toLocalDateString(new Date())}
                    max={toLocalDateString(new Date(new Date().setDate(new Date().getDate() + 21)))}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">종료 날짜 (To)</label>
                  <input
                    type="date"
                    value={modalToDate}
                    onChange={(e) => handleToDateChange(e.target.value)}
                    min={modalFromDate}
                    max={toLocalDateString(new Date(new Date().setDate(new Date().getDate() + 21)))}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                * 근무 일정은 오늘 날짜로부터 최대 3주(21일)까지만 설정 및 변경이 가능합니다.
              </p>

              {/* 일정 상태 선택 (라디오 버튼) */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">근무 형태 설정</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { type: 'full', label: '근무 (종일)' },
                    { type: 'am_half', label: '오전반차 (오후근무)' },
                    { type: 'pm_half', label: '오후반차 (오전근무)' },
                    { type: 'off', label: '휴무 (종일)' },
                    { type: 'undecided', label: '미정 (-)' }
                  ].map(item => (
                    <label
                      key={item.type}
                      className={`flex items-center gap-2 border border-slate-800 bg-slate-950/40 p-2.5 rounded-xl cursor-pointer hover:border-slate-700 transition-colors ${
                        modalAvailType === item.type ? 'border-indigo-500/80 bg-indigo-950/10' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="avail_type"
                        checked={modalAvailType === item.type}
                        onChange={() => setModalAvailType(item.type as any)}
                        className="w-4 h-4 text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500/30"
                      />
                      <span className="text-slate-300 font-semibold">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '근무 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
