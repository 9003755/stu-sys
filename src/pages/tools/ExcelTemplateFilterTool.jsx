import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCcw, Upload } from 'lucide-react'
import {
  analyzeSourceWorkbook,
  buildOutputFileName,
  generateWorkbookFromTemplate,
  readTemplateHeadersFromUrl,
} from '../../lib/excelTemplateFilter'

function HeaderTagList({ items, emptyText, tone = 'neutral' }) {
  const toneClassMap = {
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  if (!items.length) {
    return <p className="text-sm text-gray-500">{emptyText}</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.normalizedHeader || item.displayHeader}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${toneClassMap[tone]}`}
        >
          {item.displayHeader}
        </span>
      ))}
    </div>
  )
}

export default function ExcelTemplateFilterTool() {
  const [templateHeaders, setTemplateHeaders] = useState([])
  const [sourceFile, setSourceFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loadingTemplate, setLoadingTemplate] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const loadTemplateHeaders = async () => {
      try {
        setLoadingTemplate(true)
        setError('')
        const headers = await readTemplateHeadersFromUrl('/stuIm.xlsx')
        setTemplateHeaders(headers)
      } catch (err) {
        setError(err.message || '读取模板失败')
      } finally {
        setLoadingTemplate(false)
      }
    }

    loadTemplateHeaders()
  }, [])

  const matchedCount = analysis?.matchedHeaders.length || 0
  const missingCount = analysis?.missingTemplateHeaders.length || 0
  const extraCount = analysis?.extraSourceHeaders.length || 0

  const canGenerate = useMemo(() => {
    return Boolean(sourceFile) && !loadingTemplate && !analyzing && !generating
  }, [sourceFile, loadingTemplate, analyzing, generating])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    setSuccessMessage('')
    setError('')
    setAnalysis(null)

    if (!file) {
      setSourceFile(null)
      return
    }

    setSourceFile(file)
    setAnalyzing(true)

    try {
      const result = await analyzeSourceWorkbook(file, templateHeaders)
      setAnalysis(result)
    } catch (err) {
      setSourceFile(null)
      setError(err.message || '分析源 Excel 失败')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerate = async () => {
    if (!sourceFile) return

    setGenerating(true)
    setError('')
    setSuccessMessage('')

    try {
      const result = await generateWorkbookFromTemplate({
        sourceFile,
        templateUrl: '/stuIm.xlsx',
      })

      const blob = new Blob([result.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = buildOutputFileName(sourceFile.name)
      link.click()
      URL.revokeObjectURL(url)

      setSuccessMessage(`已生成新 Excel，共输出 ${result.outputRowCount} 条记录。`)
    } catch (err) {
      setError(err.message || '生成 Excel 失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleReset = () => {
    setSourceFile(null)
    setAnalysis(null)
    setError('')
    setSuccessMessage('')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                独立工具页
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Excel 模板筛列工具</h1>
                <p className="mt-2 max-w-3xl text-gray-600">
                  上传一个包含学员报名信息的 Excel，系统会自动只保留模板
                  `stuIm.xlsx` 中定义的列，并输出一个新的 Excel 文件。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/stuIm.xlsx"
                download="stuIm.xlsx"
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <FileSpreadsheet size={16} className="mr-2" />
                下载模板
              </a>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <RefreshCcw size={16} className="mr-2" />
                重新开始
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">操作步骤</h2>
              {loadingTemplate && (
                <div className="inline-flex items-center text-sm text-gray-500">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  读取模板中...
                </div>
              )}
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                1. 点击“选择 Excel 文件”上传源表。
                <br />
                2. 系统自动对比模板列与源表列。
                <br />
                3. 点击“生成新 Excel”下载整理后的结果文件。
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50">
                <Upload size={28} className="mb-3 text-blue-600" />
                <span className="text-base font-medium text-gray-900">选择 Excel 文件</span>
                <span className="mt-1 text-sm text-gray-500">支持 `.xlsx`，默认读取第一个工作表</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={loadingTemplate || analyzing || generating}
                />
              </label>

              {sourceFile && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">当前文件</p>
                      <p className="font-medium text-gray-900">{sourceFile.name}</p>
                    </div>
                    {analyzing && (
                      <div className="inline-flex items-center text-sm text-gray-500">
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        正在分析表头...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {generating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Download size={18} className="mr-2" />}
                {generating ? '正在生成...' : '生成新 Excel'}
              </button>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="flex items-start">
                    <AlertCircle size={18} className="mr-2 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {successMessage && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  <div className="flex items-start">
                    <CheckCircle2 size={18} className="mr-2 mt-0.5 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">模板列</h2>
              <p className="mt-2 text-sm text-gray-500">
                当前固定使用系统内置模板 `stuIm.xlsx` 的第一行作为目标列。
              </p>
              <div className="mt-5">
                <HeaderTagList
                  items={templateHeaders}
                  emptyText={loadingTemplate ? '正在加载模板列...' : '未读取到模板列'}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">对比结果</h2>

              {!analysis ? (
                <p className="mt-3 text-sm text-gray-500">上传源 Excel 后，这里会显示列匹配情况。</p>
              ) : (
                <div className="mt-5 space-y-6">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                      <p className="text-sm text-green-700">已匹配列</p>
                      <p className="mt-2 text-2xl font-bold text-green-900">{matchedCount}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm text-amber-700">模板缺失列</p>
                      <p className="mt-2 text-2xl font-bold text-amber-900">{missingCount}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-600">源表多余列</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{extraCount}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-900">将会保留的列</h3>
                    <div className="mt-3">
                      <HeaderTagList
                        items={analysis.matchedHeaders}
                        emptyText="没有找到可匹配的列"
                        tone="success"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-900">模板中存在，但源表缺失的列</h3>
                    <div className="mt-3">
                      <HeaderTagList
                        items={analysis.missingTemplateHeaders}
                        emptyText="源表已覆盖全部模板列"
                        tone="warning"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-900">源表中会被自动忽略的列</h3>
                    <div className="mt-3">
                      <HeaderTagList
                        items={analysis.extraSourceHeaders}
                        emptyText="源表没有多余列"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
