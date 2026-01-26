import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { NATIONS, ETHNICITIES, ID_TYPES, ADDRESSES } from '../lib/constants'
import { useNavigate } from 'react-router-dom'
import { Upload, ChevronDown, Calendar, Search } from 'lucide-react'

// UI Components - Defined OUTSIDE the main component to prevent re-mounting on every render
const SectionTitle = ({ title }) => (
  <div className="flex items-center mb-6">
    <div className="w-1.5 h-6 bg-blue-600 mr-3 rounded-full"></div>
    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
  </div>
)

const InputField = ({ label, name, type = "text", placeholder, required = false, colSpan = 1, icon: Icon, register, errors }) => (
  <div className={`${colSpan === 2 ? 'col-span-1 md:col-span-2' : 'col-span-1'}`}>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <input
        type={type}
        {...register(name, { required: required && `${label}不能为空` })}
        placeholder={placeholder}
        className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
      />
      {Icon && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
          <Icon size={18} />
        </div>
      )}
    </div>
    {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name].message}</p>}
  </div>
)

const SelectField = ({ label, name, options, required = false, register, errors }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <select
        {...register(name, { required: required && `${label}不能为空` })}
        className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
      >
        <option value="">请选择</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
        <ChevronDown size={18} />
      </div>
    </div>
    {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name].message}</p>}
  </div>
)

const DateSelector = ({ label, name, required = false, register, setValue, watch, errors }) => {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 80 }, (_, i) => currentYear - i) // 最近80年
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const dateValue = watch(name)
  
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  useEffect(() => {
    if (dateValue) {
      const date = new Date(dateValue)
      if (!isNaN(date.getTime())) {
        setYear(date.getFullYear())
        setMonth(date.getMonth() + 1)
        setDay(date.getDate())
      }
    }
  }, [dateValue])

  const daysInMonth = useMemo(() => {
    if (!year || !month) return 31
    return new Date(year, month, 0).getDate()
  }, [year, month])

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const updateDate = (newYear, newMonth, newDay) => {
    if (newYear) setYear(newYear)
    if (newMonth) setMonth(newMonth)
    if (newDay) setDay(newDay)

    const y = newYear || year
    const m = newMonth || month
    const d = newDay || day

    if (y && m && d) {
      const str = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      setValue(name, str, { shouldValidate: true, shouldDirty: true })
    }
  }

  return (
    <div className="col-span-1 md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="grid grid-cols-3 gap-2">
        <div className="relative">
          <select
            value={year}
            onChange={(e) => updateDate(Number(e.target.value), null, null)}
            className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          >
            <option value="">年</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="relative">
          <select
            value={month}
            onChange={(e) => updateDate(null, Number(e.target.value), null)}
            className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          >
            <option value="">月</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="relative">
          <select
            value={day}
            onChange={(e) => updateDate(null, null, Number(e.target.value))}
            className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          >
            <option value="">日</option>
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
            <ChevronDown size={14} />
          </div>
        </div>
      </div>
      <input type="hidden" {...register(name, { required: required && `${label}不能为空` })} />
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name].message}</p>}
    </div>
  )
}

export default function StudentProfile({ classId, onSuccess }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [classInfo, setClassInfo] = useState(null)
  const { register, handleSubmit, setValue, formState: { errors }, watch } = useForm({
    defaultValues: {
      nationality: '中国',
      ethnicity: '',
      id_type: '身份证',
      region: ''
    }
  })
  
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState({ type: '', content: '' })
  const [profileId, setProfileId] = useState(null)
  
  // Search state for address
  const [showAddressList, setShowAddressList] = useState(false)
  const [addressSearch, setAddressSearch] = useState('')
  const regionValue = watch('region')

  // Filter addresses
  const filteredAddresses = useMemo(() => {
    if (!addressSearch) return []
    return ADDRESSES.filter(addr => addr.includes(addressSearch)).slice(0, 20)
  }, [addressSearch])

  // Fetch existing profile and class info
  useEffect(() => {
    if (!user) return

    const getProfile = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') throw error
        
        if (data) {
          setProfileId(data.id)
          Object.keys(data).forEach(key => {
            setValue(key, data[key])
          })
          if (data.region) setAddressSearch(data.region)
        } else {
          // 如果数据库中没有档案，尝试从本地缓存恢复草稿 (防止手机端刷新导致数据丢失)
          const draft = localStorage.getItem(`student_profile_draft_${user.id}`)
          if (draft) {
            try {
              const parsed = JSON.parse(draft)
              Object.keys(parsed).forEach(key => {
                // 跳过文件对象（无法序列化）
                if (key !== 'idCardFront' && key !== 'idCardBack' && key !== 'photo') {
                  setValue(key, parsed[key])
                }
              })
              if (parsed.region) setAddressSearch(parsed.region)
              // 如果有草稿，提示用户
              setMsg({ type: 'success', content: '已为您恢复上次未提交的填写记录' })
            } catch (e) {
              console.error('Failed to restore draft', e)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }

    const getClassInfo = async () => {
      if (!classId) return
      const { data, error } = await supabase
        .from('classes')
        .select('name')
        .eq('id', classId)
        .single()
      
      if (data) setClassInfo(data)
    }

    getProfile()
    getClassInfo()
  }, [user, setValue, classId])

  // 自动保存草稿
  useEffect(() => {
    if (!user) return
    const subscription = watch((value) => {
      // 仅保存非文件字段
      const draft = { ...value }
      delete draft.idCardFront
      delete draft.idCardBack
      delete draft.photo
      localStorage.setItem(`student_profile_draft_${user.id}`, JSON.stringify(draft))
    })
    return () => subscription.unsubscribe()
  }, [watch, user])

  const uploadFile = async (file, path) => {
    try {
      if (!file) return null
      
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${path}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('student-documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('student-documents')
        .getPublicUrl(filePath)

      return data.publicUrl
    } catch (error) {
      console.error('Error uploading file:', error)
      throw error
    }
  }

  const onSubmit = async (data) => {
    try {
      setLoading(true)
      setMsg({ type: '', content: '' })

      let photoUrl = data.photo_url
      let frontUrl = data.id_card_front_url
      let backUrl = data.id_card_back_url

      if (data.photo?.[0]) {
        setUploading(true)
        photoUrl = await uploadFile(data.photo[0], `photos/${user.id}`)
      }
      if (data.idCardFront?.[0]) {
        setUploading(true)
        frontUrl = await uploadFile(data.idCardFront[0], `id-front/${user.id}`)
      }
      if (data.idCardBack?.[0]) {
        setUploading(true)
        backUrl = await uploadFile(data.idCardBack[0], `id-back/${user.id}`)
      }

      setUploading(false)

      const profileData = {
        user_id: user.id,
        real_name: data.real_name,
        gender: data.gender,
        birth_date: data.birth_date,
        nationality: data.nationality,
        ethnicity: data.ethnicity,
        id_type: data.id_type,
        id_number: data.id_number,
        contact_phone: data.contact_phone,
        postal_code: data.postal_code,
        region: data.region,
        address_detail: data.address_detail,
        emergency_contact: data.emergency_contact, // Optional
        emergency_phone: data.emergency_phone,     // Optional
        photo_url: photoUrl,
        id_card_front_url: frontUrl,
        id_card_back_url: backUrl,
        email_contact: data.email_contact,         // Optional
        updated_at: new Date().toISOString()
      }

      let error
      let savedProfileId = profileId

      if (profileId) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', profileId)
        error = updateError
      } else {
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert([profileData])
          .select()
          .single()
        error = insertError
        if (newProfile) savedProfileId = newProfile.id
      }

      if (error) throw error

      // If enrolling in a class
      if (classId && savedProfileId) {
        // Check if already enrolled first to avoid error
        const { data: existing } = await supabase
          .from('enrollments')
          .select('id')
          .eq('user_id', user.id)
          .eq('class_id', classId)
          .single()

        if (!existing) {
          const { error: enrollError } = await supabase
            .from('enrollments')
            .insert([{
              user_id: user.id,
              class_id: classId,
              profile_id: savedProfileId,
              status: 'pending'
            }])
          
          if (enrollError) throw enrollError
        }
        
        // 提交成功，清除草稿
        localStorage.removeItem(`student_profile_draft_${user.id}`)
        
        setMsg({ type: 'success', content: '报名成功！即将跳转...' })
        // Use a longer timeout and ensure state update is processed
        setTimeout(() => {
           if (onSuccess) {
             onSuccess()
           } else {
             navigate(`/enroll/${classId}`, { replace: true }) 
           }
        }, 1500)
      } else {
        // 保存成功，清除草稿
        localStorage.removeItem(`student_profile_draft_${user.id}`)
        
        setMsg({ type: 'success', content: '档案保存成功！' })
        setTimeout(() => {
          navigate('/')
        }, 1500)
      }

    } catch (error) {
      console.error('Error saving profile:', error)
      setMsg({ type: 'error', content: '保存失败：' + error.message })
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  // Handle Validation Errors
  const onError = (errors) => {
    const missingFields = Object.values(errors).map(err => err.message).join('\n')
    // Use setTimeout to ensure alert doesn't block UI update cycle which might cause focus issues
    setTimeout(() => {
        alert(`请完善以下必填项：\n${missingFields}`)
    }, 0)
    
    // Also show message at top
    setMsg({ type: 'error', content: `请完善以下必填项` })
    window.scrollTo(0, 0)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-center text-gray-800 mb-10 tracking-tight">
          {classInfo ? (
            <>
              <span className="block text-lg font-medium text-blue-600 mb-2">您正在报名：{classInfo.name}</span>
              完善资料以完成报名
            </>
          ) : '学员档案'}
        </h1>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <form onSubmit={handleSubmit(onSubmit, onError)} className="p-8 space-y-10">
            {msg.content && (
              <div className={`p-4 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {msg.content}
              </div>
            )}

            {/* Basic Info */}
            <section>
              <SectionTitle title="基本信息" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <InputField label="姓名" name="real_name" placeholder="请输入姓名" required register={register} errors={errors} />
                <SelectField label="性别" name="gender" options={['男', '女']} required register={register} errors={errors} />
                <DateSelector label="出生日期" name="birth_date" required register={register} setValue={setValue} watch={watch} errors={errors} />
                <SelectField label="国籍" name="nationality" options={NATIONS} required register={register} errors={errors} />
                <SelectField label="民族" name="ethnicity" options={ETHNICITIES} required register={register} errors={errors} />
              </div>
            </section>

            {/* ID Info */}
            <section>
              <SectionTitle title="证件信息" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <SelectField label="证件类型" name="id_type" options={ID_TYPES} required register={register} errors={errors} />
                <InputField label="证件号码" name="id_number" placeholder="请输入证件号码" required register={register} errors={errors} />
              </div>
            </section>

            {/* Contact Info */}
            <section>
              <SectionTitle title="联系方式" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <InputField label="联系电话" name="contact_phone" placeholder="请输入11位手机号" required register={register} errors={errors} />
                <InputField label="邮箱" name="email_contact" placeholder="example@email.com" required register={register} errors={errors} />
                <InputField label="邮政编码" name="postal_code" placeholder="请输入邮政编码" required register={register} errors={errors} />
                
                {/* Address Search Field */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    地址 (省/市/区) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={addressSearch}
                      onChange={(e) => {
                        setAddressSearch(e.target.value)
                        setShowAddressList(true)
                        setValue('region', '') // Clear value when typing
                      }}
                      onFocus={() => setShowAddressList(true)}
                      placeholder="如：北京市"
                      className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                    />
                     <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                      <Search size={18} />
                    </div>
                  </div>
                  {/* Custom Dropdown */}
                  {showAddressList && addressSearch && filteredAddresses.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto mt-1">
                      {filteredAddresses.map((addr, idx) => (
                        <li 
                          key={idx}
                          onClick={() => {
                            setValue('region', addr)
                            setAddressSearch(addr)
                            setShowAddressList(false)
                          }}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700"
                        >
                          {addr}
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Hidden input to hold the actual form value for validation */}
                  <input type="hidden" {...register('region', { required: '地址不能为空' })} />
                  {errors.region && <p className="text-red-500 text-xs mt-1">{errors.region.message}</p>}
                </div>

                <InputField label="详细地址" name="address_detail" placeholder="请输入详细地址（街道/门牌号）" required colSpan={2} register={register} errors={errors} />
              </div>
            </section>

             {/* Uploads (Keep existing logic but refine style if needed, kept simple for now) */}
             <section>
              <SectionTitle title="资料上传" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ID Front */}
                <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                  <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  <label className="block text-sm font-medium text-gray-700 mb-1">身份证正面 <span className="text-red-500">*</span></label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    {...register('idCardFront', { 
                      required: !profileId && '请上传身份证正面',
                      validate: {
                        fileSize: files => !files?.[0] || files[0].size < 10 * 1024 * 1024 || '图片大小不能超过10MB'
                      }
                    })} 
                  />
                   {watch('id_card_front_url') && <p className="text-xs text-green-600 mt-2 z-10">已上传</p>}
                   {watch('idCardFront')?.[0]?.name && <p className="text-xs text-gray-600 mt-2 z-10">{watch('idCardFront')[0].name}</p>}
                   {errors.idCardFront && <p className="text-red-500 text-xs mt-1 z-10">{errors.idCardFront.message}</p>}
                </div>
                {/* ID Back */}
                 <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                  <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  <label className="block text-sm font-medium text-gray-700 mb-1">身份证反面 <span className="text-red-500">*</span></label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    {...register('idCardBack', { 
                      required: !profileId && '请上传身份证反面',
                      validate: {
                        fileSize: files => !files?.[0] || files[0].size < 10 * 1024 * 1024 || '图片大小不能超过10MB'
                      }
                    })} 
                  />
                   {watch('id_card_back_url') && <p className="text-xs text-green-600 mt-2 z-10">已上传</p>}
                   {watch('idCardBack')?.[0]?.name && <p className="text-xs text-gray-600 mt-2 z-10">{watch('idCardBack')[0].name}</p>}
                   {errors.idCardBack && <p className="text-red-500 text-xs mt-1 z-10">{errors.idCardBack.message}</p>}
                </div>
                 {/* Photo */}
                 <div className="relative md:col-span-2 border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                  <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  <label className="block text-sm font-medium text-gray-700 mb-1">一寸白底证件照 <span className="text-red-500">*</span></label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    {...register('photo', { 
                      required: !profileId && '请上传证件照',
                      validate: {
                        fileSize: files => !files?.[0] || files[0].size < 10 * 1024 * 1024 || '图片大小不能超过10MB'
                      }
                    })} 
                  />
                   {watch('photo_url') && <p className="text-xs text-green-600 mt-2 z-10">已上传</p>}
                   {watch('photo')?.[0]?.name && <p className="text-xs text-gray-600 mt-2 z-10">{watch('photo')[0].name}</p>}
                   {errors.photo && <p className="text-red-500 text-xs mt-1 z-10">{errors.photo.message}</p>}
                </div>
              </div>
             </section>

            <div className="pt-6">
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full bg-blue-600 text-white font-bold py-3.5 px-4 rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-lg"
              >
                {loading || uploading ? '提交中...' : (classId ? '提交并报名' : '保存档案')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
