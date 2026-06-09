'use client'

import React, { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { UserSim, useUserSim } from '@/app/providers'
import { UserPlus, Trash2, Key, Users, Ban, Edit, X } from 'lucide-react'

interface EmployeeManagerProps {
  supabase: SupabaseClient
  currentUserId: string
  onRefresh: () => void
}

export default function EmployeeManager({
  supabase,
  currentUserId,
  onRefresh
}: EmployeeManagerProps) {
  const { refreshUsers } = useUserSim()
  const [employees, setEmployees] = useState<UserSim[]>([])
  
  // 가입 폼 상태
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('password123') // 기본 비밀번호 지정
  const [role, setRole] = useState<'manager' | 'staff'>('staff')

  // 수정 폼 상태
  const [editingEmployee, setEditingEmployee] = useState<UserSim | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'manager' | 'staff'>('staff')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 1. 직원 목록 로드
  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employee')
        .select('id, name, role, phone, email')
        .order('created_at', { ascending: true })
      
      if (error) throw error
      if (data) setEmployees(data as UserSim[])
    } catch (err) {
      console.error('Fetch employees error:', err)
    }
  }

  useEffect(() => {
    fetchEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. 신규 직원 계정 추가 (Supabase Auth + employee 테이블 동기화)
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) {
      setErrorMsg('이름, 이메일, 비밀번호는 필수 입력 사항입니다.')
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // Step A: Supabase Auth 회원가입 API 호출
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name
          }
        }
      })

      if (authError) throw authError
      if (!authData.user?.id) {
        throw new Error('계정 정보(UUID)를 발급받지 못했습니다.')
      }

      const newUserId = authData.user.id

      // Step B: 가입 완료된 UUID를 외래키로 삼아 employee 테이블에 데이터 주입
      const { error: dbError } = await supabase
        .from('employee')
        .insert({
          id: newUserId,
          name,
          role,
          phone: phone.trim() || null,
          email: email.trim() || null
        })

      if (dbError) {
        console.error('DB Insert error:', dbError)
        throw new Error(`인증계정(${email})은 생성되었으나 권한 정보 입력에 실패했습니다: ${dbError.message}`)
      }

      setSuccessMsg(`성공: '${name}' 직원이 등록되었습니다! (초기 비번: ${password})`)
      setName('')
      setEmail('')
      setPhone('')
      setRole('staff')
      
      // 목록 리로드
      fetchEmployees()
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || '직원 계정 등록 도중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 3. 직원 정보 수정 처리
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmployee) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase
        .from('employee')
        .update({
          name: editName,
          role: editRole,
          phone: editPhone.trim() || null,
          email: editEmail.trim() || null
        })
        .eq('id', editingEmployee.id)

      if (error) throw error

      setSuccessMsg(`성공: '${editName}' 직원의 정보가 수정되었습니다.`)
      setEditingEmployee(null)
      
      fetchEmployees()
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || '직원 정보 수정 도중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 4. 비밀번호 초기화 핸들러
  const handleResetPassword = async (id: string, employeeName: string) => {
    const newPassword = prompt(`'${employeeName}' 직원의 새 비밀번호를 입력해주세요.\n(미입력 시 'password123'으로 설정됩니다.)`)
    if (newPassword === null) return // 취소됨

    const finalPassword = newPassword.trim() || 'password123'

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { data, error } = await supabase.rpc('reset_user_password', {
        user_uuid: id,
        new_password: finalPassword
      })

      if (error) throw error

      setSuccessMsg(`성공: '${employeeName}' 직원의 비밀번호가 초기화되었습니다! (새 비밀번호: ${finalPassword})`)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || '비밀번호 초기화 도중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 5. 직원 삭제 핸들러
  const handleDeleteEmployee = async (id: string, employeeName: string) => {
    if (id === currentUserId) {
      alert('자기 자신(현재 세션 유저)의 계정은 삭제할 수 없습니다.')
      return
    }

    if (!confirm(`직원 '${employeeName}'을(를) 정말로 삭제하시겠습니까?\n(인증 레코드 및 모든 예약 연계 참조 정보가 함께 정리될 수 있습니다.)`)) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('employee')
        .delete()
        .eq('id', id)

      if (error) throw error

      setSuccessMsg(`성공: '${employeeName}' 권한 데이터가 정리되었습니다.`)
      
      fetchEmployees()
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      alert(err.message || '직원 삭제에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (emp: UserSim) => {
    setEditingEmployee(emp)
    setEditName(emp.name || '')
    setEditRole(emp.role === 'manager' ? 'manager' : 'staff')
    setEditPhone(emp.phone || '')
    setEditEmail(emp.email || '')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
      {/* 프론트 직원 등록 폼 */}
      <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 h-fit">
        <h3 className="text-sm font-bold tracking-tight text-slate-200 mb-4 flex items-center gap-1.5 uppercase">
          <UserPlus className="w-4 h-4 text-indigo-500" /> 신규 직원 계정 추가
        </h3>
        
        <form onSubmit={handleAddEmployee} className="space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 text-xs rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {successMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">직원 성함</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">이메일 계정 (ID)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예: staff1@jjimjil.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">연락처</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="예: 010-1234-5678"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">로그인 비밀번호</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 설정"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">유저 권한</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'manager' | 'staff')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
            >
              <option value="staff">Staff (일반 프론트 직원)</option>
              <option value="manager">Manager (대시보드 총괄 관리자)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
          >
            {loading ? '인증계정 발급 중...' : '직원 계정 생성'}
          </button>
        </form>
      </div>

      {/* 직원 목록 관리 */}
      <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-bold tracking-tight text-slate-200 mb-4 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-500" /> 프론트 근무 직원 명단 ({employees.length}명)
        </h3>

        <div className="overflow-x-auto rounded-lg border border-slate-850 bg-slate-950/20">
          <table className="min-w-full divide-y divide-slate-850">
            <thead className="bg-slate-950/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
              <tr>
                <th className="px-4 py-3">직원 정보</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">역할 권한</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
              {employees.map((emp) => {
                const isMe = emp.id === currentUserId
                return (
                  <tr key={emp.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        {emp.name} {isMe && <span className="text-[10px] text-indigo-400 font-bold">(나)</span>}
                      </div>
                      <div className="font-mono text-slate-500 text-[9px] mt-0.5">{emp.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium">{emp.email || '-'}</td>
                    <td className="px-4 py-3 text-slate-300 font-medium">{emp.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        emp.role === 'manager'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10'
                      }`}>
                        {emp.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(emp)}
                          className="p-1 rounded-lg hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-400 transition-colors"
                          title="정보 수정"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(emp.id, emp.name)}
                          className="p-1 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-colors"
                          title="비밀번호 초기화"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        {isMe ? (
                          <span className="p-1 text-slate-700 cursor-not-allowed" title="본인 삭제 불가">
                            <Ban className="w-4 h-4" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                            title="직원 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 직원 정보 수정 모달 */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setEditingEmployee(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-1.5">
              <Edit className="w-4 h-4 text-indigo-400" /> 직원 정보 수정
            </h3>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">직원 성함</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">이메일 계정</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="예: staff1@jjimjil.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">연락처</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">유저 권한</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'manager' | 'staff')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                >
                  <option value="staff">Staff (일반 프론트 직원)</option>
                  <option value="manager">Manager (대시보드 총괄 관리자)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {loading ? '수정 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

