'use client'

import React, { useState, useEffect } from 'react'
import { ShieldAlert, Search, ChevronDown, ChevronUp, Phone, User, Calendar, DollarSign, Award, Ban, Info, RefreshCw, Clock } from 'lucide-react'
import { Reservation, Therapist } from '../dashboard/CalendarView'
import { SupabaseClient } from '@supabase/supabase-js'
import { useLanguage } from '@/app/LanguageContext'
import { formatUSPhone } from '@/utils/phoneFormatter'

interface BlacklistManagerProps {
  supabase: SupabaseClient
  currentUserId: string
}

interface CustomerCancelGroup {
  name: string
  phone: string
  cancelledCount: number
  confirmedCount: number
  totalCount: number
  totalLoss: number
  penaltyPoints: number
  lastCancelledDate: string | null
  cancellations: Reservation[]
  avgDurationMs: number | null
}


export default function BlacklistManager({ supabase, currentUserId }: BlacklistManagerProps) {
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [cancelTimeMap, setCancelTimeMap] = useState<{ [resId: number]: string }>({})
  
  const [searchTerm, setSearchTerm] = useState('')
  const [minCancelCount, setMinCancelCount] = useState<number>(1) // 기본 1회 이상
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null) // '이름-연락처' 형태

  const fetchData = async () => {
    setLoading(true)
    try {
      // 마사지사 정보 로드
      const { data: tData, error: tError } = await supabase
        .from('therapists')
        .select('*')
      if (tError) throw tError
      setTherapists(tData as Therapist[])

      // 모든 예약 목록 로드 (취소 내역 분석용으로 전체를 가져옵니다.)
      const { data: rData, error: rError } = await supabase
        .from('reservations')
        .select('*')
      if (rError) throw rError
      if (rData) {
        const mapped = (rData as Reservation[]).map(r => ({
          ...r,
          is_premium: Number(r.price) >= 120
        }))
        setReservations(mapped)
      }

      // 취소 로그 로드
      const { data: logData, error: logError } = await supabase
        .from('reservation_logs')
        .select('reservation_id, performed_at')
        .eq('action', 'cancel')
      if (logError) throw logError

      const map: { [resId: number]: string } = {}
      if (logData) {
        logData.forEach((log: any) => {
          map[log.reservation_id] = log.performed_at
        })
      }
      setCancelTimeMap(map)
    } catch (err) {
      console.error('Error fetching data for BlacklistManager:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===================================================
  // [고객별 취소 데이터 집계 로직]
  // ===================================================
  const getCustomerGroups = (): CustomerCancelGroup[] => {
    const groups: { [key: string]: CustomerCancelGroup } = {}

    reservations.forEach(res => {
      const name = res.customer_name.trim()
      const phone = (res.customer_phone || '').trim()
      // 이름과 숫자 포맷 연락처 조합으로 정밀 동일인 분류
      const cleanPhone = phone.replace(/\D/g, '')
      const key = `${name}_${cleanPhone}`

      if (!groups[key]) {
        groups[key] = {
          name,
          phone,
          cancelledCount: 0,
          confirmedCount: 0,
          totalCount: 0,
          totalLoss: 0,
          penaltyPoints: 0,
          lastCancelledDate: null,
          cancellations: [],
          avgDurationMs: null
        }
      }

      groups[key].totalCount += 1
      if (res.status === 'cancelled') {
        groups[key].cancelledCount += 1
        groups[key].totalLoss += Number(res.price)
        groups[key].cancellations.push(res)
        groups[key].penaltyPoints += Number(res.penalty_points || 0)
        
        // 최근 취소 일시 갱신
        if (!groups[key].lastCancelledDate || new Date(res.start_time) > new Date(groups[key].lastCancelledDate!)) {
          groups[key].lastCancelledDate = res.start_time
        }
      } else {
        groups[key].confirmedCount += 1
      }
    })

    // 객체를 배열로 변환하고 필터링 및 정렬
    return Object.values(groups)
      .map(g => {
        // 예약 생성 시점(created_at)부터 취소 로그의 수행 시점(performed_at)까지의 평균 간격 계산
        let totalDuration = 0
        let countWithLogs = 0
        g.cancellations.forEach(res => {
          const cancelTime = cancelTimeMap[res.id]
          if (cancelTime) {
            const createdAtTime = new Date(res.created_at).getTime()
            const cancelAtTime = new Date(cancelTime).getTime()
            const diff = cancelAtTime - createdAtTime
            if (diff >= 0) {
              totalDuration += diff
              countWithLogs += 1
            }
          }
        })
        g.avgDurationMs = countWithLogs > 0 ? totalDuration / countWithLogs : null
        return g
      })
      // 취소 페널티가 minCancelCount 이상 존재하는 고객들만 1차 대상
      .filter(g => g.penaltyPoints >= minCancelCount)
      // 검색어 필터링 (이름 또는 연락처)
      .filter(g => 
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        g.phone.includes(searchTerm.replace(/\D/g, ''))
      )
      // 각 그룹의 cancellations 리스트를 최신 시간순 정렬
      .map(g => {
        g.cancellations.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        return g
      })
      // 페널티 점수가 높은 순 -> 취소 피해 금액이 많은 순 정렬
      .sort((a, b) => {
        if (b.penaltyPoints !== a.penaltyPoints) return b.penaltyPoints - a.penaltyPoints
        return b.totalLoss - a.totalLoss
      })
  }

  const customerGroups = getCustomerGroups()

  // 4. 날짜/시간 포맷터
  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${date}-${year} ${hours}:${minutes}`
  }

  // 시간 간격 포맷터
  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined || ms < 0) return t('blacklist.no_log')
    const totalMinutes = Math.floor(ms / (1000 * 60))
    if (totalMinutes < 60) {
      return `${totalMinutes}${language === 'ko' ? '분' : 'm'}`
    }
    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (totalHours < 24) {
      return language === 'ko' ? `${totalHours}시간 ${minutes}분` : `${totalHours}h ${minutes}m`
    }
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    return language === 'ko' ? `${days}일 ${hours}시간 ${minutes}분` : `${days}d ${hours}h ${minutes}m`
  }

  // 아코디언 토글
  const toggleExpand = (key: string) => {
    if (expandedCustomer === key) {
      setExpandedCustomer(null)
    } else {
      setExpandedCustomer(key)
    }
  }

  return (
    <div className="space-y-4">
      {/* 안내 알림판 */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-emerald-800">{t('blacklist.guide.title')}</h4>
          <p className="text-[11px] text-stone-600 leading-relaxed">
            {t('blacklist.guide.desc')}
          </p>
        </div>
      </div>

      {/* 필터 및 검색 제어바 */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-stone-100/50 p-4 rounded-xl border border-stone-200 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* 검색창 */}
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder={t('blacklist.filter.search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors"
            />
          </div>

          {/* 최소 취소 횟수 필터 */}
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-1.5 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-stone-500 uppercase whitespace-nowrap">{t('blacklist.filter.label')}</span>
            <select
              value={minCancelCount}
              onChange={(e) => setMinCancelCount(Number(e.target.value))}
              className="bg-transparent border-none text-xs text-stone-700 focus:outline-none cursor-pointer"
            >
              <option value={1} className="bg-white text-stone-800">{t('blacklist.filter.penalty_all')}</option>
              <option value={3} className="bg-white text-stone-800">{t('blacklist.filter.penalty_warning')}</option>
              <option value={5} className="bg-white text-stone-800">{t('blacklist.filter.penalty_danger')}</option>
            </select>
          </div>
        </div>

        {/* 새로고침 버튼 */}
        <button
          onClick={fetchData}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-200 hover:bg-stone-300 text-stone-700 hover:text-stone-800 px-3 py-2 text-xs font-bold transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t('blacklist.sync')}
        </button>
      </div>

      {/* 데이터 테이블 */}
      {loading ? (
        <div className="h-80 flex items-center justify-center border border-stone-200 bg-stone-100/40 rounded-2xl">
          <span className="text-xs text-stone-500 animate-pulse font-medium">{t('blacklist.loading')}</span>
        </div>
      ) : customerGroups.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-100/40 py-16 text-center">
          <Award className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <p className="text-sm text-stone-500">{t('blacklist.no_records')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-100/40 backdrop-blur-md touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full min-w-[1000px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-200/50 text-[10px] font-bold text-stone-600 uppercase tracking-wider">
                <th className="p-4 text-center w-12">{t('blacklist.table.no')}</th>
                <th className="p-4">{t('blacklist.table.level')}</th>
                <th className="p-4">{t('list.table.client')}</th>
                <th className="p-4">{t('list.table.phone')}</th>
                <th className="p-4 text-center">{t('blacklist.table.penalty_points')}</th>
                <th className="p-4 text-center">{t('blacklist.table.cancel_count')}</th>
                <th className="p-4 text-center">{t('blacklist.table.normal_count')}</th>
                <th className="p-4 text-center">{t('blacklist.table.cancel_rate')}</th>
                <th className="p-4 text-right">{t('blacklist.table.loss')}</th>
                <th className="p-4 text-center">{t('blacklist.table.avg_time')}</th>
                <th className="p-4">{t('blacklist.table.last_cancel')}</th>
                <th className="p-4 text-center w-24">{t('blacklist.table.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {customerGroups.map((group, index) => {
                const key = `${group.name}_${group.phone}`
                const isExpanded = expandedCustomer === key
                
                // 취소율 계산
                const cancelRate = Math.round((group.cancelledCount / group.totalCount) * 100)
                
                // 블랙리스트 경고 등급 판단
                let statusBadge = (
                  <span className="inline-flex items-center rounded-full bg-stone-200 text-stone-600 border border-stone-300 px-2.5 py-0.5 text-[10px] font-semibold">
                    {t('blacklist.badge.normal')}
                  </span>
                )
                let rowBgClass = ''
                if (group.penaltyPoints >= 5) {
                  statusBadge = (
                    <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold animate-pulse">
                      {t('blacklist.badge.danger')}
                    </span>
                  )
                  rowBgClass = 'bg-rose-500/5'
                } else if (group.penaltyPoints >= 3) {
                  statusBadge = (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[10px] font-semibold">
                      {t('blacklist.badge.warning')}
                    </span>
                  )
                  rowBgClass = 'bg-amber-500/5'
                }

                return (
                  <React.Fragment key={key}>
                    <tr className={`hover:bg-stone-100/60 transition-colors group cursor-pointer ${rowBgClass}`} onClick={() => toggleExpand(key)}>
                      {/* 순번 */}
                      <td className="p-4 text-center text-stone-400 font-mono text-[11px]">
                        {index + 1}
                      </td>
                      {/* 등급 */}
                      <td className="p-4">
                        {statusBadge}
                      </td>
                      {/* 고객명 */}
                      <td className="p-4 font-bold text-stone-800">
                        {group.name}
                      </td>
                      {/* 연락처 */}
                      <td className="p-4 text-stone-600 font-mono">
                        {group.phone ? formatUSPhone(group.phone) : '-'}
                      </td>
                      {/* 누적 페널티 */}
                      <td className="p-4 text-center font-extrabold text-emerald-700 font-mono text-sm">
                        {group.penaltyPoints}{t('blacklist.badge.penalty')}
                      </td>
                      {/* 취소 횟수 */}
                      <td className="p-4 text-center font-bold text-rose-700 font-mono">
                        {group.cancelledCount}{t('blacklist.times')}
                      </td>
                      {/* 정상 이용 */}
                      <td className="p-4 text-center font-mono text-stone-500">
                        {group.confirmedCount}{t('blacklist.times')}
                      </td>
                      {/* 취소율 */}
                      <td className="p-4 text-center">
                        <span className={`font-mono font-bold ${cancelRate >= 50 ? 'text-rose-700' : 'text-stone-500'}`}>
                          {cancelRate}%
                        </span>
                      </td>
                      {/* 기회 손실액 */}
                      <td className="p-4 text-right font-mono font-bold text-stone-700">
                        ${group.totalLoss.toLocaleString()}
                      </td>
                      {/* 평균 취소 소요 시간 */}
                      <td className="p-4 text-center font-mono text-emerald-700 font-semibold">
                        {formatDuration(group.avgDurationMs)}
                      </td>
                      {/* 최근 취소일 */}
                      <td className="p-4 text-stone-600 font-mono">
                        {group.lastCancelledDate ? formatDateTime(group.lastCancelledDate) : '-'}
                      </td>
                      {/* 아코디언 토글 */}
                      <td className="p-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(key)
                          }}
                          className="p-1 rounded bg-stone-200 hover:bg-stone-300 text-stone-500 group-hover:text-stone-800 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                    {/* 아코디언 확장 취소 예약 로그 목록 */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={12} className="p-0 bg-stone-100/30 border-t border-b border-stone-200">
                          <div className="p-5 space-y-3">
                            <div className="flex items-center gap-1.5 text-stone-500 text-xs font-bold pl-1 border-l-2 border-l-rose-600">
                              <Ban className="w-3.5 h-3.5 text-rose-700" />
                              <span>
                                {t('blacklist.detail.title')
                                  .replace('{name}', group.name)
                                  .replace('{count}', group.cancelledCount.toString())}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {group.cancellations.map(res => {
                                const therapist = therapists.find(t => t.id === res.therapist_id)
                                return (
                                  <div 
                                    key={res.id} 
                                    className="bg-white border border-stone-200 rounded-xl p-4 space-y-2 text-xs hover:border-stone-300 transition-colors relative"
                                  >
                                    <div className="flex justify-between items-center pb-1.5 border-b border-stone-200">
                                      <span className="text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                                        {t('blacklist.detail.status.cancelled')}
                                      </span>
                                      <span className="text-stone-400 font-mono text-[10px]">ID: #{res.id}</span>
                                    </div>
                                    
                                    <div className="space-y-1.5 text-[11px] text-stone-600">
                                      <p className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-stone-400" />
                                        <span>{t('blacklist.detail.booked_use')}</span>
                                        <span className="font-semibold text-stone-800">{formatDateTime(res.start_time)}</span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-stone-400" />
                                        <span>{t('blacklist.detail.created_at')}</span>
                                        <span className="font-mono text-stone-600">{formatDateTime(res.created_at)}</span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-rose-600/50" />
                                        <span>{t('blacklist.detail.cancelled_at')}</span>
                                        <span className="font-mono text-rose-700 font-bold">
                                          {cancelTimeMap[res.id] ? formatDateTime(cancelTimeMap[res.id]) : t('blacklist.no_log')}
                                        </span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-emerald-700/50" />
                                        <span>{t('blacklist.detail.duration')}</span>
                                        <span className="font-bold text-emerald-700 font-mono">
                                          {cancelTimeMap[res.id] 
                                            ? formatDuration(new Date(cancelTimeMap[res.id]).getTime() - new Date(res.created_at).getTime()) 
                                            : t('blacklist.no_log')}
                                        </span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-stone-400" />
                                        <span>{t('blacklist.detail.therapist')}</span>
                                        <span className="font-semibold text-stone-800">{therapist ? therapist.name : t('blacklist.detail.no_assign')}</span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <DollarSign className="w-3.5 h-3.5 text-stone-400" />
                                        <span>{t('blacklist.detail.price')}</span>
                                        <span className="font-bold text-stone-800">${Number(res.price).toLocaleString()}</span>
                                      </p>
                                      {res.cancellation_type && (
                                        <>
                                          <p className="flex items-center gap-1.5 border-t border-stone-200 pt-1.5 mt-1.5">
                                            <Award className="w-3.5 h-3.5 text-emerald-700/50" />
                                            <span>{t('blacklist.detail.cancel_type')}</span>
                                            <span className="font-semibold text-stone-800">
                                              {res.cancellation_type === 'request' 
                                                ? t('booking.modal.cancel.type_request') 
                                                : res.cancellation_type === 'noshow' 
                                                  ? t('booking.modal.cancel.type_noshow') 
                                                  : t('booking.modal.cancel.type_normal')}
                                            </span>
                                          </p>
                                          <p className="flex items-center gap-1.5">
                                            <Award className="w-3.5 h-3.5 text-emerald-700/50" />
                                            <span>{t('blacklist.detail.penalty')}</span>
                                            <span className="font-bold text-emerald-700">
                                              {res.penalty_points}{t('blacklist.badge.penalty')}
                                            </span>
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

