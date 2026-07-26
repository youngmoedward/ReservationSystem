'use client'

import React, { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { UserSim, useUserSim } from '@/app/providers'
import { UserPlus, Trash2, Key, Users, Edit, X } from 'lucide-react'
import { useLanguage } from '@/app/LanguageContext'
import { formatUSPhone, stripPhone } from '@/utils/phoneFormatter'
import PinAuthModal, { PinAuthResult } from '../common/PinAuthModal'

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
  const { language } = useLanguage()
  const [employees, setEmployees] = useState<UserSim[]>([])
  
  // 가입 폼 상태
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pinCode, setPinCode] = useState('1001')
  const [role, setRole] = useState<'manager' | 'leader' | 'staff'>('staff')
  const [isAddingEmployee, setIsAddingEmployee] = useState(false)

  // 수정 폼 상태
  const [editingEmployee, setEditingEmployee] = useState<UserSim | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'manager' | 'leader' | 'staff'>('staff')
  const [editPhone, setEditPhone] = useState('')
  const [editPinCode, setEditPinCode] = useState('')

  // PIN 인증 모달 상태
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    type: 'add' | 'update' | 'delete'
    title: string
    payload?: any
  } | null>(null)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 변경 이력 로그 작성 헬퍼
  const writeLog = async (action: 'create' | 'update' | 'delete', details: string, performer: PinAuthResult) => {
    try {
      let performerUuid: string | null = null
      if (performer.pin === '7717') {
        const { data } = await supabase
          .from('employee')
          .select('id')
          .eq('role', 'manager')
          .limit(1)
          .maybeSingle()
        performerUuid = data?.id || null
      } else {
        const { data } = await supabase
          .from('employee')
          .select('id')
          .eq('pin_code', performer.pin)
          .maybeSingle()
        performerUuid = data?.id || null
      }

      await supabase.from('reservation_logs').insert({
        log_type: 'employee',
        action,
        performed_by: performerUuid,
        details: `[수행자: ${performer.userName}] ${details}`
      })
    } catch (logErr) {
      console.error('Failed to write audit log:', logErr)
    }
  }

  // 1. 직원 목록 로드
  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employee')
        .select('*')
        .order('id', { ascending: true })
      
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

  // 2. 신규 직원 추가 실행
  const executeAddEmployee = async (performer: PinAuthResult) => {
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const targetPin = pinCode.trim() || '1001'

      const { data: existEmp } = await supabase
        .from('employee')
        .select('id, name')
        .eq('pin_code', targetPin)

      const { data: existTh } = await supabase
        .from('therapists')
        .select('id, name')
        .eq('pin_code', targetPin)

      if ((existEmp && existEmp.length > 0) || (existTh && existTh.length > 0)) {
        throw new Error(language === 'ko' ? '입력하신 PIN 번호는 이미 다른 직원이 사용 중입니다.' : 'This PIN code is already in use.')
      }

      const { error: dbErr } = await supabase
        .from('employee')
        .insert({
          name: name.trim(),
          role,
          phone: stripPhone(phone) || null,
          pin_code: pinCode.trim() || '1001'
        })

      if (dbErr) throw dbErr

      await writeLog(
        'create',
        `신규 직원 [${name.trim()}] 등록 (권한: ${role}, PIN: ${pinCode.trim()})`,
        performer
      )

      setSuccessMsg(language === 'ko' ? '직원이 성공적으로 등록되었습니다!' : 'Employee added successfully!')
      setName('')
      setPhone('')
      setPinCode(String(Math.floor(1000 + Math.random() * 9000)))
      setIsAddingEmployee(false)
      fetchEmployees()
      refreshUsers()
      onRefresh()

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Add employee error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '직원 등록 중 오류가 발생했습니다.' : 'Failed to add employee.'))
    } finally {
      setLoading(false)
    }
  }

  // 3. 직원 수정 모달 열기
  const openEditModal = (emp: UserSim) => {
    setEditingEmployee(emp)
    setEditName(emp.name)
    setEditRole((emp.role as 'manager' | 'leader' | 'staff') || 'staff')
    setEditPhone(emp.phone ? formatUSPhone(emp.phone) : '')
    setEditPinCode((emp as any).pin_code || '1001')
  }

  // 4. 직원 수정 실행
  const executeUpdateEmployee = async (performer: PinAuthResult) => {
    if (!editingEmployee) return
    setLoading(true)

    try {
      const targetPin = editPinCode.trim()

      const { data: existEmp } = await supabase
        .from('employee')
        .select('id, name')
        .eq('pin_code', targetPin)
        .neq('id', editingEmployee.id)

      const { data: existTh } = await supabase
        .from('therapists')
        .select('id, name')
        .eq('pin_code', targetPin)

      if ((existEmp && existEmp.length > 0) || (existTh && existTh.length > 0)) {
        throw new Error(language === 'ko' ? '입력하신 PIN 번호는 이미 다른 직원이 사용 중입니다.' : 'This PIN code is already in use.')
      }

      const { error } = await supabase
        .from('employee')
        .update({
          name: editName.trim(),
          role: editRole,
          phone: stripPhone(editPhone) || null,
          pin_code: editPinCode.trim()
        })
        .eq('id', editingEmployee.id)

      if (error) throw error

      await writeLog(
        'update',
        `직원 [${editingEmployee.name}] 정보 수정 (이름: ${editName}, 권한: ${editRole}, PIN: ${editPinCode})`,
        performer
      )

      setSuccessMsg(language === 'ko' ? '직원 정보가 수정되었습니다!' : 'Employee updated!')
      setEditingEmployee(null)
      fetchEmployees()
      refreshUsers()
      onRefresh()

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Update employee error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '직원 수정 중 오류가 발생했습니다.' : 'Failed to update employee.'))
    } finally {
      setLoading(false)
    }
  }

  // 5. 직원 삭제 실행
  const executeDeleteEmployee = async (performer: PinAuthResult, empId: string | number, empName: string) => {
    setLoading(true)

    try {
      const { error } = await supabase
        .from('employee')
        .delete()
        .eq('id', empId)

      if (error) throw error

      await writeLog('delete', `직원 [${empName}] 삭제 완료`, performer)
      setSuccessMsg(language === 'ko' ? '직원이 삭제되었습니다.' : 'Employee deleted.')
      fetchEmployees()
      refreshUsers()
      onRefresh()

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Delete employee error:', err)
      alert(language === 'ko' ? '직원 삭제 중 오류가 발생했습니다.' : 'Failed to delete employee.')
    } finally {
      setLoading(false)
    }
  }

  // PIN 모달 성공 콜백
  const handlePinSuccess = (result: PinAuthResult) => {
    setPinModalOpen(false)
    if (!pendingAction) return

    if (pendingAction.type === 'add') {
      executeAddEmployee(result)
    } else if (pendingAction.type === 'update') {
      executeUpdateEmployee(result)
    } else if (pendingAction.type === 'delete') {
      executeDeleteEmployee(result, pendingAction.payload.id, pendingAction.payload.name)
    }
    setPendingAction(null)
  }

  // 트리거
  const triggerAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setPendingAction({
      type: 'add',
      title: language === 'ko' ? `신규 직원 [${name}] 등록` : `Add Employee [${name}]`
    })
    setPinModalOpen(true)
  }

  const triggerUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmployee || !editName.trim()) return
    setPendingAction({
      type: 'update',
      title: language === 'ko' ? `직원 [${editName}] 정보 수정` : `Update Employee [${editName}]`
    })
    setPinModalOpen(true)
  }

  const triggerDelete = (emp: UserSim) => {
    if (!confirm(language === 'ko' ? `정말 [${emp.name}] 직원을 삭제하시겠습니까?` : `Delete employee [${emp.name}]?`)) return
    setPendingAction({
      type: 'delete',
      title: language === 'ko' ? `직원 [${emp.name}] 삭제` : `Delete Employee [${emp.name}]`,
      payload: emp
    })
    setPinModalOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 & 신규 직원 추가 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-700" />
            <span>{language === 'ko' ? '프론트 직원 등록 관리' : 'Staff Management'}</span>
          </h3>
          <p className="text-xs text-stone-500 mt-1 font-semibold">
            {language === 'ko'
              ? '카운터 직원 명단 및 4자리 PIN 번호를 관리합니다.'
              : 'Manage front staff and their 4-digit PIN numbers.'}
          </p>
        </div>

        <button
          onClick={() => setIsAddingEmployee(!isAddingEmployee)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white shadow-sm px-4 py-2 text-xs font-bold transition-all"
        >
          {isAddingEmployee ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {isAddingEmployee
            ? (language === 'ko' ? '취소' : 'Cancel')
            : (language === 'ko' ? '신규 직원 등록' : 'Add Staff')}
        </button>
      </div>

      {/* 상태 알림 메시지 */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold animate-in fade-in">
          {successMsg}
        </div>
      )}

      {/* 신규 직원 등록 폼 */}
      {isAddingEmployee && (
        <form onSubmit={triggerAdd} className="bg-purple-50/60 border border-purple-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in">
          <h4 className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-purple-700" />
            {language === 'ko' ? '신규 직원 정보 입력' : 'New Staff Details'}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-purple-900 mb-1">
                {language === 'ko' ? '직원 성함 *' : 'Name *'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 홍길동"
                className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-purple-900 mb-1">
                {language === 'ko' ? '직책 / 권한 *' : 'Role *'}
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-purple-500"
              >
                <option value="staff">일반 직원 (Staff)</option>
                <option value="leader">스태프 리더 (Staff Leader)</option>
                <option value="manager">총괄 매니저 (Manager)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-purple-950 mb-1 flex items-center justify-between">
                <span>{language === 'ko' ? '4자리 PIN 번호 *' : 'PIN Number *'}</span>
                <span className="text-[9px] text-purple-700">인증용</span>
              </label>
              <input
                type="text"
                maxLength={4}
                required
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="1001"
                className="w-full bg-white border border-purple-300 text-purple-950 font-mono font-black rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-purple-900 mb-1">
                {language === 'ko' ? '연락처' : 'Phone'}
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(formatUSPhone(e.target.value))}
                placeholder="(555) 000-0000"
                className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingEmployee(false)}
              className="px-4 py-2 rounded-xl bg-white border border-purple-200 text-stone-600 text-xs font-bold"
            >
              {language === 'ko' ? '취소' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-sm"
            >
              {loading ? (language === 'ko' ? '등록 중...' : 'Saving...') : (language === 'ko' ? '직원 등록' : 'Save Staff')}
            </button>
          </div>
        </form>
      )}

      {/* 직원 목록 테이블 */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100/80 border-b border-stone-200 text-stone-700 font-extrabold">
                <th className="py-3 px-4">직원 성함</th>
                <th className="py-3 px-4">직책 / 권한</th>
                <th className="py-3 px-4">PIN Number</th>
                <th className="py-3 px-4">연락처</th>
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-400 font-bold">
                    {language === 'ko' ? '등록된 직원이 없습니다.' : 'No staff registered.'}
                  </td>
                </tr>
              ) : (
                employees.map(emp => {
                  const empPin = (emp as any).pin_code || '1001'

                  return (
                    <tr key={emp.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-black text-stone-900">
                        {emp.name}
                      </td>

                      <td className="py-3 px-4 font-bold">
                        {emp.role === 'manager' && (
                          <span className="text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full text-[10px] border border-purple-200">
                            👑 총괄 매니저 (Manager)
                          </span>
                        )}
                        {emp.role === 'leader' && (
                          <span className="text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-200">
                            ⭐ 스태프 리더 (Staff Leader)
                          </span>
                        )}
                        {(emp.role === 'staff' || !emp.role) && (
                          <span className="text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full text-[10px] border border-sky-200">
                            👤 일반 직원 (Staff)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-black text-purple-900">
                        <span className="bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg">
                          🔒 {empPin}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-stone-600 font-mono">
                        {emp.phone ? formatUSPhone(emp.phone) : '-'}
                      </td>

                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded-lg text-stone-600 hover:text-amber-800 hover:bg-amber-50 transition-colors"
                          title="수정"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => triggerDelete(emp)}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 직원 수정 모달 */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/50 backdrop-blur-xs">
          <form onSubmit={triggerUpdate} className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h4 className="text-sm font-extrabold text-stone-900 flex items-center gap-1.5">
                <Edit className="w-4 h-4 text-purple-700" />
                {language === 'ko' ? '직원 정보 수정' : 'Edit Staff Info'}
              </h4>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">직원 성함</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">직책 / 권한</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900"
                >
                  <option value="staff">일반 직원 (Staff)</option>
                  <option value="leader">스태프 리더 (Staff Leader)</option>
                  <option value="manager">총괄 매니저 (Manager)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-purple-900 mb-1">4자리 PIN Number</label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  value={editPinCode}
                  onChange={(e) => setEditPinCode(e.target.value)}
                  className="w-full bg-purple-50 border border-purple-200 text-purple-950 font-mono font-black rounded-xl px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">연락처</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatUSPhone(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 text-xs font-bold"
              >
                {language === 'ko' ? '취소' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-purple-700 text-white text-xs font-bold shadow-sm"
              >
                {language === 'ko' ? '수정 완료' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PIN 인증 모달 */}
      <PinAuthModal
        isOpen={pinModalOpen}
        actionTitle={pendingAction?.title || 'PIN 번호 인증'}
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setPinModalOpen(false)
          setPendingAction(null)
        }}
      />
    </div>
  )
}
