'use client'

import React, { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Search, User, Key, Clock, DollarSign } from 'lucide-react'
import { Reservation, Therapist } from './CalendarView'
import { UserSim } from '@/app/providers'
import { formatUSPhone } from '@/utils/phoneFormatter'
import { toLocalDateString } from '@/utils/booking/dateUtils'

export interface PricingPlan {
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

interface TodayReservationListModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: string // YYYY-MM-DD
  onDateChange: (newDate: string) => void
  reservations: Reservation[]
  therapists: Therapist[]
  employees: UserSim[]
  pricingPlans: PricingPlan[]
  language: 'ko' | 'en'
}

export default function TodayReservationListModal({
  isOpen,
  onClose,
  selectedDate,
  onDateChange,
  reservations,
  therapists,
  employees,
  pricingPlans,
  language
}: TodayReservationListModalProps) {
  const [isWalkInFilter, setIsWalkInFilter] = useState<'exclude' | 'include'>('exclude')
  const [searchTerm, setSearchTerm] = useState('')

  if (!isOpen) return null

  // 직원 이름 매핑 헬퍼 함수
  const getEmployeeName = (createdById: string | null) => {
    if (!createdById) return language === 'ko' ? '시스템' : 'System'
    const emp = employees.find(e => e.id === createdById)
    return emp ? emp.name : `${createdById.slice(0, 8)}...`
  }

  // 날짜 조절 헬퍼
  const changeDate = (days: number) => {
    const parts = selectedDate.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    d.setDate(d.getDate() + days)
    onDateChange(toLocalDateString(d))
  }

  const setToday = () => {
    onDateChange(toLocalDateString(new Date()))
  }

  // 날짜 표시 포맷
  const parts = selectedDate.split('-').map(Number)
  const dObj = new Date(parts[0], parts[1] - 1, parts[2])
  const dayNamesKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const dayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const pad = (n: number) => String(n).padStart(2, '0')
  const formattedDateStr = language === 'ko'
    ? `${pad(parts[1])}-${pad(parts[2])}-${parts[0]} (${dayNamesKo[dObj.getDay()]})`
    : `${pad(parts[1])}-${pad(parts[2])}-${parts[0]} (${dayNamesEn[dObj.getDay()]})`

  // 1. 기본 필터링 (Walk-in 제외/포함 & 검색어)
  const cleanSearch = searchTerm.trim().toLowerCase()
  const cleanSearchPhone = searchTerm.replace(/\D/g, '')

  const filteredReservations = reservations.filter(res => {
    // A. Walk-in 필터
    const isWalkIn = res.customer_name.toLowerCase().startsWith('walk-in') || !res.customer_phone
    if (isWalkInFilter === 'exclude' && isWalkIn) {
      return false
    }

    // B. 검색어 필터
    if (cleanSearch) {
      const th1 = therapists.find(t => t.id === res.therapist_id)?.name || ''
      const th2 = therapists.find(t => t.id === (res as any).secondary_therapist_id)?.name || ''
      const phoneDigits = (res.customer_phone || '').replace(/\D/g, '')
      
      const nameMatch = res.customer_name.toLowerCase().includes(cleanSearch)
      const phoneMatch = cleanSearchPhone && phoneDigits.includes(cleanSearchPhone)
      const thMatch = th1.toLowerCase().includes(cleanSearch) || th2.toLowerCase().includes(cleanSearch)

      if (!nameMatch && !phoneMatch && !thMatch) return false
    }

    return true
  })

  // 2. 1F 습식 및 2F 건식 예약 분리 목록 생성 함수
  const getGridItems = (floorCategory: 'wet' | 'dry') => {
    const list: Array<{
      id: string
      reservation: Reservation
      therapistName: string
      isRequested: boolean
      timeStr: string
      priceVal: number
    }> = []

    filteredReservations.forEach(res => {
      const plan = pricingPlans.find(p => p.id === res.pricing_plan_id)
      const isCombo = plan?.category === 'combo'

      const pad2 = (n: number) => String(n).padStart(2, '0')
      const formatTime = (isoStr: string) => {
        const d = new Date(isoStr)
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
      }

      if (isCombo && plan) {
        const bathDur = plan.bath_duration_minutes || 60
        const massageDur = plan.massage_duration_minutes || 60
        const delayMin = (res as any).delay_minutes ?? 30

        const startMs = new Date(res.start_time).getTime()
        const wetEndMs = startMs + bathDur * 60000
        const dryStartMs = startMs + (bathDur + delayMin) * 60000
        const dryEndMs = dryStartMs + massageDur * 60000

        if (floorCategory === 'wet' && (res as any).secondary_therapist_id) {
          const secTh = therapists.find(t => t.id === (res as any).secondary_therapist_id)
          const sT = formatTime(res.start_time)
          list.push({
            id: `${res.id}-wet`,
            reservation: res,
            therapistName: secTh?.name || (language === 'ko' ? '미지정' : 'Unassigned'),
            isRequested: !!(res as any).is_requested_secondary,
            timeStr: sT,
            priceVal: plan.bath_price || 0
          })
        }

        if (floorCategory === 'dry' && res.therapist_id) {
          const mainTh = therapists.find(t => t.id === res.therapist_id)
          const sT = formatTime(new Date(dryStartMs).toISOString())
          list.push({
            id: `${res.id}-dry`,
            reservation: res,
            therapistName: mainTh?.name || (language === 'ko' ? '미지정' : 'Unassigned'),
            isRequested: !!res.is_requested,
            timeStr: sT,
            priceVal: plan.massage_price || 0
          })
        }
      } else {
        // 단일 요금제
        const mainTh = therapists.find(t => t.id === res.therapist_id)
        const thType = mainTh?.massage_type || 'both'
        const planCat = plan?.category || 'dry'

        const isWet = planCat === 'wet' || thType === 'wet'
        const belongsToFloor = floorCategory === 'wet' ? isWet : !isWet

        if (belongsToFloor) {
          const sT = formatTime(res.start_time)
          list.push({
            id: `${res.id}-single`,
            reservation: res,
            therapistName: mainTh?.name || (language === 'ko' ? '미지정' : 'Unassigned'),
            isRequested: !!res.is_requested,
            timeStr: sT,
            priceVal: Number(res.price)
          })
        }
      }
    })

    return list.sort((a, b) => a.timeStr.localeCompare(b.timeStr))
  }

  const wetItems = getGridItems('wet')
  const dryItems = getGridItems('dry')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-stone-200 rounded-3xl shadow-2xl w-[90vw] max-w-[1120px] h-[76vh] flex flex-col overflow-hidden">
        
        {/* 모달 헤더 바 */}
        <div className="p-2.5 sm:p-3 border-b border-stone-200 bg-stone-50 flex flex-col md:flex-row md:items-center justify-between gap-2">
          
          {/* 날짜 조율 네비게이터 (오늘의 근무현황과 동일 포맷) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-stone-200/70 p-1 rounded-xl">
              <button
                onClick={() => changeDate(-1)}
                className="p-1 hover:bg-white rounded-lg transition-all text-stone-700 cursor-pointer"
                title={language === 'ko' ? '이전 날짜' : 'Previous Day'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => changeDate(1)}
                className="p-1 hover:bg-white rounded-lg transition-all text-stone-700 cursor-pointer"
                title={language === 'ko' ? '다음 날짜' : 'Next Day'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={setToday}
              className="px-2.5 py-1 bg-stone-200/70 hover:bg-stone-300/80 text-stone-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              {language === 'ko' ? '오늘' : 'Today'}
            </button>
            <div className="bg-white border border-stone-200 px-3.5 py-1 rounded-xl font-mono text-xs font-black text-stone-800 shadow-xs">
              {formattedDateStr}
            </div>
          </div>

          {/* 통합 검색창 */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={language === 'ko' ? '고객명, 연락처, 마사지사 검색...' : 'Search customer, phone, therapist...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-medium focus:outline-none focus:border-sky-500 transition-all shadow-xs"
            />
          </div>

          {/* Walk-in 필터 버튼 & 닫기 */}
          <div className="flex items-center gap-2.5">
            <div className="bg-stone-200/70 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setIsWalkInFilter('exclude')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  isWalkInFilter === 'exclude'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {language === 'ko' ? 'Walk-In 제외' : 'Exclude Walk-In'}
              </button>
              <button
                onClick={() => setIsWalkInFilter('include')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  isWalkInFilter === 'include'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {language === 'ko' ? 'Walk-In 포함' : 'Include Walk-In'}
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-stone-200/70 hover:bg-rose-100 hover:text-rose-600 text-stone-600 flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* 모달 본문: 1F 습식 / 2F 건식 듀얼 그리드 테이블 (Pad에서도 항시 2열 좌우 배치) */}
        <div className="p-2.5 sm:p-3 overflow-y-auto scrollbar-thin space-y-4 bg-stone-100/40 flex-1">
          
          <div className="grid grid-cols-2 gap-3">
            
            {/* 좌측 그리드: 1F 습식 마사지사 예약 현황 */}
            <div className="bg-white border border-stone-200 rounded-2xl p-2.5 shadow-xs space-y-2 min-w-0">
              <div className="flex items-center justify-between border-b border-sky-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="bg-sky-600 text-white text-xs font-black px-2 py-0.5 rounded-lg">1F</span>
                  <h3 className="text-xs sm:text-sm font-black text-sky-900 truncate">
                    {language === 'ko' ? '🧴 습식 마사지사 예약 현황' : '🧴 Wet Bookings'}
                  </h3>
                </div>
                <span className="text-xs font-bold text-stone-500 font-mono">
                  {language === 'ko' ? `총 ${wetItems.length}건` : `Total ${wetItems.length}`}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 text-[10.5px] font-black text-stone-500 uppercase border-b border-stone-200">
                      <th className="p-1.5 w-6 text-center">NO</th>
                      <th className="p-1.5 w-12 text-center whitespace-nowrap">{language === 'ko' ? '상태' : 'Status'}</th>
                      <th className="p-1.5 w-5 text-center" title={language === 'ko' ? '지정 배정' : 'Requested'}>ⓒ</th>
                      <th className="p-1.5 w-7 text-center" title={language === 'ko' ? '라커 번호' : 'Locker'}>🔑</th>
                      <th className="p-1.5">{language === 'ko' ? '고객명' : 'Customer'}</th>
                      <th className="p-1.5">{language === 'ko' ? '연락처' : 'Phone'}</th>
                      <th className="p-1.5 text-center whitespace-nowrap">{language === 'ko' ? '시간' : 'Time'}</th>
                      <th className="p-1.5">{language === 'ko' ? '마사지사' : 'Therapist'}</th>
                      <th className="p-1.5 text-right">{language === 'ko' ? '금액' : 'Price'}</th>
                      <th className="p-1.5 text-center">{language === 'ko' ? '접수자' : 'Created By'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150 font-medium text-stone-700">
                    {wetItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-5 text-center text-stone-400 font-bold bg-stone-50/20 text-xs">
                          {language === 'ko' ? '조회된 습식 예약 내역이 없습니다.' : 'No wet bookings found.'}
                        </td>
                      </tr>
                    ) : (
                      wetItems.map((item, idx) => {
                        const isCheckedIn = !!item.reservation.is_checked_in
                        const lockerNo = item.reservation.locker_number
                        const phoneFormatted = formatUSPhone(item.reservation.customer_phone || '') || '-'
                        return (
                          <tr key={item.id} className="hover:bg-sky-50/30 transition-all">
                            <td className="p-1 text-center font-mono text-[10.5px] text-stone-400 font-bold">{idx + 1}</td>
                            <td className="p-1 text-center whitespace-nowrap">
                              {isCheckedIn ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                  {language === 'ko' ? '체크인' : 'Checked In'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-250/50">
                                  {language === 'ko' ? '확정' : 'Confirmed'}
                                </span>
                              )}
                            </td>
                            <td className="p-1 text-center">
                              {item.isRequested ? (
                                <span
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black cursor-pointer"
                                  title={language === 'ko' ? `예약자: ${item.reservation.customer_name}` : `Client: ${item.reservation.customer_name}`}
                                >
                                  ⓒ
                                </span>
                              ) : (
                                <span className="text-stone-300">-</span>
                              )}
                            </td>
                            <td className="p-1 text-center font-mono font-bold text-[10px]">
                              {isCheckedIn && lockerNo ? (
                                <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-50 text-emerald-855 border border-emerald-100/60 leading-none">
                                  {lockerNo}
                                </span>
                              ) : (
                                <span className="text-stone-300">-</span>
                              )}
                            </td>
                            <td className="p-1 font-bold text-stone-900 truncate max-w-[85px] text-[11px]" title={item.reservation.customer_name}>{item.reservation.customer_name}</td>
                            <td className="p-1 font-mono text-[10.5px] text-stone-500 whitespace-nowrap" title={phoneFormatted}>
                              {phoneFormatted}
                            </td>
                            <td className="p-1 text-center font-mono text-[11px] font-black text-sky-900 whitespace-nowrap" title={item.timeStr}>
                              {item.timeStr}
                            </td>
                            <td className="p-1 font-bold text-stone-850 whitespace-nowrap text-[11px] truncate max-w-[75px]" title={item.therapistName}>
                              <span className="inline-flex items-center gap-1">
                                <User className="w-3 h-3 text-sky-600 flex-shrink-0" />
                                <span className="truncate">{item.therapistName}</span>
                              </span>
                            </td>
                            <td className="p-1 text-right font-mono font-bold text-stone-800 whitespace-nowrap text-[11px]">
                              ${item.priceVal}
                            </td>
                            <td className="p-1 text-center text-[10.5px] text-stone-500 whitespace-nowrap truncate max-w-[70px]" title={getEmployeeName(item.reservation.created_by)}>
                              {getEmployeeName(item.reservation.created_by)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 우측 그리드: 2F 건식 마사지사 예약 현황 */}
            <div className="bg-white border border-stone-200 rounded-2xl p-2.5 shadow-xs space-y-2 min-w-0">
              <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="bg-amber-600 text-white text-xs font-black px-2 py-0.5 rounded-lg">2F</span>
                  <h3 className="text-xs sm:text-sm font-black text-amber-900 truncate">
                    {language === 'ko' ? '🧘‍♂️ 건식 마사지사 예약 현황' : '🧘‍♂️ Dry Bookings'}
                  </h3>
                </div>
                <span className="text-xs font-bold text-stone-500 font-mono">
                  {language === 'ko' ? `총 ${dryItems.length}건` : `Total ${dryItems.length}`}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 text-[10.5px] font-black text-stone-500 uppercase border-b border-stone-200">
                      <th className="p-1.5 w-6 text-center">NO</th>
                      <th className="p-1.5 w-12 text-center whitespace-nowrap">{language === 'ko' ? '상태' : 'Status'}</th>
                      <th className="p-1.5 w-5 text-center" title={language === 'ko' ? '지정 배정' : 'Requested'}>ⓒ</th>
                      <th className="p-1.5 w-7 text-center" title={language === 'ko' ? '라커 번호' : 'Locker'}>🔑</th>
                      <th className="p-1.5">{language === 'ko' ? '고객명' : 'Customer'}</th>
                      <th className="p-1.5">{language === 'ko' ? '연락처' : 'Phone'}</th>
                      <th className="p-1.5 text-center whitespace-nowrap">{language === 'ko' ? '시간' : 'Time'}</th>
                      <th className="p-1.5">{language === 'ko' ? '마사지사' : 'Therapist'}</th>
                      <th className="p-1.5 text-right">{language === 'ko' ? '금액' : 'Price'}</th>
                      <th className="p-1.5 text-center">{language === 'ko' ? '접수자' : 'Created By'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150 font-medium text-stone-700">
                    {dryItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-5 text-center text-stone-400 font-bold bg-stone-50/20 text-xs">
                          {language === 'ko' ? '조회된 건식 예약 내역이 없습니다.' : 'No dry bookings found.'}
                        </td>
                      </tr>
                    ) : (
                      dryItems.map((item, idx) => {
                        const isCheckedIn = !!item.reservation.is_checked_in
                        const lockerNo = item.reservation.locker_number
                        const phoneFormatted = formatUSPhone(item.reservation.customer_phone || '') || '-'
                        return (
                          <tr key={item.id} className="hover:bg-amber-50/30 transition-all">
                            <td className="p-1 text-center font-mono text-[10.5px] text-stone-400 font-bold">{idx + 1}</td>
                            <td className="p-1 text-center whitespace-nowrap">
                              {isCheckedIn ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                  {language === 'ko' ? '체크인' : 'Checked In'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-250/50">
                                  {language === 'ko' ? '확정' : 'Confirmed'}
                                </span>
                              )}
                            </td>
                            <td className="p-1 text-center">
                              {item.isRequested ? (
                                <span
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black cursor-pointer"
                                  title={language === 'ko' ? `예약자: ${item.reservation.customer_name}` : `Client: ${item.reservation.customer_name}`}
                                >
                                  ⓒ
                                </span>
                              ) : (
                                <span className="text-stone-300">-</span>
                              )}
                            </td>
                            <td className="p-1 text-center font-mono font-bold text-[10px]">
                              {isCheckedIn && lockerNo ? (
                                <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-50 text-emerald-855 border border-emerald-100/60 leading-none">
                                  {lockerNo}
                                </span>
                              ) : (
                                <span className="text-stone-300">-</span>
                              )}
                            </td>
                            <td className="p-1 font-bold text-stone-900 truncate max-w-[85px] text-[11px]" title={item.reservation.customer_name}>{item.reservation.customer_name}</td>
                            <td className="p-1 font-mono text-[10.5px] text-stone-500 whitespace-nowrap" title={phoneFormatted}>
                              {phoneFormatted}
                            </td>
                            <td className="p-1 text-center font-mono text-[11px] font-black text-amber-900 whitespace-nowrap" title={item.timeStr}>
                              {item.timeStr}
                            </td>
                            <td className="p-1 font-bold text-stone-850 whitespace-nowrap text-[11px] truncate max-w-[75px]" title={item.therapistName}>
                              <span className="inline-flex items-center gap-1">
                                <User className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                <span className="truncate">{item.therapistName}</span>
                              </span>
                            </td>
                            <td className="p-1 text-right font-mono font-bold text-stone-800 whitespace-nowrap text-[11px]">
                              ${item.priceVal}
                            </td>
                            <td className="p-1 text-center text-[10.5px] text-stone-500 whitespace-nowrap truncate max-w-[70px]" title={getEmployeeName(item.reservation.created_by)}>
                              {getEmployeeName(item.reservation.created_by)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}
