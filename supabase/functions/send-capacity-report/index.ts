import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.91.1'

type AdminClassSummary = {
  class_id: string
  class_name: string
  student_count: number
}

type AdminSummary = {
  admin_id: string
  user_id: string
  admin_name: string
  admin_email: string | null
  class_count: number
  classes: AdminClassSummary[]
}

type Snapshot = {
  generated_at: string
  database_used_bytes: number
  file_storage_used_bytes: number
  admin_count: number
  class_count: number
  student_count: number
  admins: AdminSummary[]
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const REPORT_RECIPIENT_EMAIL = Deno.env.get('REPORT_RECIPIENT_EMAIL') ?? '9003755@qq.com'
const REPORT_FROM_EMAIL = Deno.env.get('REPORT_FROM_EMAIL') ?? ''
const REPORT_DATABASE_TOTAL_MB = Number(Deno.env.get('REPORT_DATABASE_TOTAL_MB') ?? '500')
const REPORT_FILE_STORAGE_TOTAL_MB = Number(Deno.env.get('REPORT_FILE_STORAGE_TOTAL_MB') ?? '1024')
const REPORT_ESTIMATED_FILE_MB_PER_STUDENT = Number(
  Deno.env.get('REPORT_ESTIMATED_FILE_MB_PER_STUDENT') ?? '30'
)

const bytesToMb = (value: number) => Number((value / 1024 / 1024).toFixed(2))

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const formatAdminSectionText = (admins: AdminSummary[]) => {
  if (admins.length === 0) return '暂无管理员数据'

  return admins
    .map((admin, index) => {
      const classesText = admin.classes.length === 0
        ? '  - 当前无班级'
        : admin.classes
            .map((item) => `  - ${item.class_name}: ${item.student_count} 名学生`)
            .join('\n')

      return `${index + 1}. ${admin.admin_name}${admin.admin_email ? ` (${admin.admin_email})` : ''}\n   班级数量：${admin.class_count}\n${classesText}`
    })
    .join('\n\n')
}

const formatAdminSectionHtml = (admins: AdminSummary[]) => {
  if (admins.length === 0) {
    return '<p>暂无管理员数据</p>'
  }

  return admins
    .map((admin, index) => {
      const classesHtml = admin.classes.length === 0
        ? '<li>当前无班级</li>'
        : admin.classes
            .map(
              (item) =>
                `<li>${escapeHtml(item.class_name)}：${item.student_count} 名学生</li>`
            )
            .join('')

      return `
        <li style="margin-bottom: 12px;">
          <strong>${index + 1}. ${escapeHtml(admin.admin_name)}</strong>
          ${admin.admin_email ? `(${escapeHtml(admin.admin_email)})` : ''}
          <div>班级数量：${admin.class_count}</div>
          <ul>${classesHtml}</ul>
        </li>
      `
    })
    .join('')
}

const buildEmailContent = (snapshot: Snapshot) => {
  const databaseUsedMb = bytesToMb(snapshot.database_used_bytes)
  const fileStorageUsedMb = bytesToMb(snapshot.file_storage_used_bytes)
  const databaseRemainingMb = Math.max(REPORT_DATABASE_TOTAL_MB - databaseUsedMb, 0)
  const fileStorageRemainingMb = Math.max(REPORT_FILE_STORAGE_TOTAL_MB - fileStorageUsedMb, 0)
  const estimatedStudentsRemaining =
    REPORT_ESTIMATED_FILE_MB_PER_STUDENT > 0
      ? Math.floor(fileStorageRemainingMb / REPORT_ESTIMATED_FILE_MB_PER_STUDENT)
      : 0

  const subjectDate = new Date(snapshot.generated_at).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })

  const text = [
    `学员报名系统容量巡检报告`,
    `生成时间：${subjectDate}`,
    ``,
    `一、容量概览`,
    `数据库总容量：${REPORT_DATABASE_TOTAL_MB} MB`,
    `数据库已用：${databaseUsedMb} MB`,
    `数据库剩余：${databaseRemainingMb} MB`,
    `文件存储总容量：${REPORT_FILE_STORAGE_TOTAL_MB} MB`,
    `文件存储已用：${fileStorageUsedMb} MB`,
    `文件存储剩余：${fileStorageRemainingMb} MB`,
    `按 3 张图片/学员（约 ${REPORT_ESTIMATED_FILE_MB_PER_STUDENT} MB/学员）估算，剩余文件存储还能注册 ${estimatedStudentsRemaining} 个学员`,
    ``,
    `二、系统规模`,
    `管理员总数：${snapshot.admin_count}`,
    `班级总数：${snapshot.class_count}`,
    `学生总数：${snapshot.student_count}`,
    ``,
    `三、管理员与班级明细`,
    formatAdminSectionText(snapshot.admins),
  ].join('\n')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2>学员报名系统容量巡检报告</h2>
      <p>生成时间：${escapeHtml(subjectDate)}</p>

      <h3>一、容量概览</h3>
      <ul>
        <li>数据库总容量：${REPORT_DATABASE_TOTAL_MB} MB</li>
        <li>数据库已用：${databaseUsedMb} MB</li>
        <li>数据库剩余：${databaseRemainingMb} MB</li>
        <li>文件存储总容量：${REPORT_FILE_STORAGE_TOTAL_MB} MB</li>
        <li>文件存储已用：${fileStorageUsedMb} MB</li>
        <li>文件存储剩余：${fileStorageRemainingMb} MB</li>
        <li>按 3 张图片/学员（约 ${REPORT_ESTIMATED_FILE_MB_PER_STUDENT} MB/学员）估算，剩余文件存储还能注册 ${estimatedStudentsRemaining} 个学员</li>
      </ul>

      <h3>二、系统规模</h3>
      <ul>
        <li>管理员总数：${snapshot.admin_count}</li>
        <li>班级总数：${snapshot.class_count}</li>
        <li>学生总数：${snapshot.student_count}</li>
      </ul>

      <h3>三、管理员与班级明细</h3>
      <ol>
        ${formatAdminSectionHtml(snapshot.admins)}
      </ol>
    </div>
  `

  return {
    subject: `学员报名系统容量巡检报告 - ${subjectDate}`,
    text,
    html,
  }
}

const sendEmail = async (payload: { subject: string; html: string; text: string }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: REPORT_FROM_EMAIL,
      to: [REPORT_RECIPIENT_EMAIL],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Resend 发信失败：${response.status} ${errorText}`)
  }

  return await response.json()
}

const assertEnv = () => {
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['RESEND_API_KEY', RESEND_API_KEY],
    ['REPORT_FROM_EMAIL', REPORT_FROM_EMAIL],
  ].filter(([, value]) => !value)

  if (missing.length > 0) {
    throw new Error(`缺少环境变量：${missing.map(([name]) => name).join(', ')}`)
  }
}

Deno.serve(async () => {
  try {
    assertEnv()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data, error } = await supabase.rpc('get_capacity_report_snapshot')
    if (error) {
      throw new Error(`获取容量快照失败：${error.message}`)
    }

    const snapshot = data as Snapshot
    const emailContent = buildEmailContent(snapshot)
    const resendResult = await sendEmail(emailContent)

    return new Response(
      JSON.stringify(
        {
          success: true,
          recipient: REPORT_RECIPIENT_EMAIL,
          subject: emailContent.subject,
          resend: resendResult,
        },
        null,
        2
      ),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        },
        null,
        2
      ),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
