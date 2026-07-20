'use client'

import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { toLocalDateString, toLocalTimeString, toUIDateString } from '@/utils/booking/dateUtils'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'

export interface Therapist {
  id: number
  name: string
  is_active: boolean
  is_premium_target: boolean
  user_id?: string | null
  email?: string | null
  phone?: string | null
  massage_type?: 'dry' | 'wet' | 'both' | string
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
  cancellation_type?: 'request' | 'noshow' | null
  penalty_points?: number
  pricing_plan_id?: number | null
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
  const { language, t } = useLanguage()
  const [popoverDate, setPopoverDate] = useState<string | null>(null)
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
      const dayNameKo = ['일', '월', '화', '수', '목', '금', '토'][currentDate.getDay()]
      const dayNameEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentDate.getDay()]
      if (language === 'ko') {
        return `${toUIDateString(currentDate)} (${dayNameKo}요일)`
      } else {
        return `${dayNameEn}, ${toUIDateString(currentDate)}`
      }
    } else if (viewMode === 'week') {
      const start = getStartOfWeek(currentDate)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${toUIDateString(start)} ~ ${toUIDateString(end)}`
    } else {
      return `${String(month).padStart(2, '0')}-${year}`
    }
  }

  // ==========================================
  // [A] 일간 뷰: 마사지사별 타임라인 (수동 배정에 최적화)
  // ==========================================
  const renderDayView = () => {
    const todayStr = toLocalDateString(currentDate)

    const dayReservations = reservations.filter(res => {
      const resDateStr = toLocalDateString(new Date(res.start_time))
      return resDateStr === todayStr && res.status === 'confirmed'
    })

    return (
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-100/70 backdrop-blur-md touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="min-w-[900px]">
          <div 
            className="grid border-b border-stone-200 bg-stone-200/50 p-3 text-xs font-semibold text-stone-600"
            style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
          >
            <div className="col-span-2 text-left pl-2 text-stone-700">
              {language === 'ko' ? '마사지사 (오늘)' : 'Therapist (Today)'}
            </div>
            {hours.map(hour => (
              <div key={hour} className="text-center">{hour}:00</div>
            ))}
          </div>

          <div className="divide-y divide-stone-200">
            {therapists.map(therapist => {
              const therapistResList = dayReservations.filter(r => r.therapist_id === therapist.id)

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
                  className="grid min-h-[64px] items-center hover:bg-stone-100 transition-colors"
                  style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
                >
                  <div className="col-span-2 pl-4 py-2 border-r border-stone-200">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-stone-800">{therapist.name}</span>
                    </div>
                    <span className="text-[11px] text-stone-500">
                      {therapist.is_active ? t('schedule.on_duty') : t('schedule.off_duty')}
                    </span>
                  </div>

                  {segments.map((seg, idx) => {
                    if (seg.type === 'reservation' && seg.reservation) {
                      const res = seg.reservation
                      
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
                          className="h-full border-r border-stone-200/60 relative flex items-center p-1 cursor-pointer transition-all"
                          style={{ gridColumn: `span ${seg.colSpan} / span ${seg.colSpan}` }}
                        >
                          <div
                            className={`h-full rounded flex flex-col justify-center px-2 py-1 text-[11px] font-medium transition-transform active:scale-[0.98] ${
                              res.is_premium
                                ? 'bg-gradient-to-r from-amber-600 to-orange-700 text-white shadow-sm shadow-amber-900/10'
                                : 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-900/10'
                            }`}
                            style={{
                              width: `${widthPercent}%`,
                              marginLeft: `${leftOffsetPercent}%`
                            }}
                          >
                            <span className="truncate">
                              {res.customer_name} ({toLocalTimeString(new Date(res.start_time))}~{toLocalTimeString(new Date(res.end_time))})
                            </span>
                            <span className="text-[9px] opacity-80">
                              ${res.price.toLocaleString()}
                            </span>
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
                          className="h-full border-r border-stone-200/60 relative flex items-center justify-center p-1 cursor-pointer transition-all hover:bg-stone-200/50"
                          style={{ gridColumn: 'span 1 / span 1' }}
                        >
                          {currentUser.role !== 'therapist' && (
                            <Plus className="w-3.5 h-3.5 text-stone-400 opacity-0 hover:opacity-100 transition-opacity" />
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

    const dayNames = language === 'ko' 
      ? ['일', '월', '화', '수', '목', '금', '토'] 
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
      <div className="grid grid-cols-7 gap-4">
        {days.map((day, idx) => {
          const dayStr = toLocalDateString(day)
          const dayResList = reservations.filter(res => {
            const resDateStr = toLocalDateString(new Date(res.start_time))
            return resDateStr === dayStr && res.status === 'confirmed'
          })

          const isToday = toLocalDateString(new Date()) === dayStr

          return (
            <div
              key={idx}
              className={`rounded-xl border p-4 min-h-[300px] flex flex-col transition-all ${
                isToday 
                  ? 'border-emerald-600 bg-stone-100 shadow-md shadow-emerald-900/10' 
                  : 'border-stone-200 bg-stone-100/40'
              }`}
            >
              <div className="border-b border-stone-200 pb-2 mb-3">
                <span className={`text-xs font-semibold uppercase ${isToday ? 'text-emerald-700' : 'text-stone-500'}`}>
                  {dayNames[day.getDay()]}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-2xl font-bold tracking-tight ${isToday ? 'text-emerald-800' : 'text-stone-800'}`}>
                    {day.getDate()}
                  </span>
                  <span className="text-[11px] text-stone-500">{language === 'ko' ? '일' : ''}</span>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto max-h-[220px] scrollbar-thin">
                {dayResList.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-8">
                    <span className="text-xs text-stone-400">{language === 'ko' ? '예약 없음' : 'No Bookings'}</span>
                  </div>
                ) : (
                  dayResList.map(res => {
                    const therapist = therapists.find(t => t.id === res.therapist_id)

                    return (
                      <div
                        key={res.id}
                        onClick={() => onSelectReservation(res)}
                        className={`rounded-lg p-2.5 text-left text-xs cursor-pointer transition-all border hover:translate-y-[-1px] ${
                          res.is_premium
                            ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100/60'
                            : 'bg-emerald-50 border-emerald-200/20 text-emerald-800 hover:bg-emerald-100/60'
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-between gap-1 mb-1">
                          <span className="truncate">{res.customer_name}</span>
                          <span className="text-[10px] opacity-75 font-mono">{toLocalTimeString(new Date(res.start_time))}</span>
                        </div>
                        <div className="text-[10px] text-stone-500 truncate">
                          👨‍⚕️ {therapist?.name || (language === 'ko' ? '미배정' : 'Unassigned')}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {currentUser.role !== 'therapist' && (
                <button
                  onClick={() => {
                    const bookingTime = new Date(day)
                    bookingTime.setHours(9, 0, 0, 0)
                    onAddReservationAt(bookingTime)
                  }}
                  className="mt-3 w-full inline-flex items-center justify-center rounded-lg border border-dashed border-stone-200 py-1.5 text-stone-600 hover:border-emerald-500/40 hover:text-emerald-700 transition-colors text-[11px] font-medium"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> {language === 'ko' ? '예약 추가' : 'Add Booking'}
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
    
    const remainingSlots = 42 - (prevDaysArray.length + currentDaysArray.length)
    const nextDaysArray = Array.from({ length: remainingSlots }, (_, i) => i + 1)

    const dayNames = language === 'ko' 
      ? ['일', '월', '화', '수', '목', '금', '토'] 
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-stone-100/40">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-200/50 p-3 text-center text-xs font-semibold text-stone-600">
          {dayNames.map((d, i) => <div key={i}>{d}</div>)}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-stone-200">
          {prevDaysArray.map(day => (
            <div key={`prev-${day}`} className="p-3 min-h-[100px] bg-stone-200/20 text-stone-400 text-xs text-left">
              {day}
            </div>
          ))}

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
                onClick={() => {
                  if (currentUser.role !== 'therapist') {
                    const bookingTime = new Date(year, month, day, 9, 0, 0, 0)
                    onAddReservationAt(bookingTime)
                  }
                }}
                className={`p-2.5 min-h-[100px] text-xs text-left flex flex-col hover:bg-stone-100 transition-colors cursor-pointer ${
                  isToday ? 'bg-emerald-50' : ''
                }`}
              >
                <span className={`font-semibold ${isToday ? 'text-emerald-700' : 'text-stone-500'}`}>
                  {day}
                </span>

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
                          ? 'bg-amber-50 border-amber-200/20 text-amber-800 hover:bg-amber-100/50'
                          : 'bg-emerald-50 border-emerald-200/20 text-emerald-800 hover:bg-emerald-100/50'
                      }`}
                    >
                      {res.customer_name} ({toLocalTimeString(new Date(res.start_time))})
                    </div>
                  ))}
                  {dayResList.length > 3 && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation()
                        setPopoverDate(dateStr)
                      }}
                      className="text-[10px] text-stone-500 hover:text-emerald-700 text-center font-medium cursor-pointer transition-colors"
                    >
                      {language === 'ko' ? `외 ${dayResList.length - 3}건 더 있음` : `+${dayResList.length - 3} more`}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {nextDaysArray.map(day => (
            <div key={`next-${day}`} className="p-3 min-h-[100px] bg-stone-200/20 text-stone-400 text-xs text-left">
              {day}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-stone-100/40 p-4 rounded-xl border border-stone-200">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-stone-200 hover:bg-stone-300 hover:text-stone-900 text-stone-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-stone-200 hover:bg-stone-300 hover:text-stone-900 text-stone-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleToday}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 hover:text-stone-900 transition-colors ml-1"
          >
            {t('calendar.today')}
          </button>
          <h2 className="text-lg font-bold tracking-tight text-stone-800 ml-3">{getHeaderTitle()}</h2>
        </div>

        <span className="text-[11px] text-stone-500 self-end">
          {language === 'ko' 
            ? '* 비어있는 슬롯을 클릭하면 해당 시간대에 바로 새 예약을 추가할 수 있습니다.' 
            : '* Click on an empty slot to instantly create a new booking for that time.'}
        </span>
      </div>

      {/* 캘린더 실제 렌더러 분기 */}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'month' && renderMonthView()}

      {/* 월간 뷰 추가 예약 보기 오버레이 팝오버 */}
      {popoverDate && (() => {
        const selectedDate = new Date(popoverDate)
        const dateStrKo = `${selectedDate.getFullYear()}년 ${String(selectedDate.getMonth() + 1).padStart(2, '0')}월 ${String(selectedDate.getDate()).padStart(2, '0')}일`
        const dateStrEn = toUIDateString(selectedDate)
        const displayDate = language === 'ko' ? dateStrKo : dateStrEn
        
        const dayResList = reservations.filter(res => {
          const resDateStr = toLocalDateString(new Date(res.start_time))
          return resDateStr === popoverDate && res.status === 'confirmed'
        })
        
        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 backdrop-blur-sm transition-opacity"
            onClick={() => setPopoverDate(null)}
          >
            <div 
              className="w-full max-w-sm rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-emerald-750 font-sans">{displayDate}</span>
                  <span className="text-[10px] text-stone-500 font-medium mt-0.5">
                    {language === 'ko' ? `등록된 예약 총 ${dayResList.length}건` : `Total ${dayResList.length} booking(s)`}
                  </span>
                </div>
                <button 
                  onClick={() => setPopoverDate(null)}
                  className="p-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-500 hover:text-stone-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {dayResList.map(res => (
                  <div
                    key={res.id}
                    onClick={() => {
                      setPopoverDate(null)
                      onSelectReservation(res)
                    }}
                    className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium cursor-pointer border transition-all ${
                      res.is_premium
                        ? 'bg-amber-50 border-amber-250/20 text-amber-800 hover:bg-amber-100/60 shadow-sm'
                        : 'bg-emerald-50 border-emerald-250/20 text-emerald-800 hover:bg-emerald-100/60 shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col space-y-0.5">
                      <span className="font-bold">{res.customer_name}</span>
                      {res.is_premium && (
                        <span className="text-[9px] text-amber-600 font-semibold uppercase tracking-wider">Premium</span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                      {toLocalTimeString(new Date(res.start_time))}
                    </span>
                  </div>
                ))}
              </div>
              
              {currentUser.role !== 'therapist' && (
                <button
                  onClick={() => {
                    const bookingTime = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 9, 0, 0, 0)
                    setPopoverDate(null)
                    onAddReservationAt(bookingTime)
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-650 hover:to-emerald-550 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md active:scale-[0.98]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {language === 'ko' ? '새 예약 접수' : 'Add New Booking'}
                </button>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
