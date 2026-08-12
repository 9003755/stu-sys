import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.91.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const bucket = 'class-submission-documents'
const normalizeName = (value: string) => value.trim().replace(/\s+/g, '').toLocaleLowerCase('zh-CN')

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Only POST is supported' }, { status: 405, headers: corsHeaders })
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Service is not configured')
    const form = await request.formData()
    const accessToken = String(form.get('accessToken') ?? '')
    const submittedName = String(form.get('studentName') ?? '').trim()
    const criminalRecord = form.get('criminalRecord')
    const healthDeclaration = form.get('healthDeclaration')
    const files = [criminalRecord, healthDeclaration]
    if (!accessToken || !submittedName || !files.every((file) => file instanceof File)) {
      return Response.json({ error: '请填写姓名并提交两份图片资料' }, { status: 400, headers: corsHeaders })
    }
    if (!files.every((file) => file instanceof File && file.type.startsWith('image/') && file.size > 0 && file.size <= 12 * 1024 * 1024)) {
      return Response.json({ error: '仅支持 12MB 以内的图片文件' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: collection, error: collectionError } = await supabase.from('class_document_collections').select('class_id').eq('access_token', accessToken).single()
    if (collectionError || !collection) return Response.json({ error: '二维码无效，请联系管理员' }, { status: 404, headers: corsHeaders })

    const nameKey = normalizeName(submittedName)
    const { data: candidates, error: matchError } = await supabase.from('enrollments').select('id, profiles!inner(real_name)').eq('class_id', collection.class_id)
    if (matchError) throw matchError
    const matches = (candidates ?? []).filter((item) => normalizeName(item.profiles.real_name) === nameKey)
    const enrollmentId = matches.length === 1 ? matches[0].id : null
    const submissionId = crypto.randomUUID()
    const criminalPath = `${collection.class_id}/${submissionId}/criminal-record.jpg`
    const healthPath = `${collection.class_id}/${submissionId}/health-declaration.jpg`
    const [criminalUpload, healthUpload] = await Promise.all([
      supabase.storage.from(bucket).upload(criminalPath, criminalRecord as File, { contentType: 'image/jpeg' }),
      supabase.storage.from(bucket).upload(healthPath, healthDeclaration as File, { contentType: 'image/jpeg' }),
    ])
    if (criminalUpload.error || healthUpload.error) {
      await supabase.storage.from(bucket).remove([criminalPath, healthPath])
      throw criminalUpload.error ?? healthUpload.error
    }

    const { data: replacement, error: replaceError } = await supabase.rpc('replace_class_document_submission', {
      target_id: submissionId,
      target_class_id: collection.class_id,
      target_enrollment_id: enrollmentId,
      target_submitted_name: submittedName,
      target_name_key: nameKey,
      target_criminal_record_path: criminalPath,
      target_health_declaration_path: healthPath,
    })
    if (replaceError) {
      await supabase.storage.from(bucket).remove([criminalPath, healthPath])
      throw replaceError
    }
    const replacedPaths = Array.isArray(replacement?.replaced_paths) ? replacement.replaced_paths.filter(Boolean) : []
    if (replacedPaths.length) await supabase.storage.from(bucket).remove(replacedPaths)
    return Response.json({ success: true, status: replacement.status }, { headers: corsHeaders })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '上传失败，请稍后重试' }, { status: 500, headers: corsHeaders })
  }
})
