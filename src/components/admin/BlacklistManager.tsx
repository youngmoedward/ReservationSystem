'use client'

import React, { useState, useEffect } from 'react'
import { ShieldAlert, Search, ChevronDown, ChevronUp, Phone, User, Calendar, DollarSign, Award, Ban, Info, RefreshCw, Clock } from 'lucide-react'
import { Reservation, Therapist } from '../dashboard/CalendarView'
import { SupabaseClient } from '@supabase/supabase-js'

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
  lastCancelledDate: string | null
  cancellations: Reservation[]
  avgDurationMs: number | null
}

export default function BlacklistManager({ supabase, currentUserId }: BlacklistManagerProps) {
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
      setReservations(rData as Reservation[])

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
      const key = `${name}_${phone}`

      if (!groups[key]) {
        groups[key] = {
          name,
          phone,
          cancelledCount: 0,
          confirmedCount: 0,
          totalCount: 0,
          totalLoss: 0,
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
      // 취소 건수가 1회 이상 존재하는 고객들만 1차 대상
      .filter(g => g.cancelledCount >= minCancelCount)
      // 검색어 필터링 (이름 또는 연락처)
      .filter(g => 
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        g.phone.includes(searchTerm)
      )
      // 각 그룹의 cancellations 리스트를 최신 시간순 정렬
      .map(g => {
        g.cancellations.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        return g
      })
      // 취소 건수가 많은 순 -> 취소 피해 금액이 많은 순 정렬
      .sort((a, b) => {
        if (b.cancelledCount !== a.cancelledCount) return b.cancelledCount - a.cancelledCount
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
    return `${year}-${month}-${date} ${hours}:${minutes}`
  }

  // 시간 간격 포맷터
  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined || ms < 0) return '기록 없음'
    const totalMinutes = Math.floor(ms / (1000 * 60))
    if (totalMinutes < 60) {
      return `${totalMinutes}분`
    }
    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (totalHours < 24) {
      return `${totalHours}시간 ${minutes}분`
    }
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    return `${days}일 ${hours}시간 ${minutes}분`
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
      <div className="rounded-xl border border-indigo-550/15 bg-indigo-500/5 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-indigo-300">💡 블랙리스트 분석 가이드</h4>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            이 화면은 예약 데이터 내의 취소 기록을 바탕으로 **잦은 부도(No-Show) 및 취소 고객**을 분석하는 용도입니다. 
            취소 비율이 높고 건수가 잦은 고객은 예약 접수 시 확인 전화를 하거나 사전 예치금을 요청하여 기회비용 손실을 예방하십시오.
          </p>
        </div>
      </div>

      {/* 필터 및 검색 제어바 */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* 검색창 */}
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="고객 이름, 연락처 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          {/* 최소 취소 횟수 필터 */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 rounded-xl px-3 py-1.5 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">필터 대상:</span>
            <select
              value={minCancelCount}
              onChange={(e) => setMinCancelCount(Number(e.target.value))}
              className="bg-transparent border-none text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={1} className="bg-slate-950">전체 취소 이력 (1회 이상)</option>
              <option value={3} className="bg-slate-950">⚠️ 주의 대상 (3회 이상)</option>
              <option value={5} className="bg-slate-950">🚨 블랙리스트 위험 (5회 이상)</option>
            </select>
          </div>
        </div>

        {/* 새로고침 버튼 */}
        <button
          onClick={fetchData}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 px-3 py-2 text-xs font-bold transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 분석 동기화
        </button>
      </div>

      {/* 데이터 테이블 */}
      {loading ? (
        <div className="h-80 flex items-center justify-center border border-slate-900 bg-slate-900/10 rounded-2xl">
          <span className="text-xs text-slate-400 animate-pulse font-medium">취소자 데이터를 종합 집계하는 중...</span>
        </div>
      ) : customerGroups.length === 0 ? (
        <div className="rounded-xl border border-slate-850 bg-slate-900/10 py-16 text-center">
          <Award className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400">조건에 부합하는 취소 이력 고객이 존재하지 않습니다.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="p-4 text-center w-12">No</th>
                <th className="p-4">등급</th>
                <th className="p-4">고객명</th>
                <th className="p-4">연락처</th>
                <th className="p-4 text-center">취소 횟수</th>
                <th className="p-4 text-center">정상 이용</th>
                <th className="p-4 text-center">취소율(%)</th>
                <th className="p-4 text-right">누적 기회손실</th>
                <th className="p-4 text-center">평균 취소 소요 시간</th>
                <th className="p-4">최근 취소 일시</th>
                <th className="p-4 text-center w-24">세부 기록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60">
              {customerGroups.map((group, index) => {
                const key = `${group.name}_${group.phone}`
                const isExpanded = expandedCustomer === key
                
                // 취소율 계산
                const cancelRate = Math.round((group.cancelledCount / group.totalCount) * 100)
                
                // 블랙리스트 경고 등급 판단
                let statusBadge = (
                  <span className="inline-flex items-center rounded-full bg-slate-800 text-slate-450 border border-slate-750 px-2.5 py-0.5 text-[10px] font-semibold">
                    일반
                  </span>
                )
                let rowBgClass = ''
                if (group.cancelledCount >= 5) {
                  statusBadge = (
                    <span className="inline-flex items-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold animate-pulse">
                      🚨 블랙리스트 위험
                    </span>
                  )
                  rowBgClass = 'bg-rose-500/5'
                } else if (group.cancelledCount >= 3) {
                  statusBadge = (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold">
                      ⚠️ 주의 대상
                    </span>
                  )
                  rowBgClass = 'bg-amber-500/5'
                }

                return (
                  <React.Fragment key={key}>
                    <tr className={`hover:bg-slate-850/30 transition-colors group cursor-pointer ${rowBgClass}`} onClick={() => toggleExpand(key)}>
                      {/* 순번 */}
                      <td className="p-4 text-center text-slate-500 font-mono text-[11px]">
                        {index + 1}
                      </td>
                      {/* 등급 */}
                      <td className="p-4">
                        {statusBadge}
                      </td>
                      {/* 고객명 */}
                      <td className="p-4 font-bold text-slate-200">
                        {group.name}
                      </td>
                      {/* 연락처 */}
                      <td className="p-4 text-slate-400 font-mono">
                        {group.phone || '-'}
                      </td>
                      {/* 취소 횟수 */}
                      <td className="p-4 text-center font-bold text-rose-400 font-mono text-sm">
                        {group.cancelledCount}회
                      </td>
                      {/* 정상 이용 */}
                      <td className="p-4 text-center font-mono text-slate-450">
                        {group.confirmedCount}회
                      </td>
                      {/* 취소율 */}
                      <td className="p-4 text-center">
                        <span className={`font-mono font-bold ${cancelRate >= 50 ? 'text-rose-400' : 'text-slate-350'}`}>
                          {cancelRate}%
                        </span>
                      </td>
                      {/* 기회 손실액 */}
                      <td className="p-4 text-right font-mono font-bold text-slate-300">
                        {group.totalLoss.toLocaleString()}원
                      </td>
                      {/* 평균 취소 소요 시간 */}
                      <td className="p-4 text-center font-mono text-indigo-400 font-semibold">
                        {formatDuration(group.avgDurationMs)}
                      </td>
                      {/* 최근 취소일 */}
                      <td className="p-4 text-slate-400 font-mono">
                        {group.lastCancelledDate ? formatDateTime(group.lastCancelledDate) : '-'}
                      </td>
                      {/* 아코디언 토글 */}
                      <td className="p-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(key)
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-400 group-hover:text-slate-100 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                    
                    {/* 아코디언 확장 취소 예약 로그 목록 */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="p-0 bg-slate-950/40 border-t border-b border-slate-850">
                          <div className="p-5 space-y-3">
                            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold pl-1 border-l-2 border-l-rose-500">
                              <Ban className="w-3.5 h-3.5 text-rose-400" />
                              <span>{group.name} 고객님의 예약 취소 상세 기록 ({group.cancelledCount}건)</span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {group.cancellations.map(res => {
                                const therapist = therapists.find(t => t.id === res.therapist_id)
                                return (
                                  <div 
                                    key={res.id} 
                                    className="bg-slate-900 border border-slate-850 rounded-xl p-4 space-y-2 text-xs hover:border-slate-800 transition-colors relative"
                                  >
                                    <div className="flex justify-between items-center pb-1.5 border-b border-slate-850/50">
                                      <span className="text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded">
                                        취소됨
                                      </span>
                                      <span className="text-slate-500 font-mono text-[10px]">ID: #{res.id}</span>
                                    </div>
                                    
                                    <div className="space-y-1.5 text-[11px] text-slate-350">
                                      <p className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-550" />
                                        <span>예약 이용: </span>
                                        <span className="font-semibold text-slate-200">{formatDateTime(res.start_time)}</span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-600" />
                                        <span>접수 일시: </span>
                                        <span className="font-mono text-slate-400">{formatDateTime(res.created_at)}</span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-rose-500/50" />
                                        <span>취소 일시: </span>
                                        <span className="font-mono text-rose-450/95 font-bold">
                                          {cancelTimeMap[res.id] ? formatDateTime(cancelTimeMap[res.id]) : '기록 없음'}
                                        </span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-indigo-400/50" />
                                        <span>등록 후 취소까지: </span>
                                        <span className="font-bold text-indigo-400 font-mono">
                                          {cancelTimeMap[res.id] 
                                            ? formatDuration(new Date(cancelTimeMap[res.id]).getTime() - new Date(res.created_at).getTime()) 
                                            : '기록 없음'}
                                        </span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-slate-550" />
                                        <span>담당 마사지사: </span>
                                        <span className="font-semibold text-slate-200">{therapist ? therapist.name : '미배정 (삭제됨)'}</span>
                                      </p>
                                      <p className="flex items-center gap-1.5">
                                        <DollarSign className="w-3.5 h-3.5 text-slate-550" />
                                        <span>금액: </span>
                                        <span className="font-bold text-slate-200">{Number(res.price).toLocaleString()}원</span>
                                      </p>
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
