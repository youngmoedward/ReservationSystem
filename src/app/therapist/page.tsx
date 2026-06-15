'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import TherapistManager from '@/components/admin/TherapistManager'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Therapist } from '@/components/dashboard/CalendarView'
import { useLanguage } from '@/app/LanguageContext'

export default function TherapistPage() {
  const supabase = createClient()
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useLanguage()

  const fetchTherapists = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('therapists')
        .select('*')
        .order('id', { ascending: true })

      if (error) throw error
      if (data) setTherapists(data as Therapist[])
    } catch (err) {
      console.error('Fetch therapists error in page:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTherapists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-900/60">
          <h2 className="text-sm font-bold text-slate-400">⚙️ {t('therapist.title')}</h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-500 animate-pulse font-medium">
            {t('user.syncing')}
          </div>
        ) : (
          <TherapistManager
            supabase={supabase}
            therapists={therapists}
            onRefresh={fetchTherapists}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
