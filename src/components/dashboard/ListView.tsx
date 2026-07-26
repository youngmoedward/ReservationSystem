'use client'

import React, { useState } from 'react'
import { Calendar, User, Phone, DollarSign, ShieldAlert, Edit2 } from 'lucide-react'
import { Reservation, Therapist } from './CalendarView'
import { UserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { toUIDateString } from '@/utils/booking/dateUtils'
import { formatUSPhone } from '@/utils/phoneFormatter'

interface ListViewProps {
  reservations: Reservation[]
  therapists: Therapist[]
  employees: UserSim[]
  onSelectReservation: (r: Reservation) => void
  currentUserId: string
  currentUserRole: UserSim['role']
  startDate: string
  endDate: string
  onStartDateChange: (val: string) => void
  onEndDateChange: (val: string) => void
  viewType?: 'table' | 'card'
  onViewTypeChange?: (val: 'table' | 'card') => void
}

export default function ListView({
  reservations,
  therapists,
  employees,
  onSelectReservation,
  currentUserId,
  currentUserRole,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  viewType,
  onViewTypeChange
}: ListViewProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'cancelled'>('confirmed')
  const [searchTerm, setSearchTerm] = useState('')
  const [internalViewType, setInternalViewType] = useState<'table' | 'card'>('table')
  const activeViewType = viewType || internalViewType
  const setViewTypeState = onViewTypeChange || setInternalViewType
  const { language, t } = useLanguage()

  // 직원 이름 매핑 헬퍼 함수
  const getEmployeeName = (createdById: string | null) => {
    if (!createdById) return language === 'ko' ? '시스템' : 'System'
    const emp = employees.find(e => e.id === createdById)
    return emp ? emp.name : `${createdById.slice(0, 8)}...`
  }

  // 1. 예약 필터링 로직
  const isTherapistUser = currentUserRole === 'therapist' || currentUserRole === 'msg1' || currentUserRole === 'msg2'
  
  let userType: 'wet' | 'dry' | 'both' | null = null
  if (currentUserRole === 'msg1') {
    userType = 'dry'
  } else if (currentUserRole === 'msg2') {
    userType = 'wet'
  } else {
    const myProfile = therapists.find(t => t.user_id === currentUserId || `mock-therapist-${t.id}` === currentUserId)
    if (myProfile) {
      userType = myProfile.massage_type as any
    }
  }

  const filtered = reservations
    .filter(res => {
      const therapist = therapists.find(t => t.id === res.therapist_id)
      const therapistName = therapist ? therapist.name : ''

      // 마사지사 권한 격리: 습식 마사지사는 건식 전용 예약을 차단하고, 건식 마사지사는 습식 예약을 차단
      if (isTherapistUser && userType && userType !== 'both') {
        const assignedSecTherapist = (res as any).secondary_therapist_id
          ? therapists.find(t => t.id === (res as any).secondary_therapist_id)
          : null
        
        const isWetReservation = (therapist?.massage_type === 'wet') || (assignedSecTherapist?.massage_type === 'wet')
        const isDryReservation = (therapist?.massage_type === 'dry')

        if (userType === 'wet' && isDryReservation && !isWetReservation) {
          return false
        }
        if (userType === 'dry' && isWetReservation && !isDryReservation) {
          return false
        }
      }

      // 검색어 (고객명, 연락처, 마사지사 이름)
      const cleanSearch = searchTerm.replace(/\D/g, '')
      const matchesSearch =
        res.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (res.customer_phone && (
          res.customer_phone.replace(/\D/g, '').includes(cleanSearch || searchTerm)
        )) ||
        therapistName.toLowerCase().includes(searchTerm.toLowerCase())
      
      // 예약 상태 필터
      if (filterStatus === 'all') return matchesSearch
      return res.status === filterStatus && matchesSearch
    })
    // 최신 시간순 정렬
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // 2. 날짜 및 시간 포맷터
  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${date}-${year} ${hours}:${minutes}`
  }

  // 3. 표 형식 (Table View) 렌더러
  const renderTableView = () => {
    return (
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-100/40 touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-[800px] text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-200/50 text-[10px] font-bold text-stone-600 uppercase tracking-wider">
              <th className="p-4 text-center w-12">No</th>
              <th className="p-4 text-center w-20">{t('list.table.status')}</th>
              <th className="p-4">{t('list.table.client')}</th>
              <th className="p-4">{t('list.table.phone')}</th>
              <th className="p-4">{t('list.table.time')}</th>
              <th className="p-4">{t('list.table.therapist')}</th>
              <th className="p-4 text-right">{t('booking.modal.price')}</th>
              <th className="p-4">{t('list.table.creator')}</th>
              <th className="p-4 text-center w-16">{t('list.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {filtered.map((res, index) => {
              const therapist = therapists.find(t => t.id === res.therapist_id)
              const isOwner = res.created_by === currentUserId
              const isManager = currentUserRole === 'manager'
              const isStaff = currentUserRole === 'staff'
              const canModify = isManager || isStaff

              return (
                <tr
                  key={res.id}
                  className={`hover:bg-stone-100 transition-colors group ${
                    res.status === 'cancelled'
                      ? 'opacity-50 line-through text-stone-400'
                      : ''
                  }`}
                >
                  {/* 순번 No */}
                  <td className="p-3 text-center text-stone-400 font-mono text-[11px]">
                    {index + 1}
                  </td>
                  {/* 상태 배지 */}
                  <td className="p-3 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        res.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : res.locker_number
                          ? 'bg-sky-50 text-sky-700 border border-sky-200 shadow-sm shadow-sky-900/5'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {res.status === 'cancelled' 
                        ? t('calendar.legend.cancelled') 
                        : res.locker_number 
                        ? (language === 'ko' ? '체크인 완료' : 'Checked In') 
                        : t('calendar.legend.confirmed')}
                    </span>
                  </td>
                  
                  {/* 고객명 */}
                  <td className="p-3 font-semibold text-stone-800">
                    <div className="flex items-center gap-1.5">
                      {res.locker_number && <span className="text-xs" title={`Locker: ${res.locker_number}`}>🔑</span>}
                      {res.customer_name}
                      {isOwner && (
                        <span className="text-[9px] text-emerald-750 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 font-bold">
                          {language === 'ko' ? '내예약' : 'Mine'}
                        </span>
                      )}
                    </div>
                  </td>
                  
                  {/* 연락처 */}
                  <td className="p-3 text-stone-600 font-mono">
                    {res.customer_phone ? formatUSPhone(res.customer_phone) : '-'}
                  </td>
                  
                  {/* 예약 일시 */}
                  <td className="p-3 text-stone-600">
                    {formatDateTime(res.start_time)}
                  </td>
                  
                  {/* 배정 마사지사 */}
                  <td className="p-3 text-stone-700">
                    👤 {therapist ? therapist.name : (language === 'ko' ? '미배정 (삭제됨)' : 'Unassigned (Deleted)')}
                  </td>
                  
                  {/* 결제 금액 */}
                  <td className="p-3 text-right font-bold text-emerald-700">
                    ${res.price.toLocaleString()}
                  </td>
                  
                  {/* 등록자 */}
                  <td className="p-3 text-stone-600">
                    {getEmployeeName(res.created_by)}
                  </td>
                  
                  {/* 관리 */}
                  <td className="p-3 text-center">
                    {canModify && (
                      <button
                        onClick={() => onSelectReservation(res)}
                        className="p-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-600 hover:text-stone-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title={language === 'ko' ? '예약 변경/취소' : 'Edit/Cancel Booking'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // 4. 카드 형식 (Card View) 렌더러
  const renderCardView = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
        {filtered.map((res, index) => {
          const therapist = therapists.find(t => t.id === res.therapist_id)
          const isOwner = res.created_by === currentUserId
          const isManager = currentUserRole === 'manager'
          const isStaff = currentUserRole === 'staff'
          const canModify = isManager || isStaff

          return (
            <div
              key={res.id}
              className={`relative rounded-xl border p-5 bg-stone-100/50 hover:bg-stone-100/80 transition-all flex flex-col justify-between group border-stone-200 ${
                res.status === 'cancelled'
                  ? 'opacity-60'
                  : ''
              }`}
            >
              {/* 상단 뱃지 및 상태 표기 */}
              <div className="flex justify-between items-start gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-stone-200 text-stone-600 font-bold px-1.5 py-0.5 rounded font-mono">
                    #{index + 1}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        res.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : res.locker_number
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {res.status === 'cancelled' 
                        ? t('calendar.legend.cancelled') 
                        : res.locker_number 
                        ? (language === 'ko' ? '체크인 완료' : 'Checked In') 
                        : t('calendar.legend.confirmed')}
                    </span>
                  </div>
                </div>

                {/* 수정 버튼 (권한이 있는 경우 노출) */}
                {canModify && (
                  <button
                    onClick={() => onSelectReservation(res)}
                    className="p-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-600 hover:text-stone-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title={language === 'ko' ? '예약 변경/취소' : 'Edit/Cancel Booking'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 고객 및 예약 요약 */}
              <div className="space-y-2.5 flex-1">
                <h3 className="text-base font-bold text-stone-800 tracking-tight flex items-center gap-1.5">
                  <User className="w-4 h-4 text-stone-400" />
                  {res.locker_number && <span className="text-xs" title={`Locker: ${res.locker_number}`}>🔑</span>}
                  {res.customer_name}
                </h3>

                {res.customer_phone && (
                  <p className="text-xs text-stone-600 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-stone-400" /> {formatUSPhone(res.customer_phone)}
                  </p>
                )}

                <p className="text-xs text-stone-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" /> {formatDateTime(res.start_time)}
                </p>

                <div className="rounded-lg bg-white p-3 mt-3 border border-stone-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-stone-500 block mb-0.5">{t('list.table.therapist')}</span>
                    <span className="text-xs font-semibold text-stone-700">
                      {therapist ? therapist.name : (language === 'ko' ? '미배정 (삭제됨)' : 'Unassigned (Deleted)')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-stone-500 block mb-0.5">{t('booking.modal.price')}</span>
                    <span className="text-xs font-bold text-emerald-700 flex items-center justify-end">
                      <DollarSign className="w-3.5 h-3.5" /> {res.price.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 하단 생성자(소유주) 정보 표시 */}
              <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
                <span>{t('list.table.creator')}: {getEmployeeName(res.created_by)}</span>
                {isOwner && (
                  <span className="font-semibold text-emerald-750 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]">
                    {language === 'ko' ? '내 예약' : 'My Booking'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 검색 및 필터 바 */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-stone-100/40 p-4 rounded-xl border border-stone-200">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          {/* 기간 필터 */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-stone-500 uppercase whitespace-nowrap mr-1">
              {language === 'ko' ? '예약기간:' : 'Booking Period:'}
            </span>
            <div className="relative flex items-center gap-1.5 bg-white border border-stone-200 hover:border-stone-300 rounded-xl px-3 py-1.5 transition-colors focus-within:border-emerald-500/80 shadow-inner group min-w-[130px] min-h-[32px]">
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 pointer-events-none font-medium text-xs text-stone-800 w-full">
                <Calendar className="w-3.5 h-3.5 text-emerald-700 group-hover:text-emerald-800 transition-colors" />
                <span>{startDate ? toUIDateString(startDate) : ''}</span>
              </div>
            </div>
            <span className="text-stone-400 text-xs px-0.5">~</span>
            <div className="relative flex items-center gap-1.5 bg-white border border-stone-200 hover:border-stone-300 rounded-xl px-3 py-1.5 transition-colors focus-within:border-emerald-500/80 shadow-inner group min-w-[130px] min-h-[32px]">
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 pointer-events-none font-medium text-xs text-stone-800 w-full">
                <Calendar className="w-3.5 h-3.5 text-emerald-700 group-hover:text-emerald-800 transition-colors" />
                <span>{endDate ? toUIDateString(endDate) : ''}</span>
              </div>
            </div>
          </div>

          {/* 텍스트 검색 */}
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder={language === 'ko' ? '고객명, 연락처, 마사지사 검색...' : 'Search customer, phone, therapist...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto justify-end items-center">
          {/* 보기 형식 토글 그룹 */}
          <div className="flex bg-stone-100 border border-stone-200 rounded-xl p-0.5 shadow-inner">
            <button
              onClick={() => setViewTypeState('card')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all relative overflow-visible ${
                activeViewType === 'card'
                  ? 'bg-stone-200 text-stone-800 border border-stone-300 shadow'
                  : 'bg-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {language === 'ko' ? '카드 형식' : 'Card View'}
              {activeViewType !== 'card' && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
              )}
            </button>
            <button
              onClick={() => setViewTypeState('table')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all ${
                activeViewType === 'table'
                  ? 'bg-stone-200 text-stone-800 border border-stone-300 shadow'
                  : 'bg-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {language === 'ko' ? '표 형식' : 'Table View'}
            </button>
          </div>

          {/* 상태 필터 그룹 */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterStatus('confirmed')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all ${
                filterStatus === 'confirmed'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-stone-200 hover:bg-stone-300 text-stone-700 hover:text-stone-900'
              }`}
            >
              {language === 'ko' ? '확정된 예약' : 'Confirmed'}
            </button>
            <button
              onClick={() => setFilterStatus('cancelled')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all ${
                filterStatus === 'cancelled'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-stone-200 hover:bg-stone-300 text-stone-700 hover:text-stone-900'
              }`}
            >
              {language === 'ko' ? '취소된 예약' : 'Cancelled'}
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all ${
                filterStatus === 'all'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-stone-200 hover:bg-stone-300 text-stone-700 hover:text-stone-900'
              }`}
            >
              {language === 'ko' ? '전체 보기' : 'Show All'}
            </button>
          </div>
        </div>
      </div>

      {/* 조회 정보 메타 요약 */}
      <div className="text-[11px] text-stone-500 font-bold flex items-center gap-1.5 pl-1.5">
        <span>{language === 'ko' ? '📊 조회된 예약 건수:' : '📊 Bookings Found:'}</span>
        <span className="text-emerald-700 font-extrabold font-mono text-xs">
          {filtered.length}{language === 'ko' ? '건' : ''}
        </span>
        <span className="text-stone-300">|</span>
        <span className="text-stone-500 font-mono">{toUIDateString(startDate)} ~ {toUIDateString(endDate)}</span>
      </div>

      {/* 예약 리스트 그리드/표 분기 */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-100/40 py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <p className="text-sm text-stone-500">{t('list.no_data')}</p>
        </div>
      ) : activeViewType === 'table' ? (
        renderTableView()
      ) : (
        renderCardView()
      )}
    </div>
  )
}
