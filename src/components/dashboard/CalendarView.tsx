'use client'

import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { toLocalDateString, toLocalTimeString } from '@/utils/booking/dateUtils'
import { useUserSim } from '@/app/providers'

export interface Therapist {
  id: number
  name: string
  is_active: boolean
  is_premium_target: boolean
  user_id?: string | null
  email?: string | null
  phone?: string | null
}

export interface Reservation {
  id: number
  customer_name: string
  customer_phone?: string
  start_time: string
  end_time: string
  price: number
  is_premium: boolean
  therapist_id: number | null
  created_by: string | null
  status: 'confirmed' | 'cancelled'
  created_at: string
}

interface CalendarViewProps {
  currentDate: Date
  setCurrentDate: (d: Date) => void
  reservations: Reservation[]
  therapists: Therapist[]
  onSelectReservation: (r: Reservation) => void
  onAddReservationAt: (time: Date, therapistId?: number) => void
  viewMode: 'day' | 'week' | 'month'
}

export default function CalendarView({
  currentDate,
  setCurrentDate,
  reservations,
  therapists,
  onSelectReservation,
  onAddReservationAt,
  viewMode
}: CalendarViewProps) {
  const { currentUser } = useUserSim()
  const hours = Array.from({ length: 16 }, (_, i) => i + 9) // 09:00 ~ 24:00

  // 1. 날짜 이동 핸들러
  const handlePrev = () => {
    const nextDate = new Date(currentDate)
    if (viewMode === 'day') nextDate.setDate(currentDate.getDate() - 1)
    else if (viewMode === 'week') nextDate.setDate(currentDate.getDate() - 7)
    else if (viewMode === 'month') nextDate.setMonth(currentDate.getMonth() - 1)
    setCurrentDate(nextDate)
  }

  const handleNext = () => {
    const nextDate = new Date(currentDate)
    if (viewMode === 'day') nextDate.setDate(currentDate.getDate() + 1)
    else if (viewMode === 'week') nextDate.setDate(currentDate.getDate() + 7)
    else if (viewMode === 'month') nextDate.setMonth(currentDate.getMonth() + 1)
    setCurrentDate(nextDate)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // 2. 날짜 관련 헬퍼 함수
  const getStartOfWeek = (d: Date) => {
    const temp = new Date(d)
    const day = temp.getDay()
    const diff = temp.getDate() - day
    return new Date(temp.setDate(diff))
  }

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  // 3. 뷰별 헤더 타이틀 출력
  const getHeaderTitle = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    if (viewMode === 'day') {
      const day = currentDate.getDate()
      const dayName = ['일', '월', '화', '수', '목', '금', '토'][currentDate.getDay()]
      return `${year}년 ${month}월 ${day}일 (${dayName}요일)`
    } else if (viewMode === 'week') {
      const start = getStartOfWeek(currentDate)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`
    } else {
      return `${year}년 ${month}월`
    }
  }

  // ==========================================
  // [A] 일간 뷰: 마사지사별 타임라인 (수동 배정에 최적화)
  // ==========================================
  const renderDayView = () => {
    // 오늘 날짜 문자열 필터링용 (YYYY-MM-DD)
    const todayStr = toLocalDateString(currentDate)

    // 오늘 예약 중 확정된 것만 필터링
    const dayReservations = reservations.filter(res => {
      const resDateStr = toLocalDateString(new Date(res.start_time))
      return resDateStr === todayStr && res.status === 'confirmed'
    })

    return (
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <div className="min-w-[900px]">
          {/* 타임라인 헤더 (시간축) - 18열 고정 */}
          <div 
            className="grid border-b border-slate-800 bg-slate-950/60 p-3 text-xs font-semibold text-slate-400"
            style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
          >
            <div className="col-span-2 text-left pl-2 text-slate-300">마사지사 (오늘)</div>
            {hours.map(hour => (
              <div key={hour} className="text-center">{hour}:00</div>
            ))}
          </div>

          {/* 마사지사 행 렌더링 */}
          <div className="divide-y divide-slate-800/60">
            {therapists.map(therapist => {
              // 해당 마사지사의 오늘 예약 필터링
              const therapistResList = dayReservations.filter(r => r.therapist_id === therapist.id)

              // 동적 타임라인 세그먼트 생성 (colSpan 병합 연산)
              const segments: {
                type: 'empty' | 'reservation'
                hour: number
                colSpan: number
                reservation?: Reservation
              }[] = []

              for (let i = 0; i < hours.length; i++) {
                const hour = hours[i]
                
                const res = therapistResList.find(r => {
                  const resStart = new Date(r.start_time).getTime()
                  const resEnd = new Date(r.end_time).getTime()
                  
                  const slotStart = new Date(currentDate)
                  slotStart.setHours(hour, 0, 0, 0)
                  const slotEnd = new Date(currentDate)
                  slotEnd.setHours(hour + 1, 0, 0, 0)
                  
                  return resStart < slotEnd.getTime() && resEnd > slotStart.getTime()
                })

                if (res) {
                  // 이미 앞선 루프에서 처리한 예약 칩인 경우 스킵
                  const alreadyProcessed = segments.find(seg => seg.type === 'reservation' && seg.reservation?.id === res.id)
                  
                  if (!alreadyProcessed) {
                    const startTime = new Date(res.start_time)
                    const endTime = new Date(res.end_time)
                    
                    const startHourSlot = Math.max(9, Math.min(24, startTime.getHours()))
                    let endHourSlot = endTime.getHours()
                    if (endTime.getMinutes() === 0) {
                      endHourSlot = endHourSlot - 1
                    }
                    endHourSlot = Math.max(9, Math.min(24, endHourSlot))
                    
                    const colSpan = Math.max(1, endHourSlot - startHourSlot + 1)
                    
                    segments.push({
                      type: 'reservation',
                      hour,
                      colSpan,
                      reservation: res
                    })
                    
                    // colSpan 만큼 루프 인덱스 스킵
                    i += colSpan - 1
                  }
                } else {
                  segments.push({
                    type: 'empty',
                    hour,
                    colSpan: 1
                  })
                }
              }

              return (
                <div 
                  key={therapist.id} 
                  className="grid min-h-[64px] items-center hover:bg-slate-800/30 transition-colors"
                  style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
                >
                  {/* 마사지사 이름 & 정보 */}
                  <div className="col-span-2 pl-4 py-2 border-r border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-200">{therapist.name}</span>
                      {therapist.is_premium_target && (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500 border border-amber-500/20">
                          고급 우선
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {therapist.is_active ? '근무 중' : '휴무'}
                    </span>
                  </div>

                  {/* 세그먼트별 렌더러 (예약은 colSpan 병합 칩으로, 빈 칸은 1칸 빈 공간으로) */}
                  {segments.map((seg, idx) => {
                    if (seg.type === 'reservation' && seg.reservation) {
                      const res = seg.reservation
                      
                      // 10분 단위 공백(갭)을 백분율(%)로 변환하는 오프셋/너비 계산
                      const segmentStart = new Date(currentDate)
                      segmentStart.setHours(seg.hour, 0, 0, 0)
                      const segmentEnd = new Date(currentDate)
                      segmentEnd.setHours(seg.hour + seg.colSpan, 0, 0, 0)
                      
                      const resStart = new Date(res.start_time).getTime()
                      const resEnd = new Date(res.end_time).getTime()
                      
                      const clippedStart = Math.max(segmentStart.getTime(), resStart)
                      const clippedEnd = Math.min(segmentEnd.getTime(), resEnd)
                      
                      const totalMs = segmentEnd.getTime() - segmentStart.getTime()
                      const leftOffsetPercent = totalMs > 0 ? ((clippedStart - segmentStart.getTime()) / totalMs) * 100 : 0
                      const widthPercent = totalMs > 0 ? ((clippedEnd - clippedStart) / totalMs) * 100 : 100

                      return (
                        <div
                          key={`res-${res.id}-${idx}`}
                          onClick={() => onSelectReservation(res)}
                          className="h-full border-r border-slate-800/40 relative flex items-center p-1 cursor-pointer transition-all"
                          style={{ gridColumn: `span ${seg.colSpan} / span ${seg.colSpan}` }}
                        >
                          <div
                            className={`h-full rounded flex flex-col justify-center px-2 py-1 text-[11px] font-medium transition-transform active:scale-[0.98] ${
                              res.is_premium
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-950/20'
                                : 'bg-indigo-600/90 hover:bg-indigo-600 text-indigo-50 shadow-md shadow-indigo-950/20'
                            }`}
                            style={{
                              width: `${widthPercent}%`,
                              marginLeft: `${leftOffsetPercent}%`
                            }}
                          >
                            <span className="truncate">
                              {res.customer_name} ({toLocalTimeString(new Date(res.start_time))}~{toLocalTimeString(new Date(res.end_time))})
                            </span>
                            <span className="text-[9px] opacity-80">{res.price.toLocaleString()}원</span>
                          </div>
                        </div>
                      )
                    } else {
                      return (
                        <div
                          key={`empty-${seg.hour}-${idx}`}
                          onClick={() => {
                            if (currentUser.role === 'therapist') return
                            const bookingTime = new Date(currentDate)
                            bookingTime.setHours(seg.hour, 0, 0, 0)
                            onAddReservationAt(bookingTime, therapist.id)
                          }}
                          className="h-full border-r border-slate-800/40 relative flex items-center justify-center p-1 cursor-pointer transition-all hover:bg-slate-800/50"
                          style={{ gridColumn: 'span 1 / span 1' }}
                        >
                          {currentUser.role !== 'therapist' && (
                            <Plus className="w-3.5 h-3.5 text-slate-700 opacity-0 hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      )
                    }
                  })}
                </div>
              )
            })}
          </div>

        </div>
      </div>
    )
  }

  // ==========================================
  // [B] 주간 뷰: 7일 요약 시간 테이블
  // ==========================================
  const renderWeekView = () => {
    const startOfWeek = getStartOfWeek(currentDate)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      return d
    })

    return (
      <div className="grid grid-cols-7 gap-4">
        {days.map((day, idx) => {
          const dayStr = toLocalDateString(day)
          const dayResList = reservations.filter(res => {
            const resDateStr = toLocalDateString(new Date(res.start_time))
            return resDateStr === dayStr && res.status === 'confirmed'
          })

          const isToday = toLocalDateString(new Date()) === dayStr
          const dayNames = ['일', '월', '화', '수', '목', '금', '토']

          return (
            <div
              key={idx}
              className={`rounded-xl border p-4 min-h-[300px] flex flex-col transition-all ${
                isToday 
                  ? 'border-indigo-500 bg-slate-900/80 shadow-md shadow-indigo-950/20' 
                  : 'border-slate-800 bg-slate-900/40'
              }`}
            >
              {/* 요일 헤더 */}
              <div className="border-b border-slate-800/80 pb-2 mb-3">
                <span className={`text-xs font-semibold uppercase ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {dayNames[day.getDay()]}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-2xl font-bold tracking-tight ${isToday ? 'text-indigo-200' : 'text-slate-200'}`}>
                    {day.getDate()}
                  </span>
                  <span className="text-[11px] text-slate-500">일</span>
                </div>
              </div>

              {/* 해당 날짜 예약 목록 */}
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[220px] scrollbar-thin">
                {dayResList.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-8">
                    <span className="text-xs text-slate-600">예약 없음</span>
                  </div>
                ) : (
                  dayResList.map(res => {
                    const startH = new Date(res.start_time).getHours()
                    const therapist = therapists.find(t => t.id === res.therapist_id)

                    return (
                      <div
                        key={res.id}
                        onClick={() => onSelectReservation(res)}
                        className={`rounded-lg p-2.5 text-left text-xs cursor-pointer transition-all border hover:translate-y-[-1px] ${
                          res.is_premium
                            ? 'bg-amber-950/20 border-amber-500/20 text-amber-200 hover:bg-amber-950/30'
                            : 'bg-indigo-950/20 border-indigo-500/20 text-indigo-200 hover:bg-indigo-950/30'
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-between gap-1 mb-1">
                          <span className="truncate">{res.customer_name}</span>
                          <span className="text-[10px] opacity-75 font-mono">{toLocalTimeString(new Date(res.start_time))}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          👨‍⚕️ {therapist?.name || '미배정'}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* 예약 신규 등록 단축 버튼 */}
              {currentUser.role !== 'therapist' && (
                <button
                  onClick={() => {
                    const bookingTime = new Date(day)
                    bookingTime.setHours(9, 0, 0, 0)
                    onAddReservationAt(bookingTime)
                  }}
                  className="mt-3 w-full inline-flex items-center justify-center rounded-lg border border-dashed border-slate-800 py-1.5 text-slate-500 hover:border-indigo-500/40 hover:text-indigo-400 transition-colors text-[11px] font-medium"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> 예약 추가
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ==========================================
  // [C] 월간 뷰: 표준 캘린더 그리드
  // ==========================================
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const startDay = new Date(year, month, 1).getDay()
    const totalDays = getDaysInMonth(year, month)

    const prevMonthDays = getDaysInMonth(year, month - 1)
    const prevDaysArray = Array.from({ length: startDay }, (_, i) => prevMonthDays - startDay + 1 + i)
    const currentDaysArray = Array.from({ length: totalDays }, (_, i) => i + 1)
    
    // 그리드 총 칸수 맞추기 (7의 배수)
    const remainingSlots = 42 - (prevDaysArray.length + currentDaysArray.length)
    const nextDaysArray = Array.from({ length: remainingSlots }, (_, i) => i + 1)

    return (
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
        {/* 요일 타이틀 */}
        <div className="grid grid-cols-7 border-b border-slate-850 bg-slate-950/40 p-3 text-center text-xs font-semibold text-slate-400">
          <div>일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div>토</div>
        </div>

        {/* 캘린더 일자 그리드 */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-850">
          {/* 이전 달 날짜 채우기 */}
          {prevDaysArray.map(day => (
            <div key={`prev-${day}`} className="p-3 min-h-[100px] bg-slate-950/20 text-slate-700 text-xs text-left">
              {day}
            </div>
          ))}

          {/* 현재 달 날짜 채우기 */}
          {currentDaysArray.map(day => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayResList = reservations.filter(res => {
              const resDateStr = toLocalDateString(new Date(res.start_time))
              return resDateStr === dateStr && res.status === 'confirmed'
            })

            const isToday = toLocalDateString(new Date()) === dateStr

            return (
              <div
                key={`curr-${day}`}
                className={`p-2.5 min-h-[100px] text-xs text-left flex flex-col hover:bg-slate-800/10 transition-colors ${
                  isToday ? 'bg-indigo-950/10' : ''
                }`}
              >
                <span className={`font-semibold ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {day}
                </span>

                {/* 예약 칩 렌더링 (최대 3개 노출) */}
                <div className="mt-2 space-y-1.5 flex-1 overflow-y-auto scrollbar-thin">
                  {dayResList.slice(0, 3).map(res => (
                    <div
                      key={res.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectReservation(res)
                      }}
                      className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-all border ${
                        res.is_premium
                          ? 'bg-amber-950/30 border-amber-500/20 text-amber-300 hover:bg-amber-950/50'
                          : 'bg-indigo-950/30 border-indigo-500/20 text-indigo-300 hover:bg-indigo-950/50'
                      }`}
                    >
                      {res.customer_name} ({toLocalTimeString(new Date(res.start_time))})
                    </div>
                  ))}
                  {dayResList.length > 3 && (
                    <div className="text-[10px] text-slate-500 text-center font-medium">
                      외 {dayResList.length - 3}건 더 있음
                    </div>
                  )}
                </div>

                {/* 셀 하단 여백 클릭 시 신규 예약 */}
                {currentUser.role !== 'therapist' && (
                  <div
                    onClick={() => {
                      const bookingTime = new Date(year, month, day, 9, 0, 0, 0)
                      onAddReservationAt(bookingTime)
                    }}
                    className="h-4 cursor-pointer flex justify-end"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-700 hover:text-indigo-500 transition-colors" />
                  </div>
                )}
              </div>
            )
          })}

          {/* 다음 달 날짜 채우기 */}
          {nextDaysArray.map(day => (
            <div key={`next-${day}`} className="p-3 min-h-[100px] bg-slate-950/20 text-slate-700 text-xs text-left">
              {day}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 캘린더 네비게이션 컨트롤 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
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
          <h2 className="text-lg font-bold tracking-tight text-slate-200 ml-3">{getHeaderTitle()}</h2>
        </div>

        {/* 캘린더 등록 가이드 문구 */}
        <span className="text-[11px] text-slate-500 self-end">
          * 비어있는 슬롯을 클릭하면 해당 시간대에 바로 새 예약을 추가할 수 있습니다.
        </span>
      </div>

      {/* 캘린더 실제 렌더러 분기 */}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'month' && renderMonthView()}
    </div>
  )
}
